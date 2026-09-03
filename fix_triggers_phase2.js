const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection({
    host: "localhost", port: 3306, user: "root", password: "1324", database: "smart_parking"
  });

  console.log("Step 1: Drop existing triggers...");
  await conn.query("DROP TRIGGER IF EXISTS prevent_overlapping_bookings_insert");
  console.log("OK: Dropped insert trigger");
  await conn.query("DROP TRIGGER IF EXISTS prevent_overlapping_bookings_update");
  console.log("OK: Dropped update trigger");

  // INSERT trigger with HELD only (per B6 spec, PENDING_PAYMENT removed)
  const insertTrigger = `CREATE TRIGGER prevent_overlapping_bookings_insert
BEFORE INSERT ON booking
FOR EACH ROW
BEGIN
  DECLARE overlap_count INT;
  IF NEW.slotId IS NOT NULL AND NEW.status IN ('HELD', 'CONFIRMED', 'ACTIVE') THEN
    -- Must run before any other read in this trigger — establishes the transaction's read view on the latest committed data. Do not reorder.
    SELECT id INTO @locked_slot FROM slot WHERE id = NEW.slotId FOR UPDATE;
    SELECT COUNT(*) INTO overlap_count
    FROM booking
    WHERE slotId = NEW.slotId
      AND status IN ('HELD', 'CONFIRMED', 'ACTIVE')
      AND id != IFNULL(NEW.id, '')
      AND (NEW.startTime < endTime AND NEW.endTime > startTime);
    IF overlap_count > 0 THEN
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Overlapping booking detected for the same slot and time range';
    END IF;
  END IF;
END`;

  console.log("\nStep 2: Creating INSERT trigger with HELD only (per B6 spec)...");
  try {
    await conn.query(insertTrigger);
    console.log("OK: INSERT trigger created");
  } catch(e) {
    console.log("ERROR:", e.code, "-", e.message.substring(0, 150));
  }

  // UPDATE trigger with HELD only (per B6 spec, PENDING_PAYMENT removed)
  const updateTrigger = `CREATE TRIGGER prevent_overlapping_bookings_update
BEFORE UPDATE ON booking
FOR EACH ROW
BEGIN
  DECLARE overlap_count INT;
  IF (NEW.slotId != OLD.slotId OR NEW.startTime != OLD.startTime OR NEW.endTime != OLD.endTime)
     OR (NEW.status IN ('HELD', 'CONFIRMED', 'ACTIVE') AND OLD.status NOT IN ('HELD', 'CONFIRMED', 'ACTIVE'))
  THEN
    IF NEW.slotId IS NOT NULL AND NEW.status IN ('HELD', 'CONFIRMED', 'ACTIVE') THEN
      -- Must run before any other read in this trigger — establishes the transaction's read view on the latest committed data. Do not reorder.
      SELECT id INTO @locked_slot FROM slot WHERE id = NEW.slotId FOR UPDATE;
      SELECT COUNT(*) INTO overlap_count
      FROM booking
      WHERE slotId = NEW.slotId
        AND status IN ('HELD', 'CONFIRMED', 'ACTIVE')
        AND id != NEW.id
        AND (NEW.startTime < endTime AND NEW.endTime > startTime);
      IF overlap_count > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Overlapping booking detected for the same slot and time range';
      END IF;
    END IF;
  END IF;
END`;

  console.log("\nStep 3: Creating UPDATE trigger with HELD only (per B6 spec)...");
  try {
    await conn.query(updateTrigger);
    console.log("OK: UPDATE trigger created");
  } catch(e) {
    console.log("ERROR:", e.code, "-", e.message.substring(0, 150));
  }

  // Verify
  console.log("\n=== VERIFICATION: Triggers on booking ===");
  const [rows] = await conn.query("SELECT trigger_name, event_manipulation FROM information_schema.triggers WHERE event_object_table = ?", ["booking"]);
  rows.forEach(r => console.log("  - " + r.trigger_name + " | " + r.event_manipulation));

  console.log("\n=== UPDATED TRIGGER BODIES ===");
  const [insertBody] = await conn.query("SHOW CREATE TRIGGER prevent_overlapping_bookings_insert");
  console.log("INSERT TRIGGER:");
  console.log(insertBody[0]["Create Trigger"]);
  
  const [updateBody] = await conn.query("SHOW CREATE TRIGGER prevent_overlapping_bookings_update");
  console.log("\nUPDATE TRIGGER:");
  console.log(updateBody[0]["Create Trigger"]);

  await conn.end();
  console.log("\nDone.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
