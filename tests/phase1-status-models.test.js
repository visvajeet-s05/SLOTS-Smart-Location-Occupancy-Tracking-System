/**
 * B8 & B9: Status Model Tests
 * Tests for booking status model (B8) and slot status model (B9)
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

describe('B8: Booking Status Model Tests', () => {
  let testCustomerId
  let testOwnerId
  let testParkingLotId
  let testSlotId

  beforeAll(async () => {
    // Setup test data
    const user = await prisma.user.create({
      data: {
        email: 'test-booking-status@example.com',
        role: 'CUSTOMER',
        passwordHash: 'test_hash'
      }
    })
    testCustomerId = user.id

    const owner = await prisma.user.create({
      data: {
        email: 'test-owner-status@example.com',
        role: 'OWNER',
        passwordHash: 'test_hash'
      }
    })
    testOwnerId = owner.id

    const parkingLot = await prisma.parkinglot.create({
      data: {
        id: 'test-status-lot-' + Date.now(),
        ownerId: testOwnerId,
        name: 'Test Status Lot',
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

  test('should create booking with PENDING_PAYMENT status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'PENDING_PAYMENT',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('PENDING_PAYMENT')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with HELD status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'HELD',
        lockExpiresAt: new Date(Date.now() + 300000),
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('HELD')
    expect(booking.lockExpiresAt).toBeDefined()
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with CONFIRMED status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('CONFIRMED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with ACTIVE status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'ACTIVE',
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('ACTIVE')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with COMPLETED status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'COMPLETED',
        startTime: new Date(Date.now() - 7200000),
        endTime: new Date(Date.now() - 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('COMPLETED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with CANCELLED status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CANCELLED',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('CANCELLED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with CANCELLED_BY_OPERATOR status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CANCELLED_BY_OPERATOR',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('CANCELLED_BY_OPERATOR')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with NO_SHOW status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'NO_SHOW',
        startTime: new Date(Date.now() - 7200000),
        endTime: new Date(Date.now() - 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('NO_SHOW')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with EXPIRED status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'EXPIRED',
        startTime: new Date(Date.now() - 7200000),
        endTime: new Date(Date.now() - 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('EXPIRED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with OVERSTAY status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'OVERSTAY',
        startTime: new Date(Date.now() - 7200000),
        endTime: new Date(Date.now() - 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('OVERSTAY')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with PAYMENT_FAILED status', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'PAYMENT_FAILED',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.status).toBe('PAYMENT_FAILED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })
})

describe('B9: Slot Status Model Tests', () => {
  let testOwnerId
  let testParkingLotId

  beforeAll(async () => {
    // Setup test data
    const owner = await prisma.user.create({
      data: {
        email: 'test-slot-status@example.com',
        role: 'OWNER',
        passwordHash: 'test_hash'
      }
    })
    testOwnerId = owner.id

    const parkingLot = await prisma.parkinglot.create({
      data: {
        id: 'test-slot-status-lot-' + Date.now(),
        ownerId: testOwnerId,
        name: 'Test Slot Status Lot',
        address: '123 Test St',
        lat: 13.0827,
        lng: 80.2707,
        status: 'ACTIVE',
        timezone: 'Asia/Kolkata'
      }
    })
    testParkingLotId = parkingLot.id
  })

  afterAll(async () => {
    // Cleanup test data in correct order to handle foreign key constraints
    await prisma.slot.deleteMany({
      where: { lotId: testParkingLotId }
    })
    await prisma.parkinglot.delete({
      where: { id: testParkingLotId }
    })
    await prisma.user.deleteMany({
      where: { id: testOwnerId }
    })
    await prisma.$disconnect()
  })

  test('should create slot with AVAILABLE status', async () => {
    const slot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 1,
        status: 'AVAILABLE',
        row: 'A',
        displayName: 'A01'
      }
    })

    expect(slot.status).toBe('AVAILABLE')
    await prisma.slot.delete({ where: { id: slot.id } })
  })

  test('should create slot with HELD status', async () => {
    const slot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 2,
        status: 'HELD',
        row: 'A',
        displayName: 'A02'
      }
    })

    expect(slot.status).toBe('HELD')
    await prisma.slot.delete({ where: { id: slot.id } })
  })

  test('should create slot with RESERVED status', async () => {
    const slot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 3,
        status: 'RESERVED',
        row: 'A',
        displayName: 'A03'
      }
    })

    expect(slot.status).toBe('RESERVED')
    await prisma.slot.delete({ where: { id: slot.id } })
  })

  test('should create slot with OCCUPIED status', async () => {
    const slot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 4,
        status: 'OCCUPIED',
        row: 'A',
        displayName: 'A04'
      }
    })

    expect(slot.status).toBe('OCCUPIED')
    await prisma.slot.delete({ where: { id: slot.id } })
  })

  test('should create slot with BLOCKED status', async () => {
    const slot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 5,
        status: 'BLOCKED',
        row: 'A',
        displayName: 'A05'
      }
    })

    expect(slot.status).toBe('BLOCKED')
    await prisma.slot.delete({ where: { id: slot.id } })
  })

  test('should create slot with MAINTENANCE status', async () => {
    const slot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 6,
        status: 'MAINTENANCE',
        row: 'A',
        displayName: 'A06'
      }
    })

    expect(slot.status).toBe('MAINTENANCE')
    await prisma.slot.delete({ where: { id: slot.id } })
  })

  test('should create slot with MAINTENANCE_PENDING status', async () => {
    const slot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 7,
        status: 'MAINTENANCE_PENDING',
        row: 'A',
        displayName: 'A07'
      }
    })

    expect(slot.status).toBe('MAINTENANCE_PENDING')
    await prisma.slot.delete({ where: { id: slot.id } })
  })
})

describe('B34a: Occupancy State Tests', () => {
  let testCustomerId
  let testOwnerId
  let testParkingLotId
  let testSlotId

  beforeAll(async () => {
    // Setup test data
    const user = await prisma.user.create({
      data: {
        email: 'test-occupancy@example.com',
        role: 'CUSTOMER',
        passwordHash: 'test_hash'
      }
    })
    testCustomerId = user.id

    const owner = await prisma.user.create({
      data: {
        email: 'test-owner-occupancy@example.com',
        role: 'OWNER',
        passwordHash: 'test_hash'
      }
    })
    testOwnerId = owner.id

    const parkingLot = await prisma.parkinglot.create({
      data: {
        id: 'test-occupancy-lot-' + Date.now(),
        ownerId: testOwnerId,
        name: 'Test Occupancy Lot',
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

  test('should create booking with NOT_OCCUPIED state', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        occupancyState: 'NOT_OCCUPIED',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.occupancyState).toBe('NOT_OCCUPIED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with OCCUPIED state', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'ACTIVE',
        occupancyState: 'OCCUPIED',
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.occupancyState).toBe('OCCUPIED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with OCCUPANCY_UNCONFIRMED state', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'ACTIVE',
        occupancyState: 'OCCUPANCY_UNCONFIRMED',
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.occupancyState).toBe('OCCUPANCY_UNCONFIRMED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with OCCUPANCY_MISMATCH state', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'COMPLETED',
        occupancyState: 'OCCUPANCY_MISMATCH',
        startTime: new Date(Date.now() - 7200000),
        endTime: new Date(Date.now() - 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.occupancyState).toBe('OCCUPANCY_MISMATCH')
    await prisma.booking.delete({ where: { id: booking.id } })
  })
})