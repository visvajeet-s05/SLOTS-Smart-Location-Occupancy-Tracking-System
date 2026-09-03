const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking",
  });

  const T = "test_" + Date.now();
  const lotId = T + "_lot";
  const ownerId = T + "_owner";
  const custId = T + "_cust";
  const profId = T + "_prof";
  const slotX = T + "_target";
  const slotX2 = T + "_target2";
  const slotA = T + "_a";
  const slotB = T + "_b";

  console.log("=== SETUP ===");
  await conn.execute("INSERT INTO user (id, email, name, role, preferredCurrency, walletBalance) VALUES (?,?,?,?,?,?)",
    [ownerId, T+"@owner.com", "Owner", "OWNER", "INR", 0]);
  await conn.execute("INSERT INTO user (id, email, name, role, preferredCurrency, walletBalance) VALUES (?,?,?,?,?,?)",
    [custId, T+"@cust.com", "Cust", "CUSTOMER", "INR", 0]);
  await conn.execute("INSERT INTO ownerprofile (id, userId, businessName, phone, status) VALUES (?,?,?,?,?)",
    [profId, ownerId, "Biz", "123", "OWNER_ACTIVE"]);
  await conn.execute("INSERT INTO parkinglot (id, ownerId, name, address, lat, lng, totalSlots, timezone) VALUES (?,?,?,?,?,?,?,?)",
    [lotId, profId, "Test", "Addr", 0, 0, 10, "Asia/Kolkata"]);
  await conn.execute("INSERT INTO slot (id, lotId, slotNumber, row, status, aiConfidence, price, slotType) VALUES (?,?,?,?,?,?,?,?)",
    [slotX, lotId, 1, "A", "AVAILABLE", 100, 50, "REGULAR"]);
  await conn.execute("INSERT INTO slot (id, lotId, slotNumber, row, status, aiConfidence, price, slotType) VALUES (?,?,?,?,?,?,?,?)",
    [slotX2, lotId, 2, "A", "AVAILABLE", 100, 50, "REGULAR"]);
  await conn.execute("INSERT INTO slot (id, lotId, slotNumber, row, status, aiConfidence, price, slotType) VALUES (?,?,?,?,?,?,?,?)",
    [slotA, lotId, 3, "A", "AVAILABLE", 100, 50, "REGULAR"]);
  await conn.execute("INSERT INTO slot (id, lotId, slotNumber, row, status, aiConfidence, price, slotType) VALUES (?,?,?,?,?,?,?,?)",
    [slotB, lotId, 4, "A", "AVAILABLE", 100, 50, "REGULAR"]);
  console.log("All test data created");

  const baseTime = "2026-08-25 10:00:00.000";
  const endTime = "2026-08-25 11:00:00.000";

  // =====================================================
  // TEST 1: INSERT Race
  // =====================================================
  console.log("\n=== TEST 1: INSERT Race (separate connections, timed) ===\n");

  const c1 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });
  const c2 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });

  console.log("Conn1: beginTransaction -> INSERT booking A into slotX...");
  await c1.beginTransaction();
  await c1.execute(
    "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, vehicleNumber) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [T + "_t1_a", custId, ownerId, lotId, slotX, "HELD", baseTime, endTime, 50, "CAR", "VA"]
  );
  console.log("Conn1: booking A inserted. Will COMMIT in 3 seconds...");

  const commitPromise = new Promise((resolve) => {
    setTimeout(async () => {
      console.log("Conn1: COMMIT (3s elapsed)");
      await c1.commit();
      resolve();
    }, 3000);
  });

  await new Promise(r => setTimeout(r, 500));
  console.log("Conn2: Attempting INSERT booking B into same slotX (should block on FOR UPDATE lock)...");
  const t2s = Date.now();
  let c2result = null, c2err = null;
  try {
    await c2.execute(
      "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, vehicleNumber) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [T + "_t1_b", custId, ownerId, lotId, slotX, "HELD", baseTime, endTime, 50, "CAR", "VB"]
    );
    c2result = "INSERTED";
  } catch(e) {
    c2err = e.message;
    c2result = "REJECTED";
  }
  const t2e = Date.now();

  await commitPromise;
  await c1.end();
  await c2.end();

  console.log("\n--- TEST 1 Results ---");
  console.log("  Booking A: INSERTED OK");
  console.log("  Booking B: " + c2result + (c2err ? " - " + c2err.substring(0, 120) : ""));
  console.log("  Conn2 blocked duration: " + (t2e - t2s) + "ms");
  const t1pass = (t2e - t2s > 2500 && c2result === "REJECTED");
  console.log("  INSERT Test: " + (t1pass ? "PASS" : "FAIL"));

  // =====================================================
  // TEST 2: UPDATE Race
  // =====================================================
  console.log("\n=== TEST 2: UPDATE Race (separate connections, timed) ===\n");

  const b3 = T + "_t2_orig1";
  const b4 = T + "_t2_orig2";
  await conn.execute(
    "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, vehicleNumber) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [b3, custId, ownerId, lotId, slotA, "HELD", baseTime, endTime, 50, "CAR", "V1"]
  );
  await conn.execute(
    "INSERT INTO booking (id, customerId, ownerId, parkingLotId, slotId, status, startTime, endTime, amount, vehicleType, vehicleNumber) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [b4, custId, ownerId, lotId, slotB, "HELD", baseTime, endTime, 50, "CAR", "V2"]
  );
  console.log("OK: booking1 on slotA, booking2 on slotB");

  const c3 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });
  const c4 = await mysql.createConnection({ host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking" });

  console.log("Conn3: beginTransaction -> UPDATE booking1 (slotA -> slotX2)...");
  await c3.beginTransaction();
  await c3.execute("UPDATE booking SET slotId = ? WHERE id = ?", [slotX2, b3]);
  console.log("Conn3: booking1 moved to slotX2. Will COMMIT in 3 seconds...");

  const commit2 = new Promise((resolve) => {
    setTimeout(async () => {
      console.log("Conn3: COMMIT (3s elapsed)");
      await c3.commit();
      resolve();
    }, 3000);
  });

  await new Promise(r => setTimeout(r, 500));
  console.log("Conn4: Attempting UPDATE booking2 (slotB -> slotX2) (should block)...");
  const t4s = Date.now();
  let c4result = null, c4err = null;
  try {
    const [res] = await c4.execute("UPDATE booking SET slotId = ? WHERE id = ?", [slotX2, b4]);
    c4result = "UPDATED (" + res.affectedRows + " rows)";
  } catch(e) {
    c4err = e.message;
    c4result = "REJECTED";
  }
  const t4e = Date.now();

  await commit2;
  await c3.end();
  await c4.end();

  console.log("\n--- TEST 2 Results ---");
  console.log("  Booking 1 (slotA -> slotX2): UPDATED");
  console.log("  Booking 2 (slotB -> slotX2): " + c4result + (c4err ? " - " + c4err.substring(0, 120) : ""));
  console.log("  Conn4 blocked duration: " + (t4e - t4s) + "ms");
  const t2pass = (t4e - t4s > 2500 && c4result === "REJECTED");
  console.log("  UPDATE Test: " + (t2pass ? "PASS" : "FAIL"));

  // =====================================================
  // FINAL SUMMARY
  // =====================================================
  console.log("\n=== FINAL SUMMARY ===");
  console.log("INSERT concurrency test: " + (t1pass ? "PASS" : "FAIL"));
  console.log("  Blocking duration: " + (t2e - t2s) + "ms");
  console.log("  Conn2 result: " + c2result);
  console.log("  Conn2 error: " + (c2err ? c2err.substring(0, 150) : "none"));
  console.log("UPDATE concurrency test: " + (t2pass ? "PASS" : "FAIL"));
  console.log("  Blocking duration: " + (t4e - t4s) + "ms");
  console.log("  Conn4 result: " + c4result);
  console.log("  Conn4 error: " + (c4err ? c4err.substring(0, 150) : "none"));

  // Cleanup
  console.log("\n=== Cleanup ===");
  await conn.execute("DELETE FROM booking WHERE id LIKE ?", [T + "%"]);
  await conn.execute("DELETE FROM slot WHERE id LIKE ?", [T + "%"]);
  await conn.execute("DELETE FROM parkinglot WHERE id LIKE ?", [T + "%"]);
  await conn.execute("DELETE FROM ownerprofile WHERE id LIKE ?", [T + "%"]);
  await conn.execute("DELETE FROM user WHERE id LIKE ?", [T + "%"]);
  console.log("Cleanup complete");
  await conn.end();
  console.log("\n=== ALL TESTS COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message || e); process.exit(1); });