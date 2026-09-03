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
  
  console.log("Test data created");

  const idempotencyKey = `race_test_${Date.now()}`;

  console.log("\n=== GENUINELY CONCURRENT IDEMPOTENCY RACE TEST ===");
  console.log("Testing if both connections can insert the same idempotency key simultaneously");

  const c1 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });
  const c2 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });

  // Start both transactions
  console.log("Both connections starting transactions simultaneously...");
  await c1.beginTransaction();
  await c2.beginTransaction();

  // Both try to insert the same idempotency key simultaneously
  console.log("Both connections attempting to insert idempotency key simultaneously...");
  
  const ip1 = c1.execute(
    "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [`idemp_${Date.now()}_1`, "HOLD_SLOT", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );
  
  const ip2 = c2.execute(
    "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [`idemp_${Date.now()}_2`, "HOLD_SLOT", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );

  // Wait for both operations to complete
  const results = await Promise.allSettled([ip1, ip2]);
  
  console.log("\n=== RACE RESULTS ===");
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`Conn${index + 1}: ✓ Idempotency key insert succeeded`);
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
  const [idempotencyRecords] = await conn.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["HOLD_SLOT", idempotencyKey]);
  console.log("Idempotency records:", idempotencyRecords.length);
  idempotencyRecords.forEach(r => console.log("  -", r.id, r.actionType, r.idempotencyKey));

  if (idempotencyRecords.length === 1) {
    console.log("✓ CONCURRENT TEST PASSED: UNIQUE CONSTRAINT prevented duplicate despite race");
  } else {
    console.log("✗ CONCURRENT TEST FAILED: Wrong number of records:", idempotencyRecords.length);
  }

  // Cleanup
  console.log("\n=== CLEANUP ===");
  await conn.execute("DELETE FROM idempotencykeys WHERE userId = ?", [`${testId}_user`]);
  await conn.execute("DELETE FROM user WHERE id = ?", [`${testId}_user`]);
  
  await conn.end();
  console.log("Cleanup complete");
  console.log("\n=== TEST COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
