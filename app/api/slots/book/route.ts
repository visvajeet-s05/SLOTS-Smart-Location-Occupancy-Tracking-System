import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { slot_status, slot_updatedBy } from '@prisma/client';

/**
 * POST /api/slots/book
 * 
 * Book a parking slot. Transitions: AVAILABLE → RESERVED
 * 
 * Body: {
 *   slot_id: string,
 *   user_id: string,
 *   duration_hours?: number (default 2),
 *   vehicle_type?: string (default "Car")
 * }
 * 
 * Rules:
 *  - Only AVAILABLE slots can be booked
 *  - Prevents double booking
 *  - Auto-expires after 15 minutes if car doesn't arrive
 *  - Broadcasts RESERVED status via WebSocket
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slot_id, user_id, duration_hours = 2, vehicle_type = 'Car' } = body;

    // Validate required fields
    if (!slot_id || !user_id) {
      return NextResponse.json(
        { error: 'Missing required fields: slot_id, user_id' },
        { status: 400 }
      );
    }

    // 1. Fetch slot with parking lot info
    const slot = await (prisma as any).slot.findUnique({
      where: { id: slot_id },
      include: {
        parkinglot: {
          include: {
            ownerprofile: { select: { userId: true } }
          }
        },
        bookings: {
          where: {
            status: { in: ['UPCOMING', 'ACTIVE'] }
          }
        }
      }
    });

    if (!slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
    }

    // 2. ONLY AVAILABLE slots can be booked
    if (slot.status !== 'AVAILABLE') {
      return NextResponse.json(
        { 
          error: `Slot is ${slot.status} — only AVAILABLE slots can be booked`,
          current_status: slot.status
        },
        { status: 409 }
      );
    }

    // 3. Prevent double booking
    if (slot.bookings && slot.bookings.length > 0) {
      return NextResponse.json(
        { error: 'Slot already has an active booking' },
        { status: 409 }
      );
    }

    // 4. Validate user exists
    const user = await prisma.user.findUnique({
      where: { id: user_id },
      select: { id: true, name: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 5. Get owner ID
    const ownerId = slot.parkinglot?.ownerId || slot.parkinglot?.ownerprofile?.userId || 'SYSTEM';

    // 6. Create booking + update slot in a transaction
    const now = new Date();
    const expiryTime = new Date(now.getTime() + 15 * 60 * 1000); // 15 min expiry
    const endTime = new Date(now.getTime() + duration_hours * 60 * 60 * 1000);
    const bookingId = `BK-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const [booking, updatedSlot] = await prisma.$transaction([
      // Create booking record
      prisma.booking.create({
        data: {
          id: bookingId,
          customerId: user_id,
          ownerId: ownerId,
          parkingLotId: slot.lotId,
          slotId: slot_id,
          startTime: now,
          endTime: endTime,
          amount: 0, // Will be calculated on confirm
          vehicleType: vehicle_type,
          status: 'UPCOMING',
        }
      }),
      // Transition slot: AVAILABLE → RESERVED
      prisma.slot.update({
        where: { id: slot_id },
        data: {
          status: 'RESERVED' as any,
          updatedBy: 'BOOKING' as any,
          aiConfidence: 100,
        }
      })
    ]);

    // 7. Create status log
    await (prisma as any).slotstatuslog.create({
      data: {
        slotId: slot_id,
        oldStatus: 'AVAILABLE',
        newStatus: 'RESERVED',
        updatedBy: 'BOOKING',
        aiConfidence: 100,
      }
    });

    // 8. Broadcast via WebSocket
    broadcastSlotUpdate(slot.lotId, {
      type: 'SLOT_UPDATE',
      lotId: slot.lotId,
      slotId: slot_id,
      slotNumber: slot.slotNumber,
      status: 'RESERVED',
      source: 'BOOKING',
      bookingId: booking.id,
    });

    // 9. Schedule auto-expiry (15 min)
    scheduleBookingExpiry(slot_id, booking.id, expiryTime);

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        slot_id: slot_id,
        user_id: user_id,
        status: 'ACTIVE',
        start_time: now.toISOString(),
        expiry_time: expiryTime.toISOString(),
        end_time: endTime.toISOString(),
      },
      slot: {
        id: slot_id,
        state: 'RESERVED',
        last_updated: new Date().toISOString(),
      }
    });

  } catch (error: any) {
    console.error('[SLOT_BOOK] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}


// ── Helpers ──────────────────────────────────────────────────────

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

function scheduleBookingExpiry(slotId: string, bookingId: string, expiryTime: Date) {
  const delay = expiryTime.getTime() - Date.now();
  if (delay > 0) {
    setTimeout(async () => {
      try {
        // Check if slot is still RESERVED (car hasn't arrived)
        const slot = await prisma.slot.findUnique({ where: { id: slotId } });
        if (slot && slot.status === 'RESERVED') {
          // Auto-expire: RESERVED → AVAILABLE
          await prisma.slot.update({
            where: { id: slotId },
            data: {
              status: SlotStatus.AVAILABLE,
              updatedBy: UpdatedBy.SYSTEM,
              aiConfidence: 100,
            }
          });

          await prisma.slotStatusLog.create({
            data: {
              slotId,
              oldStatus: SlotStatus.RESERVED,
              newStatus: SlotStatus.AVAILABLE,
              updatedBy: UpdatedBy.SYSTEM,
              aiConfidence: 100,
            }
          });

          // Cancel booking
          await prisma.booking.update({
            where: { id: bookingId },
            data: { status: 'CANCELLED' }
          });

          // Find lotId for broadcast
          const updatedSlot = await prisma.slot.findUnique({
            where: { id: slotId },
            select: { lotId: true, slotNumber: true }
          });

          if (updatedSlot) {
            broadcastSlotUpdate(updatedSlot.lotId, {
              type: 'SLOT_UPDATE',
              lotId: updatedSlot.lotId,
              slotId,
              slotNumber: updatedSlot.slotNumber,
              status: 'AVAILABLE',
              source: 'SYSTEM',
              reason: 'BOOKING_EXPIRED',
            });
          }

          console.log(`[EXPIRY] Booking ${bookingId} expired — slot ${slotId} → AVAILABLE`);
        }
      } catch (err) {
        console.error('[EXPIRY] Error:', err);
      }
    }, delay);
  }
}
