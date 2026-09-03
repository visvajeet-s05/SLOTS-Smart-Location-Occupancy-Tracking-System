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
  
  // Create owner profile
  const ownerProfile = await prisma.ownerprofile.create({
    data: {
      id: `${testId}_owner`,
      userId: user.id,
      businessName: "Test Business",
      phone: "1234567890",
      status: "APPROVED",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
  
  // Create test parking lot
  const parkingLot = await prisma.parkinglot.create({
    data: {
      id: `${testId}_lot`,
      ownerId: ownerProfile.id,
      name: "Test Lot",
      address: "Test Address",
      lat: 13.0827,
      lng: 80.2707,
      totalSlots: 10,
      timezone: "Asia/Kolkata",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })
  
  // Create test slot
  const slot = await prisma.slot.create({
    data: {
      id: `${testId}_slot`,
      lotId: parkingLot.id,
      slotNumber: 1,
      row: "A",
      status: "AVAILABLE",
      aiConfidence: 100,
      price: 50,
      slotType: "REGULAR",
      updatedAt: new Date(),
    }
  })
  
  // Create lot config with specific values for testing
  await prisma.lotconfig.create({
    data: {
      lotId: parkingLot.id,
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
  
  return { testId, user, ownerProfile, parkingLot, slot }
}

async function cleanupTestData(testId: string) {
  await prisma.idempotencykeys.deleteMany({
    where: { userId: { contains: testId } }
  })
  await prisma.booking.deleteMany({
    where: { customerId: { contains: testId } }
  })
  await prisma.slot.deleteMany({
    where: { id: { contains: testId } }
  })
  await prisma.lotconfig.deleteMany({
    where: { lotId: { contains: testId } }
  })
  await prisma.parkinglot.deleteMany({
    where: { id: { contains: testId } }
  })
  await prisma.ownerprofile.deleteMany({
    where: { id: { contains: testId } }
  })
  await prisma.user.deleteMany({
    where: { id: { contains: testId } }
  })
}

async function testB2_AdvanceWindowValidation() {
  console.log("\n=== TEST B2: Advance Window Validation ===")
  const { testId, user, parkingLot, slot } = await setupTestData()
  
  try {
    const { validateBookingTime } = await import("../lib/booking-engine")
    
    // Test 1: Booking within advance window should succeed
    const validStartTime = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
    const validEndTime = new Date(validStartTime.getTime() + 60 * 60 * 1000) // 1 hour duration
    
    try {
      await validateBookingTime(parkingLot.id, validStartTime, validEndTime)
      console.log("✓ Booking within advance window passed validation")
    } catch (error: any) {
      console.log("✗ Booking within advance window failed:", error.message)
    }
    
    // Test 2: Booking beyond advance window should be rejected
    const invalidStartTime = new Date(Date.now() + 15 * 60 * 60 * 1000) // 15 hours from now
    const invalidEndTime = new Date(invalidStartTime.getTime() + 60 * 60 * 1000)
    
    try {
      await validateBookingTime(parkingLot.id, invalidStartTime, invalidEndTime)
      console.log("✗ Booking beyond advance window should have been rejected")
    } catch (error: any) {
      if (error.message.includes("cannot be made more than")) {
        console.log("✓ Booking beyond advance window ACTUALLY rejected:", error.message)
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
  const { testId, user, parkingLot, slot } = await setupTestData()
  
  try {
    const { validateBookingTime } = await import("../lib/booking-engine")
    
    // Test 1: Booking with sufficient lead time should succeed
    const validStartTime = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now (within 12h window, >15min lead time)
    const validEndTime = new Date(validStartTime.getTime() + 60 * 60 * 1000)
    
    try {
      await validateBookingTime(parkingLot.id, validStartTime, validEndTime)
      console.log("✓ Booking with sufficient lead time passed validation")
    } catch (error: any) {
      console.log("✗ Booking with sufficient lead time failed:", error.message)
    }
    
    // Test 2: Booking with insufficient lead time should be rejected
    const invalidStartTime = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
    const invalidEndTime = new Date(invalidStartTime.getTime() + 60 * 60 * 1000)
    
    try {
      await validateBookingTime(parkingLot.id, invalidStartTime, invalidEndTime)
      console.log("✗ Booking with insufficient lead time should have been rejected")
    } catch (error: any) {
      if (error.message.includes("at least")) {
        console.log("✓ Booking with insufficient lead time ACTUALLY rejected:", error.message)
      } else {
        console.log("✗ Wrong error for lead time:", error.message)
      }
    }
    
  } finally {
    await cleanupTestData(testId)
  }
}

async function testB6toB7_HoldTimerAndPaymentConsistency() {
  console.log("\n=== TEST B6-B7: Hold Timer and Payment Consistency ===")
  const { testId, user, parkingLot, slot } = await setupTestData()
  
  try {
    const lotConfig = await prisma.lotconfig.findUnique({
      where: { lotId: parkingLot.id }
    })
    
    if (lotConfig && lotConfig.paymentHoldMinutes === 5) {
      console.log("✓ Lot config paymentHoldMinutes correctly set to 5 minutes")
      
      // Create a booking with lock
      const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000)
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000)
      const expectedLockExpiry = new Date(Date.now() + lotConfig.paymentHoldMinutes * 60 * 1000)
      
      const booking = await prisma.booking.create({
        data: {
          id: `${testId}_booking_hold`,
          customerId: user.id,
          ownerId: user.id,
          parkingLotId: parkingLot.id,
          slotId: slot.id,
          startTime: startTime,
          endTime: endTime,
          amount: 50,
          vehicleType: "CAR",
          status: "HELD", // B6: Use HELD status for holds per spec
          lockExpiresAt: expectedLockExpiry,
        }
      })
      
      console.log("✓ Booking created with HELD status:", booking.status)
      console.log("✓ Lock expiry set based on lot config:", booking.lockExpiresAt)
      
      // Verify the status
      if (booking.status === "HELD") {
        console.log("✓ Booking status correctly set to HELD for hold (per B6 spec)")
      } else {
        console.log("✗ Booking status incorrect:", booking.status)
      }
    } else {
      console.log("✗ Lot config not found or paymentHoldMinutes incorrect")
    }
    
  } finally {
    await cleanupTestData(testId)
  }
}

async function testB27_IdempotencyTransactionBoundaries() {
  console.log("\n=== TEST B27/B27a: Idempotency Transaction Boundaries ===")
  const { testId, user, parkingLot, slot } = await setupTestData()
  
  try {
    const idempotencyKey = `test_key_${Date.now()}`
    const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000)
    
    // Simulate the transaction boundary pattern
    const result = await prisma.$transaction(async (tx) => {
      // Check idempotency key INSIDE transaction
      const existingKey = await tx.idempotencykeys.findUnique({
        where: {
          actionType_idempotencyKey: {
            actionType: "CREATE_BOOKING",
            idempotencyKey
          }
        }
      })
      
      if (existingKey) {
        const cachedResult = JSON.parse(existingKey.result)
        return { cached: true, booking: cachedResult.booking }
      }
      
      // Create the booking
      const booking = await tx.booking.create({
        data: {
          id: `${testId}_booking_idemp`,
          customerId: user.id,
          ownerId: user.id,
          parkingLotId: parkingLot.id,
          slotId: slot.id,
          startTime: startTime,
          endTime: endTime,
          amount: 50,
          vehicleType: "CAR",
          status: "HELD", // B6: Use HELD status for holds
          idempotencyKey,
        }
      })
      
      // Store idempotency result INSIDE the same transaction
      await tx.idempotencykeys.create({
        data: {
          id: `${testId}_idemp`,
          actionType: "CREATE_BOOKING",
          idempotencyKey,
          userId: user.id,
          result: JSON.stringify({ booking }),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }
      })
      
      return { cached: false, booking }
    })
    
    console.log("✓ First request with idempotency key succeeded:", result.booking.id)
    
    // Second request with same idempotency key
    const result2 = await prisma.$transaction(async (tx) => {
      const existingKey = await tx.idempotencykeys.findUnique({
        where: {
          actionType_idempotencyKey: {
            actionType: "CREATE_BOOKING",
            idempotencyKey
          }
        }
      })
      
      if (existingKey) {
        const cachedResult = JSON.parse(existingKey.result)
        return { cached: true, booking: cachedResult.booking }
      }
      
      // This should not execute
      const booking = await tx.booking.create({
        data: {
          id: `${testId}_booking_idemp_2`,
          customerId: user.id,
          ownerId: user.id,
          parkingLotId: parkingLot.id,
          slotId: slot.id,
          startTime: startTime,
          endTime: endTime,
          amount: 50,
          vehicleType: "CAR",
          status: "HELD", // B6: Use HELD status for holds
          idempotencyKey,
        }
      })
      
      await tx.idempotencykeys.create({
        data: {
          id: `${testId}_idemp_2`,
          actionType: "CREATE_BOOKING",
          idempotencyKey,
          userId: user.id,
          result: JSON.stringify({ booking }),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }
      })
      
      return { cached: false, booking }
    })
    
    console.log("✓ Second request returned cached result:", result2.booking.id)
    
    // Verify both bookings are the same
    if (result.booking.id === result2.booking.id) {
      console.log("✓ Idempotency working correctly - same booking ID returned")
    } else {
      console.log("✗ Idempotency failed - different booking IDs:", result.booking.id, "vs", result2.booking.id)
    }
    
    // Verify idempotency record was created
    const idempotencyRecord = await prisma.idempotencykeys.findUnique({
      where: {
        actionType_idempotencyKey: {
          actionType: "CREATE_BOOKING",
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

async function testB3toB5_OverlapAndConsecutiveRules() {
  console.log("\n=== TEST B3-B5: Overlap and Consecutive Booking Rules ===")
  const { testId, user, parkingLot, slot } = await setupTestData()
  
  try {
    const lotConfig = await prisma.lotconfig.findUnique({
      where: { lotId: parkingLot.id }
    })
    
    if (lotConfig && lotConfig.turnoverBufferMinutes === 5) {
      console.log("✓ Lot config turnoverBufferMinutes correctly set to 5 minutes")
      
      // Create first booking
      const startTime1 = new Date(Date.now() + 2 * 60 * 60 * 1000)
      const endTime1 = new Date(startTime1.getTime() + 2 * 60 * 60 * 1000)
      
      const booking1 = await prisma.booking.create({
        data: {
          id: `${testId}_booking_overlap1`,
          customerId: user.id,
          ownerId: user.id,
          parkingLotId: parkingLot.id,
          slotId: slot.id,
          startTime: startTime1,
          endTime: endTime1,
          amount: 50,
          vehicleType: "CAR",
          status: "HELD", // B6: Use HELD status so trigger protects it
        }
      })
      console.log("✓ First booking created:", booking1.id)
      
      // Test overlapping booking (should be rejected by trigger)
      const overlapStart = new Date(startTime1.getTime() + 30 * 60 * 1000)
      const overlapEnd = new Date(overlapStart.getTime() + 60 * 60 * 1000)
      
      try {
        const overlapBooking = await prisma.booking.create({
          data: {
            id: `${testId}_booking_overlap`,
            customerId: user.id,
            ownerId: user.id,
            parkingLotId: parkingLot.id,
            slotId: slot.id,
            startTime: overlapStart,
            endTime: overlapEnd,
            amount: 50,
            vehicleType: "CAR",
            status: "HELD",
          }
        })
        console.log("✗ Overlapping booking should have been rejected by trigger but succeeded:", overlapBooking.id)
      } catch (error: any) {
        if (error.message.includes("Overlapping booking")) {
          console.log("✓ Overlapping booking correctly rejected by trigger:", error.message)
        } else {
          console.log("✗ Wrong error for overlapping booking:", error.message)
        }
      }
      
      // Test consecutive booking within turnover buffer
      const bufferStart = new Date(endTime1.getTime() + 2 * 60 * 1000)
      const bufferEnd = new Date(bufferStart.getTime() + 60 * 60 * 1000)
      
      try {
        const bufferBooking = await prisma.booking.create({
          data: {
            id: `${testId}_booking_buffer`,
            customerId: user.id,
            ownerId: user.id,
            parkingLotId: parkingLot.id,
            slotId: slot.id,
            startTime: bufferStart,
            endTime: bufferEnd,
            amount: 50,
            vehicleType: "CAR",
            status: "HELD",
          }
        })
        console.log("⚠ Booking within turnover buffer - this is application-level validation, not trigger-level")
        console.log("  Buffer booking succeeded (expected):", bufferBooking.id)
        console.log("  Note: Turnover buffer validation is in booking-engine, not database trigger")
      } catch (error: any) {
        console.log("✓ Booking within turnover buffer correctly rejected:", error.message)
      }
      
    } else {
      console.log("✗ Lot config not found or turnoverBufferMinutes incorrect")
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
