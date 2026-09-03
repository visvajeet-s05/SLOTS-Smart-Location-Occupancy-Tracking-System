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

  console.log("\n=== RACE CONDITION TEST ===");
  console.log("Testing both connections trying to insert idempotency key simultaneously");

  const c1 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });
  const c2 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });

  // Start both transactions
  console.log("Conn1: Starting transaction...");
  await c1.beginTransaction();
  console.log("Conn2: Starting transaction...");
  await c2.beginTransaction();

  // Both try to insert the idempotency key simultaneously
  console.log("Both connections attempting to insert idempotency key simultaneously...");
  
  // Add a small delay to ensure they truly overlap
  await new Promise(r => setTimeout(r, 10));
  
  const p1 = c1.execute(
    "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [`idemp_${Date.now()}_1`, "CREATE_BOOKING", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );
  
  const p2 = c2.execute(
    "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [`idemp_${Date.now()}_2`, "CREATE_BOOKING", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );
  
  const results = await Promise.allSettled([p1, p2]);

  console.log("\n=== RACE RESULTS ===");
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`Conn${index + 1}: ✓ Successfully inserted idempotency key`);
    } else {
      console.log(`Conn${index + 1}: ✗ Failed with error:`, result.reason.message);
      if (result.reason.code === 'ER_DUP_ENTRY') {
        console.log(`  ✓ UNIQUE CONSTRAINT VIOLATION - This is expected behavior`);
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
  const [idempotencyRecords] = await conn.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["CREATE_BOOKING", idempotencyKey]);
  console.log("Idempotency records after race:", idempotencyRecords.length);
  idempotencyRecords.forEach(r => console.log("  -", r.id, r.actionType, r.idempotencyKey));

  if (idempotencyRecords.length === 1) {
    console.log("✓ UNIQUE CONSTRAINT WORKING: Only one record despite race condition");
  } else {
    console.log("✗ UNIQUE CONSTRAINT FAILED: Multiple records created:", idempotencyRecords.length);
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
