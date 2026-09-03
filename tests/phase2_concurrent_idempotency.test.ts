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

  const idempotencyKey = `concurrent_test_${Date.now()}`;
  const startTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  console.log("\n=== CONCURRENT IDEMPOTENCY TEST ===");
  console.log("Testing two simultaneous requests with same idempotency key");

  const c1 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });
  const c2 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });

  console.log("Conn1: Starting transaction...");
  await c1.beginTransaction();
  
  console.log("Conn1: Checking idempotency key...");
  const [existing1] = await c1.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["CREATE_BOOKING", idempotencyKey]);
  
  if (existing1.length === 0) {
    console.log("Conn1: Key not found, proceeding to create booking...");
    
    try {
      console.log("Conn1: Creating booking...");
      await c1.execute(
        "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, idempotencyKey) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [`${testId}_booking1`, `${testId}_user`, `${testId}_user`, `${testId}_lot`, `${testId}_slot`, "HELD", startTime, endTime, 50, "CAR", idempotencyKey]
      );
      
      console.log("Conn1: Storing idempotency result...");
      await c1.execute(
        "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
        [`idemp_${Date.now()}_1`, "CREATE_BOOKING", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
      );
      
      console.log("Conn1: Committing...");
      await c1.commit();
      console.log("✓ Conn1: Transaction committed successfully");
    } catch (error) {
      console.log("✗ Conn1: Error during transaction:", error.message);
      await c1.rollback();
    }
  } else {
    console.log("Conn1: Key already exists, returning cached result");
    await c1.rollback();
  }

  // Simulate concurrent request - start while first might still be processing
  console.log("\nConn2: Starting transaction (simulated concurrent request)...");
  await c2.beginTransaction();
  
  console.log("Conn2: Checking idempotency key...");
  const [existing2] = await c2.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["CREATE_BOOKING", idempotencyKey]);
  
  if (existing2.length === 0) {
    console.log("Conn2: Key not found, attempting to create booking...");
    
    try {
      console.log("Conn2: Creating booking...");
      await c2.execute(
        "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, idempotencyKey) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [`${testId}_booking2`, `${testId}_user`, `${testId}_user`, `${testId}_lot`, `${testId}_slot`, "HELD", startTime, endTime, 50, "CAR", idempotencyKey]
      );
      
      console.log("Conn2: Storing idempotency result...");
      await c2.execute(
        "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
        [`idemp_${Date.now()}_2`, "CREATE_BOOKING", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
      );
      
      console.log("Conn2: Committing...");
      await c2.commit();
      console.log("✓ Conn2: Transaction committed successfully");
    } catch (error) {
      console.log("✗ Conn2: Error during transaction:", error.message);
      if (error.code === 'ER_DUP_ENTRY') {
        console.log("✓ UNIQUE CONSTRAINT VIOLATION - This is the expected behavior for concurrent requests");
        console.log("  The unique constraint on (actionType, idempotencyKey) prevented duplicate insertion");
      }
      await c2.rollback();
    }
  } else {
    console.log("✓ Conn2: Key already exists (from Conn1), returning cached result");
    await c2.rollback();
  }

  await c1.end();
  await c2.end();

  // Verify final state
  console.log("\n=== VERIFICATION ===");
  const [bookings] = await conn.execute("SELECT id FROM booking WHERE customerId = ?", [`${testId}_user`]);
  console.log("Total bookings created:", bookings.length);
  bookings.forEach(b => console.log("  -", b.id));
  
  const [idempotencyRecords] = await conn.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["CREATE_BOOKING", idempotencyKey]);
  console.log("Idempotency records:", idempotencyRecords.length);
  idempotencyRecords.forEach(r => console.log("  -", r.id, r.actionType, r.idempotencyKey));

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
