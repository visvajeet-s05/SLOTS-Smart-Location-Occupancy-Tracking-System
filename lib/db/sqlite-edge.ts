/**
 * Local SQLite Buffer Store
 * Stores occupancy transitions locally during internet dropouts
 * for edge-first synchronization with central cloud database
 */

import Database from "better-sqlite3"
import path from "path"

export interface OccupancyEvent {
  id: string
  slotId: string
  state: number // 0 = AVAILABLE, 1 = OCCUPIED
  timestamp: Date
  synced: boolean
}

export interface SyncStatus {
  totalEvents: number
  syncedEvents: number
  unsyncedEvents: number
  lastSyncTime: Date | null
}

/**
 * SQLite Edge Buffer Store
 * Local database for offline event buffering
 */
class SQLiteEdgeBuffer {
  private db: Database.Database | null = null
  private dbPath: string
  private readonly MAX_RETRY_ATTEMPTS = 3

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), "data", "edge_buffer.db")
  }

  /**
   * Initialize database and create schema
   */
  initialize(): void {
    try {
      // Ensure data directory exists
      const fs = require("fs")
      const dataDir = path.dirname(this.dbPath)
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }

      this.db = new Database(this.dbPath)
      this.createSchema()
      console.log(`SQLite edge buffer initialized at ${this.dbPath}`)
    } catch (error) {
      console.error("Failed to initialize SQLite edge buffer:", error)
      throw error
    }
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        slot_id TEXT NOT NULL,
        state INTEGER NOT NULL,
        timestamp DATETIME NOT NULL,
        synced INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `

    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_events_synced ON events(synced);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_slot_id ON events(slot_id);
    `

    this.db.exec(createTableSQL)
    this.db.exec(createIndexSQL)
  }

  /**
   * Queue occupancy event for storage
   */
  queueOccupancyEvent(slotId: string, state: number, timestamp: Date): string {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    const eventId = `${slotId}-${timestamp.getTime()}`

    try {
      const insertSQL = `
        INSERT INTO events (id, slot_id, state, timestamp, synced)
        VALUES (?, ?, ?, ?, 0)
      `

      const stmt = this.db.prepare(insertSQL)
      stmt.run(eventId, slotId, state, timestamp.toISOString())

      console.log(`Queued occupancy event: ${eventId} - Slot: ${slotId}, State: ${state}`)
      return eventId
    } catch (error) {
      console.error("Failed to queue occupancy event:", error)
      throw error
    }
  }

  /**
   * Get unsynced events ordered chronologically
   */
  getUnsyncedEvents(limit: number = 100): OccupancyEvent[] {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    const selectSQL = `
      SELECT id, slot_id, state, timestamp, synced
      FROM events
      WHERE synced = 0
      ORDER BY timestamp ASC
      LIMIT ?
    `

    const stmt = this.db.prepare(selectSQL)
    const rows = stmt.all(limit) as any[]

    return rows.map(row => ({
      id: row.id,
      slotId: row.slot_id,
      state: row.state,
      timestamp: new Date(row.timestamp),
      synced: row.synced === 1,
    }))
  }

  /**
   * Mark events as synced
   */
  markEventsAsSynced(eventIds: string[]): number {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    if (eventIds.length === 0) {
      return 0
    }

    const updateSQL = `
      UPDATE events
      SET synced = 1
      WHERE id IN (${eventIds.map(() => "?").join(",")})
    `

    const stmt = this.db.prepare(updateSQL)
    const result = stmt.run(...eventIds)

    console.log(`Marked ${result.changes} events as synced`)
    return result.changes
  }

  /**
   * Mark single event as synced
   */
  markEventAsSynced(eventId: string): boolean {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    const updateSQL = `
      UPDATE events
      SET synced = 1
      WHERE id = ?
    `

    const stmt = this.db.prepare(updateSQL)
    const result = stmt.run(eventId)

    return result.changes > 0
  }

  /**
   * Get sync status
   */
  getSyncStatus(): SyncStatus {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    const totalSQL = "SELECT COUNT(*) as count FROM events"
    const syncedSQL = "SELECT COUNT(*) as count FROM events WHERE synced = 1"
    const lastSyncSQL = "SELECT MAX(created_at) as last_sync FROM events WHERE synced = 1"

    const totalStmt = this.db.prepare(totalSQL)
    const syncedStmt = this.db.prepare(syncedSQL)
    const lastSyncStmt = this.db.prepare(lastSyncSQL)

    const total = (totalStmt.get() as any).count
    const synced = (syncedStmt.get() as any).count
    const lastSyncResult = lastSyncStmt.get() as any

    return {
      totalEvents: total,
      syncedEvents: synced,
      unsyncedEvents: total - synced,
      lastSyncTime: lastSyncResult.last_sync ? new Date(lastSyncResult.last_sync) : null,
    }
  }

  /**
   * Get events for a specific slot
   */
  getSlotEvents(slotId: string, limit: number = 50): OccupancyEvent[] {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    const selectSQL = `
      SELECT id, slot_id, state, timestamp, synced
      FROM events
      WHERE slot_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `

    const stmt = this.db.prepare(selectSQL)
    const rows = stmt.all(slotId, limit) as any[]

    return rows.map(row => ({
      id: row.id,
      slotId: row.slot_id,
      state: row.state,
      timestamp: new Date(row.timestamp),
      synced: row.synced === 1,
    }))
  }

  /**
   * Delete old synced events (cleanup)
   */
  cleanupOldEvents(olderThanDays: number = 7): number {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const deleteSQL = `
      DELETE FROM events
      WHERE synced = 1 AND timestamp < ?
    `

    const stmt = this.db.prepare(deleteSQL)
    const result = stmt.run(cutoffDate.toISOString())

    console.log(`Cleaned up ${result.changes} old events`)
    return result.changes
  }

  /**
   * Get database size in bytes
   */
  getDatabaseSize(): number {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    const fs = require("fs")
    const stats = fs.statSync(this.dbPath)
    return stats.size
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      console.log("SQLite edge buffer closed")
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  vacuum(): void {
    if (!this.db) {
      throw new Error("Database not initialized")
    }

    this.db.exec("VACUUM")
    console.log("Database vacuumed")
  }

  /**
   * Get raw database instance (for advanced operations)
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error("Database not initialized")
    }
    return this.db
  }
}

// Singleton instance
let sqliteEdgeBuffer: SQLiteEdgeBuffer | null = null

/**
 * Get or create SQLite edge buffer instance
 */
export function getSQLiteEdgeBuffer(dbPath?: string): SQLiteEdgeBuffer {
  if (!sqliteEdgeBuffer) {
    sqliteEdgeBuffer = new SQLiteEdgeBuffer(dbPath)
    sqliteEdgeBuffer.initialize()
  }
  return sqliteEdgeBuffer
}

/**
 * Close SQLite edge buffer instance
 */
export function closeSQLiteEdgeBuffer(): void {
  if (sqliteEdgeBuffer) {
    sqliteEdgeBuffer.close()
    sqliteEdgeBuffer = null
  }
}

export { SQLiteEdgeBuffer }