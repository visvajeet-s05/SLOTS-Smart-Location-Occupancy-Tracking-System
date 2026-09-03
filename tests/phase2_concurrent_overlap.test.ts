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

  console.log("\n=== IDEMPOTENCY RACE TEST ===");
  console.log("Conn1 starts first, inserts idempotency key, commits after 500ms");
  console.log("Conn2 starts after 200ms, attempts insert (will encounter race)");

  const c1 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });
  const c2 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });

  // Conn1 starts transaction and inserts
  console.log("Conn1: Starting transaction and inserting idempotency key...");
  await c1.beginTransaction();
  await c1.execute(
    "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [`idemp_${Date.now()}_1`, "HOLD_SLOT", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true, bookingId: "booking1" }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
  );
  console.log("Conn1: Idempotency key inserted (not yet committed)");

  // Schedule Conn1 to commit after 500ms
  setTimeout(async () => {
    console.log("Conn1: Committing after 500ms delay...");
    await c1.commit();
    console.log("Conn1: Committed");
    await c1.end();
  }, 500);

  // Conn2 starts after 200ms (while Conn1 is still in transaction)
  setTimeout(async () => {
    console.log("Conn2: Starting transaction (Conn1 still in transaction)...");
    await c2.beginTransaction();
    
    let start = Date.now();
    try {
      console.log("Conn2: Attempting to insert same idempotency key...");
      await c2.execute(
        "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
        [`idemp_${Date.now()}_2`, "HOLD_SLOT", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true, bookingId: "booking2" }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
      );
      const duration = Date.now() - start;
      console.log("Conn2: Insert succeeded (unexpected - took", duration, "ms)");
      await c2.commit();
      console.log("Conn2: Committed");
    } catch (error) {
      const duration = Date.now() - start;
      console.log("Conn2: Insert failed after", duration, "ms with error:", error.code, "-", error.message);
      if (error.code === 'ER_DUP_ENTRY') {
        console.log("Conn2: UNIQUE CONSTRAINT VIOLATION - Expected behavior (race detected)");
        console.log("Conn2: Reading existing idempotency record to return cached result...");
        const [existing] = await c2.execute(
          "SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?",
          ["HOLD_SLOT", idempotencyKey]
        );
        console.log("Conn2: Found existing record:", existing[0].id, existing[0].result);
        await c2.commit();
        console.log("Conn2: Committed (after reading cached result)");
      } else {
        await c2.rollback();
        console.log("Conn2: Rolled back due to unexpected error");
      }
    }
    
    await c2.end();
    
    // Verify final state
    console.log("\n=== VERIFICATION ===");
    const [idempotencyRecords] = await conn.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["HOLD_SLOT", idempotencyKey]);
    console.log("Idempotency records:", idempotencyRecords.length);
    idempotencyRecords.forEach(r => console.log("  -", r.id, r.actionType, r.idempotencyKey, r.result));

    if (idempotencyRecords.length === 1) {
      console.log("✓ CONCURRENT TEST PASSED: UNIQUE CONSTRAINT prevented duplicate, Conn2 recovered with cached result");
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
  }, 200);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
