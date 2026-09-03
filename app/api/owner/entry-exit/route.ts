import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookingId, action } = await request.json(); // action: 'entry' or 'exit'

    if (!bookingId || !action) {
      return NextResponse.json({ error: 'Booking ID and action are required' }, { status: 400 });
    }

    // Verify the booking belongs to this owner
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { parkinglot: true },
    });

    if (!booking || booking.parkinglot.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Booking not found or unauthorized' }, { status: 404 });
    }

    // For now, just return success. In a real implementation, this would
    // integrate with parking gate systems, QR code validation, etc.
    return NextResponse.json({
      message: `${action} recorded successfully`,
      bookingId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error processing entry/exit:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
