/**
 * B28: Concurrency Constraint Tests
 * Tests for MySQL-compatible overlap prevention mechanism
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

describe('B28: Concurrency Constraint Tests', () => {
  let testSlotId
  let testCustomerId
  let testOwnerId
  let testParkingLotId

  beforeAll(async () => {
    // Setup test data
    const user = await prisma.user.create({
      data: {
        email: 'test-concurrency@example.com',
        role: 'CUSTOMER',
        passwordHash: 'test_hash'
      }
    })
    testCustomerId = user.id

    const owner = await prisma.user.create({
      data: {
        email: 'test-owner-concurrency@example.com',
        role: 'OWNER',
        passwordHash: 'test_hash'
      }
    })
    testOwnerId = owner.id

    const parkingLot = await prisma.parkinglot.create({
      data: {
        id: 'test-concurrency-lot-' + Date.now(),
        ownerId: testOwnerId,
        name: 'Test Concurrency Lot',
        address: '123 Test St',
        lat: 13.0827,
        lng: 80.2707,
        status: 'ACTIVE',
        timezone: 'Asia/Kolkata'
      }
    })
    testParkingLotId = parkingLot.id

    const slot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 1,
        status: 'AVAILABLE',
        row: 'A',
        displayName: 'A01'
      }
    })
    testSlotId = slot.id
  })

  afterAll(async () => {
    // Cleanup test data in correct order to handle foreign key constraints
    await prisma.booking.deleteMany({
      where: { customerId: testCustomerId }
    })
    await prisma.slot.deleteMany({
      where: { lotId: testParkingLotId }
    })
    await prisma.parkinglot.delete({
      where: { id: testParkingLotId }
    })
    await prisma.user.deleteMany({
      where: { 
        id: { in: [testCustomerId, testOwnerId] }
      }
    })
    await prisma.$disconnect()
  })

  test('should prevent overlapping bookings on same slot', async () => {
    const baseTime = new Date()
    const startTime = new Date(baseTime.getTime() + 2 * 60 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000)

    // Create first booking
    const firstBooking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        startTime,
        endTime,
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(firstBooking).toBeDefined()
    expect(firstBooking.id).toBeDefined()

    // Attempt to create overlapping booking (should fail)
    const overlappingStart = new Date(startTime.getTime() + 30 * 60 * 1000)
    const overlappingEnd = new Date(overlappingStart.getTime() + 2 * 60 * 60 * 1000)

    await expect(
      prisma.booking.create({
        data: {
          customerId: testCustomerId,
          ownerId: testOwnerId,
          parkingLotId: testParkingLotId,
          slotId: testSlotId,
          status: 'CONFIRMED',
          startTime: overlappingStart,
          endTime: overlappingEnd,
          amount: 100,
          vehicleType: 'CAR'
        }
      })
    ).rejects.toThrow()

    // Cleanup
    await prisma.booking.delete({ where: { id: firstBooking.id } })
  })

  test('should allow back-to-back bookings (exact end = start)', async () => {
    const baseTime = new Date()
    const firstStart = new Date(baseTime.getTime() + 2 * 60 * 60 * 1000)
    const firstEnd = new Date(firstStart.getTime() + 2 * 60 * 60 * 1000)
    const secondStart = new Date(firstEnd)
    const secondEnd = new Date(secondStart.getTime() + 2 * 60 * 60 * 1000)

    // Create first booking
    const firstBooking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        startTime: firstStart,
        endTime: firstEnd,
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    // Create second back-to-back booking (should succeed)
    const secondBooking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        startTime: secondStart,
        endTime: secondEnd,
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(secondBooking).toBeDefined()
    expect(secondBooking.id).toBeDefined()

    // Cleanup
    await prisma.booking.deleteMany({
      where: { id: { in: [firstBooking.id, secondBooking.id] } }
    })
  })

  test('should allow non-overlapping bookings on different slots', async () => {
    // Create second slot
    const secondSlot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 2,
        status: 'AVAILABLE',
        row: 'A',
        displayName: 'A02'
      }
    })

    const baseTime = new Date()
    const startTime = new Date(baseTime.getTime() + 2 * 60 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000)

    // Create booking on first slot
    const firstBooking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        startTime,
        endTime,
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    // Create overlapping booking on different slot (should succeed)
    const secondBooking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: secondSlot.id,
        status: 'CONFIRMED',
        startTime,
        endTime,
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(secondBooking).toBeDefined()
    expect(secondBooking.id).toBeDefined()

    // Cleanup
    await prisma.booking.deleteMany({
      where: { id: { in: [firstBooking.id, secondBooking.id] } }
    })
    await prisma.slot.delete({ where: { id: secondSlot.id } })
  })

  test('should prevent concurrent overlapping booking attempts', async () => {
    const baseTime = new Date()
    const startTime = new Date(baseTime.getTime() + 2 * 60 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000)

    // Attempt to create two bookings simultaneously
    const bookingPromises = [
      prisma.booking.create({
        data: {
          customerId: testCustomerId,
          ownerId: testOwnerId,
          parkingLotId: testParkingLotId,
          slotId: testSlotId,
          status: 'CONFIRMED',
          startTime,
          endTime,
          amount: 100,
          vehicleType: 'CAR'
        }
      }),
      prisma.booking.create({
        data: {
          customerId: testCustomerId,
          ownerId: testOwnerId,
          parkingLotId: testParkingLotId,
          slotId: testSlotId,
          status: 'CONFIRMED',
          startTime,
          endTime,
          amount: 100,
          vehicleType: 'CAR'
        }
      })
    ]

    const results = await Promise.allSettled(bookingPromises)

    // Exactly one should succeed, one should fail
    const successful = results.filter(r => r.status === 'fulfilled')
    const failed = results.filter(r => r.status === 'rejected')

    expect(successful.length).toBe(1)
    expect(failed.length).toBe(1)

    // Cleanup successful booking
    if (successful[0].status === 'fulfilled') {
      await prisma.booking.delete({
        where: { id: successful[0].value.id }
      })
    }
  })
})