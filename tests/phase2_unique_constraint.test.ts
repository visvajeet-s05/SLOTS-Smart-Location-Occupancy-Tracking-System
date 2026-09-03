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

  const idempotencyKey = `unique_test_${Date.now()}`;

  console.log("\n=== UNIQUE CONSTRAINT TEST ===");
  console.log("Testing if @@unique([actionType, idempotencyKey]) prevents duplicates");

  // First insert
  console.log("First insert attempt...");
  try {
    await conn.execute(
      "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
      [`idemp_${Date.now()}_1`, "CREATE_BOOKING", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
    );
    console.log("✓ First insert succeeded");
  } catch (error) {
    console.log("✗ First insert failed:", error.message);
  }

  // Second insert with same key (should fail due to unique constraint)
  console.log("Second insert attempt with same key...");
  try {
    await conn.execute(
      "INSERT INTO idempotencykeys (id, actionType, idempotencyKey, userId, result, processedAt, expiresAt) VALUES (?,?,?,?,?,?,?)",
      [`idemp_${Date.now()}_2`, "CREATE_BOOKING", idempotencyKey, `${testId}_user`, JSON.stringify({ success: true }), new Date(), new Date(Date.now() + 24 * 60 * 60 * 1000)]
    );
    console.log("✗ Second insert succeeded (UNIQUE CONSTRAINT NOT WORKING)");
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log("✓ Second insert failed with UNIQUE CONSTRAINT VIOLATION (expected)");
      console.log("  Error:", error.message);
    } else {
      console.log("✗ Second insert failed with unexpected error:", error.message);
    }
  }

  // Verify final state
  console.log("\n=== VERIFICATION ===");
  const [idempotencyRecords] = await conn.execute("SELECT * FROM idempotencykeys WHERE actionType = ? AND idempotencyKey = ?", ["CREATE_BOOKING", idempotencyKey]);
  console.log("Idempotency records:", idempotencyRecords.length);
  idempotencyRecords.forEach(r => console.log("  -", r.id, r.actionType, r.idempotencyKey));

  if (idempotencyRecords.length === 1) {
    console.log("✓ UNIQUE CONSTRAINT WORKING: Only one record despite duplicate insert attempt");
  } else {
    console.log("✗ UNIQUE CONSTRAINT FAILED: Wrong number of records:", idempotencyRecords.length);
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
