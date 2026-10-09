
const mysql = require("mysql2/promise");
async function main() {
  const conn = await mysql.createConnection({host:"localhost",port:3306,user:"root",password:"1324",database:"smart_parking"});
  
  console.log("=== TRIGGERS ON booking TABLE ===");
  const [trigs] = await conn.execute("SELECT trigger_name, event_manipulation FROM information_schema.triggers WHERE event_object_table = ?", ["booking"]);
  trigs.forEach(t => console.log("  - " + t.trigger_name + " | " + t.event_manipulation));
  if (trigs.length === 0) console.log("  NONE FOUND");
  
  console.log("\n=== FK CONSTRAINTS ON booking TABLE ===");
  const [fks] = await conn.execute("SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL", ["booking"]);
  fks.forEach(f => console.log("  - " + f.CONSTRAINT_NAME + " | col=" + f.COLUMN_NAME + " -> " + f.REFERENCED_TABLE_NAME + "." + f.REFERENCED_COLUMN_NAME));
  
  console.log("\n=== ENGINE CHECK ===");
  const [eng] = await conn.execute("SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (" + String.fromCharCode(39) + "booking" + String.fromCharCode(39) + ", " + String.fromCharCode(39) + "slot" + String.fromCharCode(39) + ")");
  eng.forEach(e => console.log("  - " + e.TABLE_NAME + ": " + e.ENGINE));
  
  await conn.end();
}
main().catch(e => console.error(e));
