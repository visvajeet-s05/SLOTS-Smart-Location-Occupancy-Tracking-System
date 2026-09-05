/**
 * Local Buffer Store
 * Stores occupancy transitions locally in memory for edge synchronization
 */

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
 * SQLite Edge Buffer Store (In-Memory Implementation for AI Studio)
 */
class SQLiteEdgeBuffer {
  private events: Map<string, OccupancyEvent> = new Map()
  private dbPath: string
  private isInitialized = false

  constructor(dbPath?: string) {
    this.dbPath = dbPath || "edge_buffer_store"
  }

  initialize(): void {
    this.isInitialized = true
    console.log("Edge buffer initialized in memory")
  }

  queueOccupancyEvent(slotId: string, state: number, timestamp: Date): string {
    const eventId = `${slotId}-${timestamp.getTime()}`
    this.events.set(eventId, {
      id: eventId,
      slotId,
      state,
      timestamp,
      synced: false,
    })
    console.log(`Queued occupancy event: ${eventId} - Slot: ${slotId}, State: ${state}`)
    return eventId
  }

  getUnsyncedEvents(limit: number = 100): OccupancyEvent[] {
    const unsynced: OccupancyEvent[] = []
    for (const event of this.events.values()) {
      if (!event.synced) {
        unsynced.push(event)
      }
      if (unsynced.length >= limit) break
    }
    return unsynced.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  }

  markEventsAsSynced(eventIds: string[]): number {
    let count = 0
    for (const id of eventIds) {
      const event = this.events.get(id)
      if (event && !event.synced) {
        event.synced = true
        count++
      }
    }
    return count
  }

  markEventAsSynced(eventId: string): boolean {
    const event = this.events.get(eventId)
    if (event) {
      event.synced = true
      return true
    }
    return false
  }

  getSyncStatus(): SyncStatus {
    let synced = 0
    let lastSync: Date | null = null
    for (const event of this.events.values()) {
      if (event.synced) {
        synced++
        if (!lastSync || event.timestamp > lastSync) {
          lastSync = event.timestamp
        }
      }
    }
    const total = this.events.size
    return {
      totalEvents: total,
      syncedEvents: synced,
      unsyncedEvents: total - synced,
      lastSyncTime: lastSync,
    }
  }

  getSlotEvents(slotId: string, limit: number = 50): OccupancyEvent[] {
    const slotEvents: OccupancyEvent[] = []
    for (const event of this.events.values()) {
      if (event.slotId === slotId) {
        slotEvents.push(event)
      }
    }
    return slotEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }

  cleanupOldEvents(olderThanDays: number = 7): number {
    const cutoff = Date.now() - olderThanDays * 86400000
    let removed = 0
    for (const [id, event] of this.events.entries()) {
      if (event.synced && event.timestamp.getTime() < cutoff) {
        this.events.delete(id)
        removed++
      }
    }
    return removed
  }

  getDatabaseSize(): number {
    return this.events.size * 128
  }

  close(): void {
    this.isInitialized = false
  }

  vacuum(): void {}

  getDatabase(): any {
    return {
      prepare: () => ({
        get: () => null,
        all: () => [],
        run: () => ({ changes: 0 }),
      }),
      exec: () => {},
    }
  }
}

let sqliteEdgeBuffer: SQLiteEdgeBuffer | null = null

export function getSQLiteEdgeBuffer(dbPath?: string): SQLiteEdgeBuffer {
  if (!sqliteEdgeBuffer) {
    sqliteEdgeBuffer = new SQLiteEdgeBuffer(dbPath)
    sqliteEdgeBuffer.initialize()
  }
  return sqliteEdgeBuffer
}

export function closeSQLiteEdgeBuffer(): void {
  if (sqliteEdgeBuffer) {
    sqliteEdgeBuffer.close()
    sqliteEdgeBuffer = null
  }
}

export { SQLiteEdgeBuffer }
