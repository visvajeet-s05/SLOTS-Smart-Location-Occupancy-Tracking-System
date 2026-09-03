const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function clearAllBookings() {
  try {
    console.log('🧹 Clearing all bookings...')

    // Delete all bookings (active, upcoming, completed, etc.)
    const result = await prisma.booking.deleteMany({})

    console.log(`✅ Deleted ${result.count} bookings`)

    // Also delete all payments
    const paymentResult = await prisma.payment.deleteMany({})
    console.log(`✅ Deleted ${paymentResult.count} payments`)

    // Reset all slots to AVAILABLE
    const slots = await prisma.slot.findMany()

    for (const slot of slots) {
      await prisma.slot.update({
        where: { id: slot.id },
        data: { status: 'AVAILABLE' }
      })
    }

    console.log(`✅ Reset ${slots.length} slots to AVAILABLE status`)

    console.log('✅ All bookings and payments cleared successfully!')

  } catch (error) {
    console.error('❌ Error clearing bookings:', error)
  } finally {
    await prisma.$disconnect()
  }
}

clearAllBookings()