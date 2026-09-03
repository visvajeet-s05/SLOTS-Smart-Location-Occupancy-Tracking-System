const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking"
  });

  console.log("=== VERIFYING UPDATED TRIGGERS ===");
  
  const [rows] = await conn.query("SELECT trigger_name, event_manipulation FROM information_schema.triggers WHERE event_object_table = ?", ["booking"]);
  rows.forEach(r => console.log("  - " + r.trigger_name + " | " + r.event_manipulation));

  console.log("\n=== INSERT TRIGGER BODY ===");
  const [insertBody] = await conn.query("SHOW CREATE TRIGGER prevent_overlapping_bookings_insert");
  console.log(insertBody[0]["SQL Original Statement"]);

  console.log("\n=== UPDATE TRIGGER BODY ===");
  const [updateBody] = await conn.query("SHOW CREATE TRIGGER prevent_overlapping_bookings_update");
  console.log(updateBody[0]["SQL Original Statement"]);

  await conn.end();
  console.log("\nVerification complete.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
