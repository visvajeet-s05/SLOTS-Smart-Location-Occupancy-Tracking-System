const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkSlots() {
  try {
    const slots = await prisma.slot.findMany({
      take: 10,
      select: { id: true, status: true, slotNumber: true, displayName: true }
    })
    console.log('Sample slots:')
    console.table(slots)
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkSlots()