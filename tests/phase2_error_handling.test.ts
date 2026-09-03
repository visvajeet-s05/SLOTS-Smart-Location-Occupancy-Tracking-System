const mysql = require("mysql2/promise");

async function main() {
  const testId = `test_${Date.now()}`;
  
  const conn = await mysql.createConnection({
    host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking"
  });

  console.log("=== SETUP ===");
  
  // Create test user
  await conn.execute("INSERT INTO user (id, email, name, role, preferredCurrency, walletBalance) VALUES (?,?,?,?,?,?)",
    [`${testId}_user`, `${testId}@test.com`, "Test User", "CUSTOMER", "INR", 1000]);
  
  // Create owner profile
  await conn.execute("INSERT INTO ownerprofile (id, userId, businessName, phone, status, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)",
    [`${testId}_owner`, `${testId}_user`, "Test Business", "1234567890", "APPROVED", new Date(), new Date()]);
  
  // Create parking lot
  await conn.execute("INSERT INTO parkinglot (id, ownerId, name, address, lat, lng, totalSlots, timezone, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [`${testId}_lot`, `${testId}_owner`, "Test Lot", "Test Address", 13.0827, 80.2707, 10, "Asia/Kolkata", new Date(), new Date()]);
  
  // Create slot
  await conn.execute("INSERT INTO slot (id, lotId, slotNumber, row, status, aiConfidence, price, slotType, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)",
    [`${testId}_slot`, `${testId}_lot`, 1, "A", "AVAILABLE", 100, 50, "REGULAR", new Date()]);
  
  // Create lot config
  await conn.execute("INSERT INTO lotconfig (lotId, advanceBookingHours, minBookingLeadMinutes, paymentHoldMinutes, minBookingDurationMinutes, maxBookingDurationMinutes, turnoverBufferMinutes, cancellationPolicy, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [`${testId}_lot`, 12, 15, 5, 30, 720, 5, '{\">6h\":100,\"1-6h\":50,\"<1h\":0}', new Date(), new Date()]);
  
  console.log("Test data created");

  const idempotencyKey = `error_handling_test_${Date.now()}`;
  const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  console.log("\n=== ERROR HANDLING TEST ===");
  console.log("Testing what happens when unique constraint violation occurs");

  // First, create the idempotency key to simulate the race condition scenario
  console.log("Pre-creating idempotency key to simulate race...");
  await conn.execute(
    "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [`idemp_${Date.now()}_1`, "CREATE_BOOKING", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true, bookingId: `${testId}_existing_booking` }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );
  console.log("✓ Idempotency key pre-created");

  // Now try to create a booking with the same idempotency key (simulating second request in race)
  console.log("Attempting to create booking with existing idempotency key...");
  
  try {
    await conn.execute(
      "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, idempotencyKey) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [`${testId}_booking_new`, `${testId}_user`, `${testId}_user`, `${testId}_lot`, `${testId}_slot`, "HELD", startTime, endTime, 50, "CAR", idempotencyKey]
    );
    console.log("✗ Booking insert succeeded (no unique constraint on booking.idempotencyKey)");
  } catch (error) {
    console.log("✓ Booking insert error:", error.message);
  }

  // Try to insert another idempotency key with same actionType/idempotencyKey
  console.log("\nAttempting to insert duplicate idempotency key...");
  try {
    await conn.execute(
      "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
      [`idemp_${Date.now()}_2`, "CREATE_BOOKING", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
    );
    console.log("✗ Second idempotency insert succeeded (UNIQUE CONSTRAINT NOT WORKING)");
  } catch (error) {
    console.log("✓ Second idempotency insert failed with UNIQUE CONSTRAINT VIOLATION:", error.message);
    console.log("  Error code:", error.code);
    
    // This demonstrates what the application layer needs to handle
    console.log("\n=== APPLICATION LAYER ERROR HANDLING REQUIRED ===");
    console.log("When ER_DUP_ENTRY occurs, the application should:");
    console.log("1. Catch the unique constraint violation");
    console.log("2. Query for the existing idempotency record");
    console.log("3. Return the cached result instead of treating it as an error");
    console.log("4. Surface a user-friendly response, not a 500 error");
  }

  // Verify final state
  console.log("\n=== VERIFICATION ===");
  const [idempotencyRecords] = await conn.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["CREATE_BOOKING", idempotencyKey]);
  console.log("Idempotency records:", idempotencyRecords.length);
  idempotencyRecords.forEach(r => console.log("  -", r.id, r.actionType, r.idempotencyKey));

  const [bookings] = await conn.execute("SELECT id FROM booking WHERE customerId = ?", [`${testId}_user`]);
  console.log("Bookings:", bookings.length);
  bookings.forEach(b => console.log("  -", b.id));

  // Cleanup
  console.log("\n=== CLEANUP ===");
  await conn.execute("DELETE FROM idempotencykeys WHERE userId = ?", [`${testId}_user`]);
  await conn.execute("DELETE FROM booking WHERE customerId = ?", [`${testId}_user`]);
  await conn.execute("DELETE FROM slot WHERE id = ?", [`${testId}_slot`]);
  await conn.execute("DELETE FROM lotconfig WHERE lotId = ?", [`${testId}_lot`]);
  await conn.execute("DELETE FROM parkinglot WHERE id = ?", [`${testId}_lot`]);
  await conn.execute("DELETE FROM ownerprofile WHERE id = ?", [`${testId}_owner`]);
  await conn.execute("DELETE FROM user WHERE id = ?", [`${testId}_user`]);
  
  await conn.end();
  console.log("Cleanup complete");
  console.log("\n=== TEST COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
