/**
 * Local Edge SQLite Offline State Buffer
 * Ensures barrier gates and RFID/FASTag readers continue during network loss
 * Uses better-sqlite3 for synchronous, lightweight edge operations
 */

// In production, this would use better-sqlite3
// For now, implementing with in-memory fallback
class SQLiteBuffer {
  private db: any = null
  private isOffline: boolean = false
  private offlineTransactions: any[] = []

  /**
   * Initialize SQLite database
   */
  async initialize(dbPath: string = "./edge_buffer.db"): Promise<void> {
    try {
      // In production: const Database = require('better-sqlite3')
      // this.db = new Database(dbPath)
      
      // Create tables
      // this.db.exec(`
      //   CREATE TABLE IF NOT EXISTS offline_bookings (
      //     id TEXT PRIMARY KEY,
      //     customerId TEXT,
      //     vehicleNumber TEXT,
      //     slotId TEXT,
      //     startTime INTEGER,
      //     endTime INTEGER,
      //     status TEXT,
      //     synced INTEGER DEFAULT 0,
      //     createdAt INTEGER
      //   );
      //   
      //   CREATE TABLE IF NOT EXISTS offline_transactions (
      //     id TEXT PRIMARY KEY,
      //     type TEXT,
      //     data TEXT,
      //     synced INTEGER DEFAULT 0,
      //     createdAt INTEGER
      //   );
      // `)
      
      console.log("[SQLITE_BUFFER] Initialized (fallback mode)")
    } catch (error) {
      console.error("[SQLITE_BUFFER] Initialization failed:", error)
    }
  }

  /**
   * Check network connectivity
   */
  async checkConnectivity(): Promise<boolean> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/health`, {
        method: "HEAD",
        signal: AbortSignal.timeout(3000),
      })
      this.isOffline = !response.ok
      return response.ok
    } catch (error) {
      this.isOffline = true
      return false
    }
  }

  /**
   * Store booking offline
   */
  async storeBookingOffline(booking: any): Promise<void> {
    const transaction = {
      id: booking.id,
      type: "BOOKING",
      data: JSON.stringify(booking),
      synced: 0,
      createdAt: Date.now(),
    }

    this.offlineTransactions.push(transaction)
    console.log(`[SQLITE_BUFFER] Stored booking offline: ${booking.id}`)
  }

  /**
   * Store entry/exit event offline
   */
  async storeEventOffline(event: any): Promise<void> {
    const transaction = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: event.type,
      data: JSON.stringify(event),
      synced: 0,
      createdAt: Date.now(),
    }

    this.offlineTransactions.push(transaction)
    console.log(`[SQLITE_BUFFER] Stored event offline: ${event.type}`)
  }

  /**
   * Get active bookings from local buffer
   */
  async getActiveBookings(): Promise<any[]> {
    // Return unsynced bookings
    return this.offlineTransactions
      .filter(t => t.type === "BOOKING" && !t.synced)
      .map(t => JSON.parse(t.data))
  }

  /**
   * Get offline transactions
   */
  async getOfflineTransactions(): Promise<any[]> {
    return this.offlineTransactions.filter(t => !t.synced)
  }

  /**
   * Mark transaction as synced
   */
  async markSynced(transactionId: string): Promise<void> {
    const transaction = this.offlineTransactions.find(t => t.id === transactionId)
    if (transaction) {
      transaction.synced = 1
      console.log(`[SQLITE_BUFFER] Marked as synced: ${transactionId}`)
    }
  }

  /**
   * Get offline status
   */
  getStatus(): { isOffline: boolean; pendingTransactions: number } {
    return {
      isOffline: this.isOffline,
      pendingTransactions: this.offlineTransactions.filter(t => !t.synced).length,
    }
  }

  /**
   * Clear synced transactions
   */
  clearSynced(): void {
    this.offlineTransactions = this.offlineTransactions.filter(t => !t.synced)
  }
}

// Singleton instance
const sqliteBuffer = new SQLiteBuffer()

/**
 * Initialize SQLite buffer
 */
export async function initializeSQLiteBuffer(dbPath?: string): Promise<void> {
  await sqliteBuffer.initialize(dbPath)
}

/**
 * Check network connectivity
 */
export async function checkEdgeConnectivity(): Promise<boolean> {
  return await sqliteBuffer.checkConnectivity()
}

/**
 * Store booking offline
 */
export async function storeBookingOffline(booking: any): Promise<void> {
  await sqliteBuffer.storeBookingOffline(booking)
}

/**
 * Store event offline
 */
export async function storeEventOffline(event: any): Promise<void> {
  await sqliteBuffer.storeEventOffline(event)
}

/**
 * Get active bookings
 */
export async function getActiveBookingsOffline(): Promise<any[]> {
  return await sqliteBuffer.getActiveBookings()
}

/**
 * Get offline transactions
 */
export async function getOfflineTransactions(): Promise<any[]> {
  return await sqliteBuffer.getOfflineTransactions()
}

/**
 * Mark transaction as synced
 */
export async function markTransactionSynced(transactionId: string): Promise<void> {
  await sqliteBuffer.markSynced(transactionId)
}

/**
 * Get buffer status
 */
export function getBufferStatus() {
  return sqliteBuffer.getStatus()
}

/**
 * Clear synced transactions
 */
export function clearSyncedTransactions(): void {
  sqliteBuffer.clearSynced()
}

export { sqliteBuffer }