const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function cleanupTestBookings() {
  try {
    console.log('🧹 Cleaning up test bookings...')

    // Delete bookings that are older than 1 hour and not active
    const result = await prisma.booking.deleteMany({
      where: {
        OR: [
          { status: 'UPCOMING' },
          { status: 'ACTIVE' }
        ],
        createdAt: {
          lt: new Date(Date.now() - 60 * 60 * 1000) // Older than 1 hour
        }
      }
    })

    console.log(`✅ Deleted ${result.count} old test bookings`)

    // Also update slot status to AVAILABLE for any slots that were held by deleted bookings
    const slots = await prisma.slot.findMany({
      where: {
        status: {
          in: ['CLOSED', 'DISABLED']
        }
      }
    })

    for (const slot of slots) {
      await prisma.slot.update({
        where: { id: slot.id },
        data: { status: 'AVAILABLE' }
      })
    }

    console.log(`✅ Reset ${slots.length} slots to AVAILABLE status`)

  } catch (error) {
    console.error('❌ Error cleaning up bookings:', error)
  } finally {
    await prisma.$disconnect()
  }
}

cleanupTestBookings()