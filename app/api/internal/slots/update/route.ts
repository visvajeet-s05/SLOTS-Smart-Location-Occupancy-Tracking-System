import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { slot_status, slot_updatedBy } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (!text) return NextResponse.json({ error: 'Empty request body' }, { status: 400 });

    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { lotId, slots } = body;

    if (!lotId || !Array.isArray(slots)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Get current slots for this lot
    const existingSlots = await prisma.slot.findMany({
      where: { lotId },
      include: {
        bookings: {
          where: { status: { in: ['UPCOMING', 'ACTIVE'] } }
        }
      }
    });

    const slotMap = new Map(existingSlots.map(s => [s.slotNumber, s]));
    const updatesToBroadcast: any[] = [];
    const results = { updated: 0, skipped: 0, errors: [] as string[] };

    // Prepare updates
    const updatePromises = slots.map(async (slotData: any) => {
      const { number: slotNumber, status: newStatus } = slotData;

      const statusEnum = mapStatusToEnum(newStatus);
      if (!statusEnum) return; // Skip invalid status

      const existingSlot = slotMap.get(slotNumber);
      if (!existingSlot) return;

      // Status Logic
      let finalStatus: slot_status = statusEnum;

      // AI Logic: AI says AVAILABLE, but we check reservations
      if (statusEnum === 'AVAILABLE') {
        if (existingSlot.status === 'DISABLED' || existingSlot.status === 'CLOSED') {
          finalStatus = existingSlot.status;
        } else if (existingSlot.bookings.length > 0) {
          finalStatus = 'RESERVED';
        }
      }

      // Also, if AI says 'OCCUPIED' but strict reservation rules apply?
      // For now, trust AI 'OCCUPIED' as truth (someone parked there).

      if (existingSlot.status === finalStatus) {
        results.skipped++;
        return;
      }

      try {
        // Update DB
        const updatedSlot = await prisma.slot.update({
          where: { id: existingSlot.id },
          data: {
            status: finalStatus,
            updatedBy: 'AI',
            aiConfidence: 95.0,
          },
        });

        // Log
        await (prisma as any).slotstatuslog.create({
          data: {
            slotId: existingSlot.id,
            oldStatus: existingSlot.status,
            newStatus: finalStatus,
            updatedBy: 'AI',
            aiConfidence: 95.0,
          },
        });

        results.updated++;

        // Add to broadcast list
        updatesToBroadcast.push({
          type: 'SLOT_UPDATE',
          lotId: lotId,
          slotId: existingSlot.id,
          slotNumber: slotNumber,
          status: finalStatus,
          confidence: 95.0,
          source: 'AI',
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        // results.errors.push(...) // simplified
      }
    });

    // Run all DB updates in parallel
    await Promise.all(updatePromises);

    // Send ONE bulk message to WS Server if there are updates
    if (updatesToBroadcast.length > 0) {
      broadcastBulkUpdate(lotId, updatesToBroadcast);
    }

    return NextResponse.json({ success: true, lotId, results });

  } catch (error) {
    console.error('Error updating slots:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
  return statusMap[status.toUpperCase()] || null;
}

function broadcastBulkUpdate(lotId: string, updates: any[]) {
  try {
    const wsPort = process.env.WS_PORT || '4000';
    fetch(`http://localhost:${wsPort}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'BULK_SLOT_UPDATE',
        lotId,
        updates // Array of individual update objects
      }),
    }).catch(() => { });
  } catch { }
}
