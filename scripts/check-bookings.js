const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function checkBookings() {
  try {
    console.log('📋 Checking current bookings...')

    const bookings = await prisma.booking.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'UPCOMING']
        }
      },
      include: {
        slot: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    console.log(`Found ${bookings.length} active/upcoming bookings:`)

    bookings.forEach((booking, index) => {
      console.log(`\n${index + 1}. Booking ID: ${booking.id}`)
      console.log(`   Slot: ${booking.slot?.slotNumber} (${booking.slotId})`)
      console.log(`   Status: ${booking.status}`)
      console.log(`   Start Time: ${booking.startTime}`)
      console.log(`   End Time: ${booking.endTime}`)
      console.log(`   Created: ${booking.createdAt}`)
      console.log(`   Vehicle: ${booking.vehicleType}`)
    })

    if (bookings.length === 0) {
      console.log('No active or upcoming bookings found.')
    }

  } catch (error) {
    console.error('❌ Error checking bookings:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkBookings()