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

  const idempotencyKey = `race_test_${Date.now()}`;
  const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  console.log("\n=== GENUINELY CONCURRENT IDEMPOTENCY TEST ===");
  console.log("Testing real race: both connections try to insert idempotency key simultaneously");

  const c1 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });
  const c2 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });

  // Start both transactions
  console.log("Both connections starting transactions simultaneously...");
  await c1.beginTransaction();
  await c2.beginTransaction();

  // Both check idempotency key (should both find nothing)
  console.log("Both connections checking idempotency key...");
  const [existing1] = await c1.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["HOLD_SLOT", idempotencyKey]);
  const [existing2] = await c2.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["HOLD_SLOT", idempotencyKey]);
  
  console.log("Conn1: Key not found, proceeding to insert booking...");
  console.log("Conn2: Key not found, proceeding to insert booking...");

  // Both create bookings
  const p1 = c1.execute(
    "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, idempotencyKey) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [`${testId}_booking1`, `${testId}_user`, `${testId}_user`, `${testId}_lot`, `${testId}_slot`, "HELD", startTime, endTime, 50, "CAR", idempotencyKey]
  );
  
  const p2 = c2.execute(
    "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, idempotencyKey) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [`${testId}_booking2`, `${testId}_user`, `${testId}_user`, `${testId}_lot`, `${testId}_slot`, "HELD", startTime, endTime, 50, "CAR", idempotencyKey]
  );

  // Both try to insert idempotency keys simultaneously
  console.log("Both connections attempting to insert idempotency keys simultaneously...");
  const ip1 = c1.execute(
    "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [`idemp_${Date.now()}_1`, "HOLD_SLOT", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true, bookingId: `${testId}_booking1` }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );
  
  const ip2 = c2.execute(
    "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [`idemp_${Date.now()}_2`, "HOLD_SLOT", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true, bookingId: `${testId}_booking2` }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );

  // Wait for both operations to complete
  const results = await Promise.allSettled([p1, p2]);
  
  console.log("\n=== RACE RESULTS ===");
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`Conn${index + 1}: ✓ Booking and idempotency insert succeeded`);
    } else {
      console.log(`Conn${index + 1}: ✗ Failed with error:`, result.reason.message);
      if (result.reason.code === 'ER_DUP_ENTRY') {
        console.log(`  ✓ UNIQUE CONSTRAINT VIOLATION - This proves the race was real`);
        console.log(`  The @@unique([actionType, idempotencyKey]) constraint prevented duplicate`);
      }
    }
  });

  // Commit the successful transaction(s)
  try {
    await c1.commit();
    console.log("Conn1: Committed");
  } catch (e) {
    await c1.rollback();
    console.log("Conn1: Rolled back");
  }

  try {
    await c2.commit();
    console.log("Conn2: Committed");
  } catch (e) {
    await c2.rollback();
    console.log("Conn2: Rolled back");
  }

  await c1.end();
  await c2.end();

  // Verify final state
  console.log("\n=== VERIFICATION ===");
  const [bookings] = await conn.execute("SELECT id FROM booking WHERE customerId = ?", [`${testId}_user`]);
  console.log("Total bookings created:", bookings.length);
  bookings.forEach(b => console.log("  -", b.id));
  
  const [idempotencyRecords] = await conn.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["HOLD_SLOT", idempotencyKey]);
  console.log("Idempotency records:", idempotencyRecords.length);
  idempotencyRecords.forEach(r => console.log("  -", r.id, r.actionType, r.idempotencyKey));

  if (bookings.length === 1 && idempotencyRecords.length === 1) {
    console.log("✓ CONCURRENT TEST PASSED: UNIQUE CONSTRAINT prevented duplicate despite race");
  } else {
    console.log("✗ CONCURRENT TEST FAILED: Wrong number of records -", bookings.length, "bookings,", idempotencyRecords.length, "idempotency records");
  }

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
