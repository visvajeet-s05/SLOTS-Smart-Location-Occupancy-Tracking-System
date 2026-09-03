import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SlotStatus, UpdatedBy } from '@prisma/client';

/**
 * POST /api/slots/update-detection
 * 
 * Receives AI detection results and updates slot states.
 * Uses the booking-aware state decision engine.
 * 
 * Body: {
 *   lotId: string,
 *   edgeNodeId: string,
 *   edgeToken: string,
 *   cameraId: string, // Optional: identifies which camera made the detection
 *   zoneCode: string, // Optional: zone filter for multi-camera setups
 *   detections: [
 *     { slot_id: string, car_detected: boolean, confidence: number }
 *   ]
 * }
 * 
 * State Decision Engine:
 *   car_detected=true  → OCCUPIED (highest priority)
 *   car_detected=false + booking → RESERVED
 *   car_detected=false + no booking → AVAILABLE
 * 
 * Forbidden transition: OCCUPIED → RESERVED (blocked)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lotId, edgeNodeId, edgeToken, cameraId, zoneCode, detections } = body;

    if (!lotId || !edgeNodeId || !edgeToken || !Array.isArray(detections)) {
      return NextResponse.json(
        { error: 'Missing required fields: lotId, edgeNodeId, edgeToken, detections[]' },
        { status: 400 }
      );
    }

    // Verify camera belongs to this lot if cameraId is provided
    if (cameraId) {
      const camera = await prisma.camera.findFirst({
        where: {
          id: cameraId,
          lotId
        }
      });

      if (!camera) {
        return NextResponse.json(
          { error: 'Camera not found in this parking lot' },
          { status: 404 }
        );
      }
    }

    // 1. Authenticate edge node
    const parkingLot = await prisma.parkinglot.findFirst({
      where: {
        id: lotId,
        edgeNodeId,
        edgeToken,
      }
    });

    if (!parkingLot) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // 2. Fetch all slots with active bookings (optionally filtered by zone)
    const whereClause: any = { lotId };
    if (zoneCode) {
      whereClause.zoneCode = zoneCode;
    }

    const allSlots = await prisma.slot.findMany({
      where: whereClause,
      include: {
        bookings: {
          where: {
            status: { in: ['UPCOMING', 'ACTIVE'] },
            endTime: { gte: new Date() }
          },
          select: { id: true, status: true }
        }
      }
    });

    const slotMap = new Map(allSlots.map(s => [s.id, s]));
    const updatesToBroadcast: any[] = [];
    const results = { updated: 0, skipped: 0, errors: 0 };

    // 3. Process each detection
    for (const det of detections) {
      try {
        const { slot_id, car_detected, confidence = 95.0 } = det;

        if (!slot_id) {
          results.errors++;
          continue;
        }

        const existingSlot = slotMap.get(slot_id);
        if (!existingSlot) {
          results.errors++;
          continue;
        }

        // ── STATE DECISION ENGINE ──
        let newStatus: SlotStatus;
        const hasBooking = existingSlot.bookings && existingSlot.bookings.length > 0;

        if (car_detected && confidence >= 0.5) {
          // PRIORITY RULE: Car detected → ALWAYS OCCUPIED
          newStatus = 'OCCUPIED';
        } else if (hasBooking) {
          // No car detected, but booking exists → RESERVED
          newStatus = 'RESERVED';
        } else {
          // No car, no booking → AVAILABLE
          newStatus = 'AVAILABLE';
        }

        // Preserve admin-set states
        if (existingSlot.status === 'DISABLED' || existingSlot.status === 'CLOSED') {
          newStatus = existingSlot.status;
        }

        // Validate transition
        if (!isValidTransition(existingSlot.status, newStatus)) {
          results.skipped++;
          continue;
        }

        // Skip if no change
        if (existingSlot.status === newStatus) {
          results.skipped++;
          continue;
        }

        // 4. Update DB
        await prisma.slot.update({
          where: { id: slot_id },
          data: {
            status: newStatus,
            updatedBy: 'AI',
            aiConfidence: confidence,
          }
        });

        // Audit log
        await prisma.slotStatusLog.create({
          data: {
            slotId: slot_id,
            oldStatus: existingSlot.status,
            newStatus: newStatus,
            updatedBy: 'AI',
            aiConfidence: confidence,
          }
        });

        results.updated++;

        updatesToBroadcast.push({
          type: 'SLOT_UPDATE',
          lotId,
          slotId: slot_id,
          slotNumber: existingSlot.slotNumber,
          status: newStatus,
          oldStatus: existingSlot.status,
          confidence,
          source: 'AI',
          car_detected,
          cameraId: cameraId || null,
          zoneCode: zoneCode || existingSlot.zoneCode,
          timestamp: new Date().toISOString(),
        });
      } catch (detErr: any) {
        console.error('[Detection] Slot update error:', detErr.message);
        results.errors++;
      }
    }

    // 5. Broadcast all updates
    if (updatesToBroadcast.length > 0) {
      broadcastBulkUpdate(lotId, updatesToBroadcast);
    }

    return NextResponse.json({
      success: true,
      lotId,
      cameraId: cameraId || null,
      zoneCode: zoneCode || null,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[UPDATE_DETECTION] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}


// ── State Transition Validation ──────────────────────────────────

function isValidTransition(current: SlotStatus, target: SlotStatus): boolean {
  const VALID: Record<string, Set<string>> = {
    'AVAILABLE': new Set(['RESERVED', 'OCCUPIED']),
    'RESERVED':  new Set(['OCCUPIED', 'AVAILABLE']),
    'OCCUPIED':  new Set(['AVAILABLE']),  // OCCUPIED → RESERVED is BLOCKED
    'DISABLED':  new Set([]),
    'CLOSED':    new Set([]),
  };
  return VALID[current]?.has(target) ?? false;
}


function broadcastBulkUpdate(lotId: string, updates: any[]) {
  try {
    const wsPort = process.env.WS_PORT || '4000';
    const wsUrl = process.env.WS_SERVER_URL || `http://localhost:${wsPort}`;
    fetch(`${wsUrl}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'BULK_SLOT_UPDATE', lotId, updates }),
    }).catch(() => {});
  } catch { /* ignore */ }
}
