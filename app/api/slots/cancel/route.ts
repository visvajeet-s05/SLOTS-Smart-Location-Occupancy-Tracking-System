import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { slot_status, slot_updatedBy } from '@prisma/client';

/**
 * POST /api/slots/cancel
 * 
 * Cancel a booking. Transitions: RESERVED → AVAILABLE
 * 
 * Body: {
 *   booking_id: string,
 *   slot_id: string (optional — resolved from booking if missing)
 * }
 * 
 * Rules:
 *  - Only UPCOMING/ACTIVE bookings can be cancelled
 *  - Slot transitions from RESERVED → AVAILABLE
 *  - Broadcasts AVAILABLE status via WebSocket
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { booking_id, slot_id } = body;

    if (!booking_id) {
      return NextResponse.json(
        { error: 'Missing required field: booking_id' },
        { status: 400 }
      );
    }

    // 1. Fetch booking
    const booking = await prisma.booking.findUnique({
      where: { id: booking_id },
      include: {
        slot: { select: { id: true, lotId: true, slotNumber: true, status: true } }
      }
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // 2. Check cancellability
    if (booking.status !== 'UPCOMING' && booking.status !== 'ACTIVE') {
      return NextResponse.json(
        { 
          error: `Booking is ${booking.status} — only UPCOMING or ACTIVE bookings can be cancelled`,
          current_status: booking.status
        },
        { status: 409 }
      );
    }

    // 3. Resolve slot
    const resolvedSlotId = slot_id || booking.slotId;
    if (!resolvedSlotId) {
      return NextResponse.json(
        { error: 'No slot associated with this booking' },
        { status: 400 }
      );
    }

    // 4. Cancel booking + release slot in transaction
    const [cancelledBooking, updatedSlot] = await prisma.$transaction([
      prisma.booking.update({
        where: { id: booking_id },
        data: { status: 'CANCELLED' }
      }),
      prisma.slot.update({
        where: { id: resolvedSlotId },
        data: {
          status: 'AVAILABLE' as any,
          updatedBy: 'CUSTOMER' as any,
          aiConfidence: 100,
        }
      })
    ]);

    // 5. Log status change
    await (prisma as any).slotstatuslog.create({
      data: {
        slotId: resolvedSlotId,
        oldStatus: booking.slot?.status || 'RESERVED',
        newStatus: 'AVAILABLE',
        updatedBy: 'CUSTOMER',
        aiConfidence: 100,
      }
    });

    // 6. Broadcast via WebSocket
    const lotId = booking.slot?.lotId || booking.parkingLotId;
    broadcastSlotUpdate(lotId, {
      type: 'SLOT_UPDATE',
      lotId,
      slotId: resolvedSlotId,
      slotNumber: booking.slot?.slotNumber,
      status: 'AVAILABLE',
      source: 'CUSTOMER',
      reason: 'BOOKING_CANCELLED',
      bookingId: booking_id,
    });

    return NextResponse.json({
      success: true,
      booking: {
        id: booking_id,
        status: 'CANCELLED',
      },
      slot: {
        id: resolvedSlotId,
        state: 'AVAILABLE',
        last_updated: new Date().toISOString(),
      }
    });

  } catch (error: any) {
    console.error('[SLOT_CANCEL] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}


function broadcastSlotUpdate(lotId: string, data: any) {
  try {
    const wsPort = process.env.WS_PORT || '4000';
    const wsUrl = process.env.WS_SERVER_URL || `http://localhost:${wsPort}`;
    fetch(`${wsUrl}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});
  } catch { /* graceful degradation */ }
}
