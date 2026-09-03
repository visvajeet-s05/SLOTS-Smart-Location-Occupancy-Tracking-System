import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function reset() {
  console.log('Fixing wrongfully promoted ACTIVE bookings that have NO linked payment confirmation...')
  
  const badBookings = await prisma.booking.findMany({
    where: {
      status: 'ACTIVE',
    }
  });
  console.log(`Found ${badBookings.length} ACTIVE bookings. Scanning for phantom checkouts...`);
  
  const payments = await prisma.payment.findMany({
    where: { status: 'COMPLETED' }
  });
  
  const paidBookingIds = payments.map(p => p.bookingId);
  
  let fixedCount = 0;
  for (const b of badBookings) {
    if (!paidBookingIds.includes(b.id)) {
      await prisma.booking.update({
        where: { id: b.id },
        data: { status: 'CANCELLED' }
      });
      if (b.slotId) {
        await prisma.slot.update({
          where: { id: b.slotId },
          data: { status: 'AVAILABLE' }
        });
      }
      fixedCount++;
      console.log(`Cleaned up ghost duplicate booking: ${b.id} and freed its slot.`);
    }
  }
  
  console.log(`Done. Fixed ${fixedCount} bookings.`);
}

reset().finally(() => prisma.$disconnect());
