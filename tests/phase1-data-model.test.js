/**
 * B35 & B35a: Data Model Tests
 * Tests for complete booking data model (B35) and slot allocation history (B35a)
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

describe('B35: Complete Booking Data Model Tests', () => {
  let testCustomerId
  let testOwnerId
  let testParkingLotId
  let testSlotId

  beforeAll(async () => {
    // Setup test data
    const user = await prisma.user.create({
      data: {
        email: 'test-data-model@example.com',
        role: 'CUSTOMER',
        passwordHash: 'test_hash'
      }
    })
    testCustomerId = user.id

    const owner = await prisma.user.create({
      data: {
        email: 'test-owner-data@example.com',
        role: 'OWNER',
        passwordHash: 'test_hash'
      }
    })
    testOwnerId = owner.id

    const parkingLot = await prisma.parkinglot.create({
      data: {
        id: 'test-data-model-lot-' + Date.now(),
        ownerId: testOwnerId,
        name: 'Test Data Model Lot',
        address: '123 Test St',
        lat: 13.0827,
        lng: 80.2707,
        status: 'ACTIVE',
        timezone: 'Asia/Kolkata'
      }
    })
    testParkingLotId = parkingLot.id

    const lotConfig = await prisma.lotConfig.create({
      data: {
        lotId: testParkingLotId,
        advanceBookingHours: 12,
        minBookingLeadMinutes: 15,
        checkinGraceDivisor: 6,
        minCheckinGraceMinutes: 5,
        maxCheckinGraceMinutes: 30,
        refundUsageThreshold: 80,
        minRefundAmount: 10,
        paymentHoldMinutes: 5,
        minBookingDurationMinutes: 30,
        maxBookingDurationMinutes: 720,
        noShowFine: 50,
        overstayBlockMinutes: 30,
        overstayRatePerBlock: 30,
        overstayMaxChargeMultiple: 4,
        overstayMinMaxCharge: 200,
        turnoverBufferMinutes: 5,
        noCompatibleSlotGraceMinutes: 15,
        cancellationPolicy: { ">6h": 100, "1-6h": 50, "<1h": 0 },
        upcomingBookingReminderMinutes: 30
      }
    })

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
    await prisma.lotConfig.deleteMany({
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

  test('should create booking with originalSlotId and allocatedSlotId', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        originalSlotId: testSlotId,
        allocatedSlotId: testSlotId,
        status: 'CONFIRMED',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.originalSlotId).toBe(testSlotId)
    expect(booking.allocatedSlotId).toBe(testSlotId)
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with actualCheckIn and actualCheckOut', async () => {
    const checkInTime = new Date()
    const checkOutTime = new Date(Date.now() + 3600000)

    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'COMPLETED',
        actualCheckIn: checkInTime,
        actualCheckOut: checkOutTime,
        startTime: new Date(Date.now() - 3600000),
        endTime: new Date(Date.now() + 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.actualCheckIn).toBeDefined()
    expect(booking.actualCheckOut).toBeDefined()
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with paymentStatus', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        paymentStatus: 'COMPLETED',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.paymentStatus).toBe('COMPLETED')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with financial fields (refundAmount, fineAmount, overstayAmount)', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'COMPLETED',
        refundAmount: 25.50,
        fineAmount: 50.00,
        overstayAmount: 30.00,
        startTime: new Date(Date.now() - 7200000),
        endTime: new Date(Date.now() - 3600000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.refundAmount).toBe(25.50)
    expect(booking.fineAmount).toBe(50.00)
    expect(booking.overstayAmount).toBe(30.00)
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with temporaryReassignmentReason', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        originalSlotId: testSlotId,
        allocatedSlotId: testSlotId,
        status: 'CONFIRMED',
        temporaryReassignmentReason: 'PREVIOUS_SLOT_UNAVAILABLE',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.temporaryReassignmentReason).toBe('PREVIOUS_SLOT_UNAVAILABLE')
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with lotConfigSnapshot', async () => {
    const configSnapshot = {
      advanceBookingHours: 12,
      minBookingLeadMinutes: 15,
      checkinGraceDivisor: 6,
      noShowFine: 50,
      overstayRatePerBlock: 30
    }

    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        lotConfigSnapshot: configSnapshot,
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.lotConfigSnapshot).toEqual(configSnapshot)
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create booking with idempotencyKey', async () => {
    const idempotencyKey = 'test-idempotency-key-12345'

    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        status: 'CONFIRMED',
        idempotencyKey: idempotencyKey,
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    expect(booking.idempotencyKey).toBe(idempotencyKey)

    // Attempt to create another booking with same idempotencyKey (should fail)
    await expect(
      prisma.booking.create({
        data: {
          customerId: testCustomerId,
          ownerId: testOwnerId,
          parkingLotId: testParkingLotId,
          slotId: testSlotId,
          status: 'CONFIRMED',
          idempotencyKey: idempotencyKey,
          startTime: new Date(Date.now() + 3600000),
          endTime: new Date(Date.now() + 7200000),
          amount: 100,
          vehicleType: 'CAR'
        }
      })
    ).rejects.toThrow()

    await prisma.booking.delete({ where: { id: booking.id } })
  })
})

describe('B35a: Slot Allocation History Tests', () => {
  let testCustomerId
  let testOwnerId
  let testParkingLotId
  let testSlotId
  let testSecondSlotId

  beforeAll(async () => {
    // Setup test data
    const user = await prisma.user.create({
      data: {
        email: 'test-allocation-history@example.com',
        role: 'CUSTOMER',
        passwordHash: 'test_hash'
      }
    })
    testCustomerId = user.id

    const owner = await prisma.user.create({
      data: {
        email: 'test-owner-allocation@example.com',
        role: 'OWNER',
        passwordHash: 'test_hash'
      }
    })
    testOwnerId = owner.id

    const parkingLot = await prisma.parkinglot.create({
      data: {
        id: 'test-allocation-history-lot-' + Date.now(),
        ownerId: testOwnerId,
        name: 'Test Allocation History Lot',
        address: '123 Test St',
        lat: 13.0827,
        lng: 80.2707,
        status: 'ACTIVE',
        timezone: 'Asia/Kolkata'
      }
    })
    testParkingLotId = parkingLot.id

    const firstSlot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 1,
        status: 'AVAILABLE',
        row: 'A',
        displayName: 'A01'
      }
    })
    testSlotId = firstSlot.id

    const secondSlot = await prisma.slot.create({
      data: {
        lotId: testParkingLotId,
        slotNumber: 2,
        status: 'AVAILABLE',
        row: 'A',
        displayName: 'A02'
      }
    })
    testSecondSlotId = secondSlot.id
  })

  afterAll(async () => {
    // Cleanup test data in correct order to handle foreign key constraints
    await prisma.slotAllocationHistory.deleteMany({
      where: { slotId: { in: [testSlotId, testSecondSlotId] } }
    })
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

  test('should create ORIGINAL allocation history entry', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        originalSlotId: testSlotId,
        allocatedSlotId: testSlotId,
        status: 'CONFIRMED',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    const allocationHistory = await prisma.slotAllocationHistory.create({
      data: {
        bookingId: booking.id,
        slotId: testSlotId,
        allocationType: 'ORIGINAL',
        reason: 'INITIAL_ALLOCATION'
      }
    })

    expect(allocationHistory.bookingId).toBe(booking.id)
    expect(allocationHistory.slotId).toBe(testSlotId)
    expect(allocationHistory.allocationType).toBe('ORIGINAL')
    expect(allocationHistory.assignedAt).toBeDefined()
    expect(allocationHistory.releasedAt).toBeNull()

    await prisma.slotAllocationHistory.delete({ where: { id: allocationHistory.id } })
    await prisma.booking.delete({ where: { id: booking.id } })
  })

  test('should create TEMPORARY allocation history entry', async () => {
    const booking = await prisma.booking.create({
      data: {
        customerId: testCustomerId,
        ownerId: testOwnerId,
        parkingLotId: testParkingLotId,
        slotId: testSlotId,
        originalSlotId: testSlotId,
        allocatedSlotId: testSecondSlotId,
        status: 'CONFIRMED',
        temporaryReassignmentReason: 'PREVIOUS_SLOT_UNAVAILABLE',
        startTime: new Date(Date.now() + 3600000),
        endTime: new Date(Date.now() + 7200000),
        amount: 100,
        vehicleType: 'CAR'
      }
    })

    const allocationHistory = await prisma.slotAllocationHistory.create({
      data: {
        bookingId: booking.id,
        slotId: testSecondSlotId,
        allocationType: 'TEMPORARY',
        reason: 'PREVIOUS_SLOT_UNAVAILABLE'
      }
    })

    expect(allocationHistory.bookingId).toBe(booking.id)
    expect(allocationHistory.slotId).toBe(testSecondSlotId)
    expect(allocationHistory.allocationType).toBe('TEMPORARY')
    expect(allocationHistory.reason).toBe('PREVIOUS_SLOT_UNAVAILABLE')

    await prisma.slotAllocationHistory.delete({ where: { id: allocationHistory.id } })
    await prisma.booking.delete({ where: { id: booking.id } })
  })
})

describe('B29: Lot Configuration Model Tests', () => {
  let testOwnerId
  let testParkingLotId

  beforeAll(async () => {
    // Setup test data
    const owner = await prisma.user.create({
      data: {
        email: 'test-lot-config@example.com',
        role: 'OWNER',
        passwordHash: 'test_hash'
      }
    })
    testOwnerId = owner.id

    const parkingLot = await prisma.parkinglot.create({
      data: {
        id: 'test-lot-config-lot-' + Date.now(),
        ownerId: testOwnerId,
        name: 'Test Lot Config Lot',
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
    await prisma.lotConfig.deleteMany({
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

  test('should create lot configuration with all default values', async () => {
    const lotConfig = await prisma.lotConfig.create({
      data: {
        lotId: testParkingLotId
      }
    })

    expect(lotConfig.lotId).toBe(testParkingLotId)
    expect(lotConfig.advanceBookingHours).toBe(12)
    expect(lotConfig.minBookingLeadMinutes).toBe(15)
    expect(lotConfig.checkinGraceDivisor).toBe(6)
    expect(lotConfig.minCheckinGraceMinutes).toBe(5)
    expect(lotConfig.maxCheckinGraceMinutes).toBe(30)
    expect(lotConfig.refundUsageThreshold).toBe(80)
    expect(lotConfig.minRefundAmount).toBe(10)
    expect(lotConfig.paymentHoldMinutes).toBe(5)
    expect(lotConfig.minBookingDurationMinutes).toBe(30)
    expect(lotConfig.maxBookingDurationMinutes).toBe(720)
    expect(lotConfig.noShowFine).toBe(50)
    expect(lotConfig.overstayBlockMinutes).toBe(30)
    expect(lotConfig.overstayRatePerBlock).toBe(30)
    expect(lotConfig.overstayMaxChargeMultiple).toBe(4)
    expect(lotConfig.overstayMinMaxCharge).toBe(200)
    expect(lotConfig.turnoverBufferMinutes).toBe(5)
    expect(lotConfig.noCompatibleSlotGraceMinutes).toBe(15)
    expect(lotConfig.upcomingBookingReminderMinutes).toBe(30)

    await prisma.lotConfig.delete({ where: { lotId: testParkingLotId } })
  })

  test('should create lot configuration with custom values', async () => {
    const customConfig = {
      advanceBookingHours: 24,
      minBookingLeadMinutes: 30,
      checkinGraceDivisor: 4,
      noShowFine: 100,
      overstayRatePerBlock: 50
    }

    const lotConfig = await prisma.lotConfig.create({
      data: {
        lotId: testParkingLotId,
        ...customConfig
      }
    })

    expect(lotConfig.advanceBookingHours).toBe(24)
    expect(lotConfig.minBookingLeadMinutes).toBe(30)
    expect(lotConfig.checkinGraceDivisor).toBe(4)
    expect(lotConfig.noShowFine).toBe(100)
    expect(lotConfig.overstayRatePerBlock).toBe(50)

    await prisma.lotConfig.delete({ where: { lotId: testParkingLotId } })
  })

  test('should update lot configuration', async () => {
    const lotConfig = await prisma.lotConfig.create({
      data: {
        lotId: testParkingLotId
      }
    })

    const updatedConfig = await prisma.lotConfig.update({
      where: { lotId: testParkingLotId },
      data: {
        advanceBookingHours: 18,
        noShowFine: 75
      }
    })

    expect(updatedConfig.advanceBookingHours).toBe(18)
    expect(updatedConfig.noShowFine).toBe(75)
    expect(updatedConfig.updatedAt).not.toEqual(lotConfig.updatedAt)

    await prisma.lotConfig.delete({ where: { lotId: testParkingLotId } })
  })

  test('should enforce unique lotId constraint', async () => {
    await prisma.lotConfig.create({
      data: {
        lotId: testParkingLotId
      }
    })

    await expect(
      prisma.lotConfig.create({
        data: {
          lotId: testParkingLotId
        }
      })
    ).rejects.toThrow()

    await prisma.lotConfig.delete({ where: { lotId: testParkingLotId } })
  })
})