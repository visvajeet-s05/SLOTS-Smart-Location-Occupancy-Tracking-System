import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { slot_status } from '@prisma/client';

/**
 * Secure Edge Data Ingestion API
 * Used by Edge Nodes (Python AI services) to:
 *   - Send heartbeat pings (slots: [])
 *   - Update slot statuses
 *   - Report camera URL (cameraUrl field)
 *   - Report public tunnel URL (tunnelUrl field)
 */
export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text();
    if (!rawText) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }
    const body = JSON.parse(rawText);
    const { lotId, edgeNodeId, edgeToken, slots, cameraUrl, tunnelUrl } = body;

    if (!lotId || !edgeToken || !edgeNodeId || !Array.isArray(slots)) {
      return NextResponse.json(
        { error: 'Missing required fields: lotId, edgeNodeId, edgeToken, slots' },
        { status: 400 }
      );
    }

    // 1. Authenticate Edge Node
    const parkingLot = await prisma.parkinglot.findFirst({
      where: {
        id: lotId,
        edgeNodeId: edgeNodeId,
        edgeToken: edgeToken,
      }
    });

    if (!parkingLot) {
      console.error(`[Edge Auth] Failed: lotId=${lotId} edgeNodeId=${edgeNodeId}`);
      return NextResponse.json(
        { error: 'Authentication failed: Invalid lotId, edgeNodeId or edgeToken' },
        { status: 401 }
      );
    }

    // 2. Update Heartbeat + optional camera/tunnel URL
    const updateData: any = { lastHeartbeat: new Date() };
    if (cameraUrl && typeof cameraUrl === 'string') {
      updateData.cameraUrl = cameraUrl;
      console.log(`[Edge] Camera URL updated for ${lotId}: ${cameraUrl}`);
    }
    // Tunnel URL removed to prevent Prisma Unknown Column 'ddnsDomain' 500 crashes on Railway.


    await prisma.parkinglot.update({
      where: { id: lotId },
      data: updateData
    });

    // 3. If no slot updates, return heartbeat ACK immediately
    if (slots.length === 0) {
      return NextResponse.json({
        success: true,
        lotId,
        edgeNodeId,
        results: { updated: 0, skipped: 0, errors: 0 },
        lastHeartbeat: new Date().toISOString()
      });
    }

    // 4. Process Slot Updates
    const existingSlots = await prisma.slot.findMany({
      where: { lotId },
      include: {
        bookings: {
          where: { status: { in: ['UPCOMING', 'ACTIVE'] } },
          select: { id: true, status: true }
        }
      }
    });

    const slotMap = new Map(existingSlots.map(s => [s.slotNumber, s]));
    const updatesToBroadcast: any[] = [];
    const results = { updated: 0, skipped: 0, errors: 0 };

    for (const slotData of slots) {
      try {
        const { number: slotNumber, status: newStatus, confidence = 95.0 } = slotData;

        if (slotNumber == null || !newStatus) {
          results.errors++;
          continue;
        }

        const mappedStatus = mapStatusToEnum(newStatus);
        if (!mappedStatus) {
          results.errors++;
          continue;
        }

        const existingSlot = slotMap.get(slotNumber);
        if (!existingSlot) {
          results.errors++;
          continue;
        }

        // ── BOOKING-AWARE STATE DECISION ENGINE ──
        let finalStatus: slot_status = mappedStatus;

        // PRIORITY RULE: Car detected (OCCUPIED) → ALWAYS OCCUPIED
        if (mappedStatus === 'OCCUPIED') {
          finalStatus = 'OCCUPIED';
        }
        // No car detected — apply booking-aware logic
        else if (mappedStatus === 'AVAILABLE') {
          // Preserve admin-set states (DISABLED/CLOSED)
          if (existingSlot.status === 'DISABLED' || existingSlot.status === 'CLOSED') {
            finalStatus = existingSlot.status;
          }
          // Check for active bookings → RESERVED
          else if (existingSlot.bookings && existingSlot.bookings.length > 0) {
            finalStatus = 'RESERVED';
          }
          // No booking, no car → AVAILABLE
          else {
            finalStatus = 'AVAILABLE';
          }
        }

        // Validate state transition
        if (!isValidTransition(existingSlot.status, finalStatus)) {
          results.skipped++;
          continue;
        }

        // Skip if no change
        if (existingSlot.status === finalStatus) {
          results.skipped++;
          continue;
        }

        // Update DB
        await prisma.slot.update({
          where: { id: existingSlot.id },
          data: {
            status: finalStatus,
            updatedBy: 'AI',
            aiConfidence: confidence,
          },
        });

        // Audit log
        await (prisma as any).slotstatuslog.create({
          data: {
            slotId: existingSlot.id,
            oldStatus: existingSlot.status,
            newStatus: finalStatus,
            updatedBy: 'AI',
            aiConfidence: confidence,
          },
        });

        results.updated++;

        updatesToBroadcast.push({
          type: 'SLOT_UPDATE',
          lotId,
          slotId: existingSlot.id,
          slotNumber,
          status: finalStatus,
          oldStatus: existingSlot.status,
          confidence,
          source: 'AI',
          timestamp: new Date().toISOString(),
        });
      } catch (slotErr: any) {
        console.error(`[Edge] Slot update error:`, slotErr.message);
        results.errors++;
      }
    }

    // 5. WebSocket Broadcast (non-blocking)
    if (updatesToBroadcast.length > 0) {
      broadcastBulkUpdate(lotId, updatesToBroadcast);
    }

    return NextResponse.json({
      success: true,
      lotId,
      edgeNodeId,
      results,
      lastHeartbeat: new Date().toISOString()
    });

  } catch (error: any) {
    // Safe console-only logging (no fs in Next.js API routes)
    console.error('[Edge Update] Internal error:', error?.message, error?.stack);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

function mapStatusToEnum(status: string): SlotStatus | null {
  const statusMap: Record<string, SlotStatus> = {
    'EMPTY': 'AVAILABLE',
    'OCCUPIED': 'OCCUPIED',
    'AVAILABLE': 'AVAILABLE',
    'RESERVED': 'RESERVED',
    'DISABLED': 'DISABLED',
    'CLOSED': 'CLOSED',
  };
  return statusMap[status?.toUpperCase?.()] ?? null;
}

function isValidTransition(current: SlotStatus, target: SlotStatus): boolean {
  const VALID: Record<string, Set<string>> = {
    'AVAILABLE': new Set(['RESERVED', 'OCCUPIED']),
    'RESERVED':  new Set(['OCCUPIED', 'AVAILABLE']),
    'OCCUPIED':  new Set(['AVAILABLE', 'RESERVED']), // Allow returning to RESERVED if car leaves
    'DISABLED':  new Set([]),             // Admin-only states
    'CLOSED':    new Set([]),             // Admin-only states
  };
  return current === target || (VALID[current]?.has(target) ?? false);
}

function broadcastBulkUpdate(lotId: string, updates: any[]) {
  try {
    const wsPort = process.env.WS_PORT || '4000';
    const wsUrl = process.env.WS_SERVER_URL || `http://localhost:${wsPort}`;
    fetch(`${wsUrl}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'BULK_SLOT_UPDATE', lotId, updates }),
    }).catch(() => { /* WS server may not be running — graceful degradation */ });
  } catch { /* ignore */ }
}
