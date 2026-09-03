import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedTestVehicles() {
  try {
    console.log('🔍 Finding user with email visvajeet@gmail.com...')
    
    const user = await prisma.user.findUnique({
      where: { email: 'visvajeet@gmail.com' }
    })

    if (!user) {
      console.error('❌ User not found with email visvajeet@gmail.com')
      process.exit(1)
    }

    console.log('✅ User found:', user.id, user.name)

    // Check existing vehicles
    const existingVehicles = await prisma.vehicle.findMany({
      where: { userId: user.id }
    })

    console.log('📦 Existing vehicles:', existingVehicles.length)

    if (existingVehicles.length > 0) {
      console.log('ℹ️  User already has vehicles. Skipping seed.')
      console.log('Existing vehicles:', existingVehicles)
      process.exit(0)
    }

    // Create test vehicles
    console.log('🚗 Creating test vehicles...')

    const vehicle1 = await prisma.vehicle.create({
      data: {
        userId: user.id,
        make: 'Toyota',
        model: 'Fortuner',
        licensePlate: 'TN-01-AB-1234',
        color: 'White',
        isActive: true
      }
    })

    console.log('✅ Created vehicle 1:', vehicle1.licensePlate)

    const vehicle2 = await prisma.vehicle.create({
      data: {
        userId: user.id,
        make: 'Hyundai',
        model: 'Verna',
        licensePlate: 'TN-07-CD-5678',
        color: 'Silver',
        isActive: false
      }
    })

    console.log('✅ Created vehicle 2:', vehicle2.licensePlate)

    // Verify
    const allVehicles = await prisma.vehicle.findMany({
      where: { userId: user.id }
    })

    console.log('✅ Total vehicles for user:', allVehicles.length)
    console.log('🚗 Vehicles:', allVehicles.map(v => `${v.make} ${v.model} (${v.licensePlate})`))

    console.log('✅ Test vehicles seeded successfully!')
  } catch (error) {
    console.error('❌ Error seeding vehicles:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

seedTestVehicles()