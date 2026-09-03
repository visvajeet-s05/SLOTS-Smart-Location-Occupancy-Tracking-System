import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function setupTestData() {
  const testId = `test_${Date.now()}`
  
  // Create test user
  const user = await prisma.user.create({
    data: {
      id: `${testId}_user`,
      email: `${testId}@test.com`,
      name: "Test User",
      role: "CUSTOMER",
      preferredCurrency: "INR",
      walletBalance: 1000,
    }
  })
  
  // Create test site
  const site = await prisma.parkingsite.create({
    data: {
      id: `${testId}_site`,
      name: "Test Site",
      location: "Test Location",
      latitude: 13.0827,
      longitude: 80.2707,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
  
  // Create floor
  const floor = await prisma.floor.create({
    data: {
      id: `${testId}_floor`,
      siteId: site.id,
      levelName: "Ground Floor",
      levelNumber: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
  
  // Create zone
  const zone = await prisma.zone.create({
    data: {
      id: `${testId}_zone`,
      floorId: floor.id,
      zoneName: "Zone A",
      capacity: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
  
  // Create parking bays
  const bay1 = await prisma.parkingbay.create({
    data: {
      id: `${testId}_bay1`,
      zoneId: zone.id,
      bayNumber: "A1",
      status: "AVAILABLE",
      bayType: "STANDARD",
      isAccessible: false,
    }
  })
  
  const bay2 = await prisma.parkingbay.create({
    data: {
      id: `${testId}_bay2`,
      zoneId: zone.id,
      bayNumber: "A2",
      status: "AVAILABLE",
      bayType: "STANDARD",
      isAccessible: false,
    }
  })
  
  // Create lot config with specific values for testing
  await prisma.lotconfig.create({
    data: {
      lotId: site.id,
      advanceBookingHours: 12,
      minBookingLeadMinutes: 15,
      paymentHoldMinutes: 5,
      minBookingDurationMinutes: 30,
      maxBookingDurationMinutes: 720,
      turnoverBufferMinutes: 5,
      cancellationPolicy: '{">6h":100,"1-6h":50,"<1h":0}',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
  
  return { testId, user, site, floor, zone, bay1, bay2 }
}

async function cleanupTestData(testId: string) {
  await prisma.idempotencykeys.deleteMany({
    where: { userId: { contains: testId } }
  })
  await prisma.booking.deleteMany({
    where: { customerId: { contains: testId } }
  })
  await prisma.parkingbay.deleteMany({
    where: { id: { contains: testId } }
  })
  await prisma.zone.deleteMany({
    where: { id: { contains: testId } }
  })
  await prisma.floor.deleteMany({
    where: { id: { contains: testId } }
  })
  await prisma.lotconfig.deleteMany({
    where: { lotId: { contains: testId } }
  })
  await prisma.parkingsite.deleteMany({
    where: { id: { contains: testId } }
  })
  await prisma.user.deleteMany({
    where: { id: { contains: testId } }
  })
}

async function testB2_AdvanceWindowValidation() {
  console.log("\n=== TEST B2: Advance Window Validation ===")
  const { testId, user, site, bay1 } = await setupTestData()
  
  try {
    const { holdSlotForCheckout } = await import("../lib/booking-engine")
    
    // Test 1: Booking within advance window should succeed
    const validStartTime = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
    const validEndTime = new Date(validStartTime.getTime() + 60 * 60 * 1000) // 1 hour duration
    
    try {
      const booking1 = await holdSlotForCheckout({
        userId: user.id,
        siteId: site.id,
        startTime: validStartTime,
        endTime: validEndTime,
        vehicleNumber: "TEST123",
        vehicleType: "CAR",
      })
      console.log("✓ Booking within advance window succeeded:", booking1.id)
    } catch (error: any) {
      console.log("✗ Booking within advance window failed:", error.message)
    }
    
    // Test 2: Booking beyond advance window should fail
    const invalidStartTime = new Date(Date.now() + 15 * 60 * 60 * 1000) // 15 hours from now
    const invalidEndTime = new Date(invalidStartTime.getTime() + 60 * 60 * 1000)
    
    try {
      const booking2 = await holdSlotForCheckout({
        userId: user.id,
        siteId: site.id,
        startTime: invalidStartTime,
        endTime: invalidEndTime,
        vehicleNumber: "TEST456",
        vehicleType: "CAR",
      })
      console.log("✗ Booking beyond advance window should have failed but succeeded:", booking2.id)
    } catch (error: any) {
      if (error.message.includes("cannot be made more than")) {
        console.log("✓ Booking beyond advance window correctly rejected:", error.message)
      } else {
        console.log("✗ Wrong error for advance window:", error.message)
      }
    }
    
  } finally {
    await cleanupTestData(testId)
  }
}

async function testB29a_MinimumLeadTimeValidation() {
  console.log("\n=== TEST B29a: Minimum Lead Time Validation ===")
  const { testId, user, site, bay1 } = await setupTestData()
  
  try {
    const { holdSlotForCheckout } = await import("../lib/booking-engine")
    
    // Test 1: Booking with sufficient lead time should succeed
    const validStartTime = new Date(Date.now() + 20 * 60 * 1000) // 20 minutes from now
    const validEndTime = new Date(validStartTime.getTime() + 60 * 60 * 1000)
    
    try {
      const booking1 = await holdSlotForCheckout({
        userId: user.id,
        siteId: site.id,
        startTime: validStartTime,
        endTime: validEndTime,
        vehicleNumber: "TEST789",
        vehicleType: "CAR",
      })
      console.log("✓ Booking with sufficient lead time succeeded:", booking1.id)
    } catch (error: any) {
      console.log("✗ Booking with sufficient lead time failed:", error.message)
    }
    
    // Test 2: Booking with insufficient lead time should fail
    const invalidStartTime = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    const invalidEndTime = new Date(invalidStartTime.getTime() + 60 * 60 * 1000)
    
    try {
      const booking2 = await holdSlotForCheckout({
        userId: user.id,
        siteId: site.id,
        startTime: invalidStartTime,
        endTime: invalidEndTime,
        vehicleNumber: "TEST000",
        vehicleType: "CAR",
      })
      console.log("✗ Booking with insufficient lead time should have failed but succeeded:", booking2.id)
    } catch (error: any) {
      if (error.message.includes("at least")) {
        console.log("✓ Booking with insufficient lead time correctly rejected:", error.message)
      } else {
        console.log("✗ Wrong error for lead time:", error.message)
      }
    }
    
  } finally {
    await cleanupTestData(testId)
  }
}

async function testB3toB5_OverlapAndConsecutiveRules() {
  console.log("\n=== TEST B3-B5: Overlap and Consecutive Booking Rules ===")
  const { testId, user, site, bay1 } = await setupTestData()
  
  try {
    const { holdSlotForCheckout } = await import("../lib/booking-engine")
    
    // Create first booking
    const startTime1 = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
    const endTime1 = new Date(startTime1.getTime() + 2 * 60 * 60 * 1000) // 2 hour duration
    
    const booking1 = await holdSlotForCheckout({
      userId: user.id,
      siteId: site.id,
      startTime: startTime1,
      endTime: endTime1,
      vehicleNumber: "TEST111",
      vehicleType: "CAR",
    })
    console.log("✓ First booking created:", booking1.id)
    
    // Test B3: Overlapping booking should fail
    const overlapStart = new Date(startTime1.getTime() + 30 * 60 * 1000) // Starts 30 min into first booking
    const overlapEnd = new Date(overlapStart.getTime() + 60 * 60 * 1000)
    
    try {
      const overlapBooking = await holdSlotForCheckout({
        userId: user.id,
        siteId: site.id,
        startTime: overlapStart,
        endTime: overlapEnd,
        vehicleNumber: "TEST222",
        vehicleType: "CAR",
      })
      console.log("✗ Overlapping booking should have failed but succeeded:", overlapBooking.id)
    } catch (error: any) {
      console.log("✓ Overlapping booking correctly rejected:", error.message)
    }
    
    // Test B4-B5: Consecutive booking within turnover buffer should fail
    const bufferStart = new Date(endTime1.getTime() + 2 * 60 * 1000) // 2 min after first booking ends
    const bufferEnd = new Date(bufferStart.getTime() + 60 * 60 * 1000)
    
    try {
      const bufferBooking = await holdSlotForCheckout({
        userId: user.id,
        siteId: site.id,
        startTime: bufferStart,
        endTime: bufferEnd,
        vehicleNumber: "TEST333",
        vehicleType: "CAR",
      })
      console.log("✗ Booking within turnover buffer should have failed but succeeded:", bufferBooking.id)
    } catch (error: any) {
      console.log("✓ Booking within turnover buffer correctly rejected:", error.message)
    }
    
    // Test B4-B5: Consecutive booking outside turnover buffer should succeed
    const validStart = new Date(endTime1.getTime() + 10 * 60 * 1000) // 10 min after first booking ends
    const validEnd = new Date(validStart.getTime() + 60 * 60 * 1000)
    
    try {
      const validBooking = await holdSlotForCheckout({
        userId: user.id,
        siteId: site.id,
        startTime: validStart,
        endTime: validEnd,
        vehicleNumber: "TEST444",
        vehicleType: "CAR",
      })
      console.log("✓ Booking outside turnover buffer succeeded:", validBooking.id)
    } catch (error: any) {
      console.log("✗ Booking outside turnover buffer failed:", error.message)
    }
    
  } finally {
    await cleanupTestData(testId)
  }
}

async function testB6toB7_HoldTimerAndPaymentConsistency() {
  console.log("\n=== TEST B6-B7: Hold Timer and Payment Consistency ===")
  const { testId, user, site, bay1 } = await setupTestData()
  
  try {
    const { holdSlotForCheckout } = await import("../lib/booking-engine")
    
    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000)
    
    const booking = await holdSlotForCheckout({
      userId: user.id,
      siteId: site.id,
      startTime: startTime,
      endTime: endTime,
      vehicleNumber: "TEST555",
      vehicleType: "CAR",
    })
    
    console.log("✓ Booking created with hold:", booking.id)
    console.log("  Status:", booking.status)
    console.log("  Lock expires at:", booking.lockExpiresAt)
    
    // B6: Verify lock expires at correct time (5 minutes from lot config)
    const expectedExpiry = new Date(Date.now() + 5 * 60 * 1000)
    const expiryDiff = Math.abs(booking.lockExpiresAt!.getTime() - expectedExpiry.getTime())
    
    if (expiryDiff < 5000) { // Within 5 seconds tolerance
      console.log("✓ Hold timer set correctly from lot config (5 minutes)")
    } else {
      console.log("✗ Hold timer incorrect. Expected:", expectedExpiry, "Got:", booking.lockExpiresAt)
    }
    
    // B7: Verify booking status is HELD when held (per B6 spec)
    if (booking.status === "HELD") {
      console.log("✓ Booking status correctly set to HELD (per B6 spec)")
    } else {
      console.log("✗ Booking status incorrect. Expected: HELD, Got:", booking.status)
    }
    
  } finally {
    await cleanupTestData(testId)
  }
}

async function testB27_IdempotencyTransactionBoundaries() {
  console.log("\n=== TEST B27/B27a: Idempotency Transaction Boundaries ===")
  const { testId, user, site, bay1 } = await setupTestData()
  
  try {
    const { holdSlotForCheckout } = await import("../lib/booking-engine")
    
    const idempotencyKey = `test_key_${Date.now()}`
    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000)
    
    // First request with idempotency key
    const booking1 = await holdSlotForCheckout({
      userId: user.id,
      siteId: site.id,
      startTime: startTime,
      endTime: endTime,
      vehicleNumber: "TEST666",
      vehicleType: "CAR",
      idempotencyKey,
    })
    console.log("✓ First request with idempotency key succeeded:", booking1.id)
    
    // Second request with same idempotency key should return cached result
    const booking2 = await holdSlotForCheckout({
      userId: user.id,
      siteId: site.id,
      startTime: startTime,
      endTime: endTime,
      vehicleNumber: "TEST777",
      vehicleType: "CAR",
      idempotencyKey,
    })
    console.log("✓ Second request with same key returned cached result:", booking2.id)
    
    // Verify both bookings are the same
    if (booking1.id === booking2.id) {
      console.log("✓ Idempotency working correctly - same booking ID returned")
    } else {
      console.log("✗ Idempotency failed - different booking IDs:", booking1.id, "vs", booking2.id)
    }
    
    // Verify idempotency record was created
    const idempotencyRecord = await prisma.idempotencykeys.findUnique({
      where: {
        actionType_idempotencyKey: {
          actionType: "HOLD_SLOT",
          idempotencyKey
        }
      }
    })
    
    if (idempotencyRecord) {
      console.log("✓ Idempotency record created in database")
      console.log("  Action type:", idempotencyRecord.actionType)
      console.log("  User ID:", idempotencyRecord.userId)
    } else {
      console.log("✗ Idempotency record not found in database")
    }
    
    // Verify only one booking was created (not two)
    const allBookings = await prisma.booking.findMany({
      where: { customerId: user.id }
    })
    
    if (allBookings.length === 1) {
      console.log("✓ Only one booking created despite two requests (transaction boundaries working)")
    } else {
      console.log("✗ Multiple bookings created:", allBookings.length, "(transaction boundaries broken)")
    }
    
  } finally {
    await cleanupTestData(testId)
  }
}

async function runAllTests() {
  console.log("=== PHASE 2 VALIDATION TESTS ===")
  console.log("Testing B2, B29a, B3-B5, B6-B7, B27/B27a")
  
  try {
    await testB2_AdvanceWindowValidation()
    await testB29a_MinimumLeadTimeValidation()
    await testB3toB5_OverlapAndConsecutiveRules()
    await testB6toB7_HoldTimerAndPaymentConsistency()
    await testB27_IdempotencyTransactionBoundaries()
    
    console.log("\n=== ALL PHASE 2 TESTS COMPLETED ===")
  } catch (error) {
    console.error("Test suite error:", error)
  } finally {
    await prisma.$disconnect()
  }
}

runAllTests()
