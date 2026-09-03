/**
 * Edge Synchronization Worker
 * Manages offline-first state synchronization between edge node and central cloud
 */

import { getSQLiteEdgeBuffer, type OccupancyEvent } from "@/lib/db/sqlite-edge"

export interface SyncConfig {
  heartbeatInterval: number // milliseconds
  maxBatchSize: number
  maxRetryAttempts: number
  baseRetryDelay: number // milliseconds
  syncEndpoint: string
}

export interface SyncResult {
  success: boolean
  syncedCount: number
  failedCount: number
  error?: string
  duration: number
}

export interface ConnectivityStatus {
  online: boolean
  lastCheckTime: Date
  consecutiveFailures: number
}

/**
 * Edge Synchronization Worker
 * Handles offline-first synchronization with exponential backoff
 */
class EdgeSyncWorker {
  private config: SyncConfig
  private intervalId: NodeJS.Timeout | null = null
  private isRunning: boolean = false
  private connectivityStatus: ConnectivityStatus
  private retryCount: number = 0

  constructor(config?: Partial<SyncConfig>) {
    this.config = {
      heartbeatInterval: 5000, // 5 seconds
      maxBatchSize: 100,
      maxRetryAttempts: 5,
      baseRetryDelay: 1000, // 1 second
      syncEndpoint: "/api/edge/sync-batch",
      ...config,
    }

    this.connectivityStatus = {
      online: false,
      lastCheckTime: new Date(),
      consecutiveFailures: 0,
    }
  }

  /**
   * Start the sync worker
   */
  start(): void {
    if (this.isRunning) {
      console.warn("Edge sync worker is already running")
      return
    }

    this.isRunning = true
    console.log("Starting edge sync worker...")

    // Initial connectivity check
    this.checkConnectivity()

    // Start heartbeat loop
    this.intervalId = setInterval(() => {
      this.heartbeat()
    }, this.config.heartbeatInterval)
  }

  /**
   * Stop the sync worker
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    console.log("Edge sync worker stopped")
  }

  /**
   * Heartbeat loop
   */
  private async heartbeat(): Promise<void> {
    try {
      const isOnline = await this.checkConnectivity()

      if (isOnline && this.connectivityStatus.consecutiveFailures > 0) {
        // Connection restored - trigger sync
        console.log("Connection restored, triggering sync...")
        await this.sync()
      }
    } catch (error) {
      console.error("Heartbeat error:", error)
    }
  }

  /**
   * Check cloud connectivity
   */
  private async checkConnectivity(): Promise<boolean> {
    try {
      // Simple connectivity check - ping health endpoint
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/api/health`, {
        method: "GET",
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const isOnline = response.ok

      this.connectivityStatus = {
        online: isOnline,
        lastCheckTime: new Date(),
        consecutiveFailures: isOnline ? 0 : this.connectivityStatus.consecutiveFailures + 1,
      }

      return isOnline
    } catch (error) {
      this.connectivityStatus = {
        online: false,
        lastCheckTime: new Date(),
        consecutiveFailures: this.connectivityStatus.consecutiveFailures + 1,
      }

      return false
    }
  }

  /**
   * Synchronize unsynced events
   */
  async sync(): Promise<SyncResult> {
    const startTime = Date.now()
    const sqliteBuffer = getSQLiteEdgeBuffer()

    try {
      // Get unsynced events ordered chronologically
      const unsyncedEvents = sqliteBuffer.getUnsyncedEvents(this.config.maxBatchSize)

      if (unsyncedEvents.length === 0) {
        return {
          success: true,
          syncedCount: 0,
          failedCount: 0,
          duration: Date.now() - startTime,
        }
      }

      console.log(`Syncing ${unsyncedEvents.length} unsynced events...`)

      // Dispatch events in batch
      const syncResult = await this.dispatchBatch(unsyncedEvents)

      if (syncResult.success) {
        // Mark events as synced
        const syncedIds = unsyncedEvents.map(e => e.id)
        sqliteBuffer.markEventsAsSynced(syncedIds)

        // Reset retry count on success
        this.retryCount = 0

        return {
          success: true,
          syncedCount: syncResult.syncedCount,
          failedCount: syncResult.failedCount,
          duration: Date.now() - startTime,
        }
      } else {
        // Increment retry count
        this.retryCount++

        // Check if max retries exceeded
        if (this.retryCount >= this.config.maxRetryAttempts) {
          console.error("Max retry attempts exceeded, giving up")
          this.retryCount = 0
        } else {
          // Schedule retry with exponential backoff
          const delay = this.calculateRetryDelay()
          console.log(`Retry ${this.retryCount}/${this.config.maxRetryAttempts} in ${delay}ms`)
          setTimeout(() => this.sync(), delay)
        }

        return {
          success: false,
          syncedCount: 0,
          failedCount: unsyncedEvents.length,
          error: syncResult.error,
          duration: Date.now() - startTime,
        }
      }
    } catch (error: any) {
      console.error("Sync error:", error)
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        error: error.message,
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Dispatch batch of events to cloud
   */
  private async dispatchBatch(events: OccupancyEvent[]): Promise<{
    success: boolean
    syncedCount: number
    failedCount: number
    error?: string
  }> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
      const response = await fetch(`${apiUrl}${this.config.syncEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          events: events.map(e => ({
            id: e.id,
            slotId: e.slotId,
            state: e.state,
            timestamp: e.timestamp.toISOString(),
          })),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const result = await response.json()
        return {
          success: true,
          syncedCount: result.syncedCount || events.length,
          failedCount: result.failedCount || 0,
        }
      } else {
        const errorText = await response.text()
        return {
          success: false,
          syncedCount: 0,
          failedCount: events.length,
          error: `HTTP ${response.status}: ${errorText}`,
        }
      }
    } catch (error: any) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: events.length,
        error: error.message,
      }
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(): number {
    // Exponential backoff: baseDelay * 2^retryCount
    const delay = this.config.baseRetryDelay * Math.pow(2, this.retryCount)
    // Cap at 60 seconds
    return Math.min(delay, 60000)
  }

  /**
   * Force immediate sync
   */
  async forceSync(): Promise<SyncResult> {
    return await this.sync()
  }

  /**
   * Get connectivity status
   */
  getConnectivityStatus(): ConnectivityStatus {
    return { ...this.connectivityStatus }
  }

  /**
   * Get sync statistics
   */
  getSyncStats() {
    const sqliteBuffer = getSQLiteEdgeBuffer()
    const status = sqliteBuffer.getSyncStatus()
    const dbSize = sqliteBuffer.getDatabaseSize()

    return {
      ...status,
      databaseSizeBytes: dbSize,
      isRunning: this.isRunning,
      retryCount: this.retryCount,
    }
  }

  /**
   * Clean up old synced events
   */
  cleanup(olderThanDays: number = 7): number {
    const sqliteBuffer = getSQLiteEdgeBuffer()
    return sqliteBuffer.cleanupOldEvents(olderThanDays)
  }
}

// Singleton instance
let edgeSyncWorker: EdgeSyncWorker | null = null

/**
 * Get or create edge sync worker instance
 */
export function getEdgeSyncWorker(config?: Partial<SyncConfig>): EdgeSyncWorker {
  if (!edgeSyncWorker) {
    edgeSyncWorker = new EdgeSyncWorker(config)
  }
  return edgeSyncWorker
}

/**
 * Start edge sync worker
 */
export function startEdgeSyncWorker(config?: Partial<SyncConfig>): EdgeSyncWorker {
  const worker = getEdgeSyncWorker(config)
  worker.start()
  return worker
}

/**
 * Stop edge sync worker
 */
export function stopEdgeSyncWorker(): void {
  if (edgeSyncWorker) {
    edgeSyncWorker.stop()
  }
}

/**
 * Force immediate sync
 */
export async function forceEdgeSync() {
  const worker = getEdgeSyncWorker()
  return await worker.forceSync()
}

export { EdgeSyncWorker }