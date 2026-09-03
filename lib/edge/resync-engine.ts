/**
 * Automated Re-sync Engine
 * Synchronizes buffered edge transactions back to central Prisma PostgreSQL
 * when connectivity is restored
 */

import { PrismaClient } from "@prisma/client"
import { getOfflineTransactions, markTransactionSynced, clearSyncedTransactions, checkEdgeConnectivity } from "./sqlite-buffer"

const prisma = new PrismaClient()

interface SyncResult {
  success: boolean
  syncedCount: number
  failedCount: number
  errors: string[]
}

class ResyncEngine {
  private isRunning: boolean = false
  private syncInterval: NodeJS.Timeout | null = null
  private readonly SYNC_INTERVAL = 5000 // 5 seconds

  /**
   * Start re-sync engine
   */
  start(): void {
    if (this.isRunning) {
      console.log("[RESYNC_ENGINE] Already running")
      return
    }

    this.isRunning = true
    console.log("[RESYNC_ENGINE] Starting re-sync engine")

    // Run initial sync
    this.syncTransactions()

    // Schedule periodic sync
    this.syncInterval = setInterval(() => {
      this.syncTransactions()
    }, this.SYNC_INTERVAL)
  }

  /**
   * Stop re-sync engine
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.isRunning = false
    console.log("[RESYNC_ENGINE] Stopped")
  }

  /**
   * Sync offline transactions
   */
  private async syncTransactions(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    }

    try {
      // Check connectivity
      const isConnected = await checkEdgeConnectivity()
      if (!isConnected) {
        console.log("[RESYNC_ENGINE] Still offline, skipping sync")
        return result
      }

      // Get pending transactions
      const transactions = await getOfflineTransactions()
      if (transactions.length === 0) {
        return result
      }

      console.log(`[RESYNC_ENGINE] Syncing ${transactions.length} transactions`)

      // Process transactions in batches
      for (const transaction of transactions) {
        try {
          await this.processTransaction(transaction)
          await markTransactionSynced(transaction.id)
          result.syncedCount++
        } catch (error: any) {
          result.failedCount++
          result.errors.push(`${transaction.id}: ${error.message}`)
          console.error(`[RESYNC_ENGINE] Failed to sync ${transaction.id}:`, error)
        }
      }

      // Clear synced transactions
      clearSyncedTransactions()

      console.log(`[RESYNC_ENGINE] Sync complete: ${result.syncedCount} synced, ${result.failedCount} failed`)
    } catch (error: any) {
      result.success = false
      result.errors.push(error.message)
      console.error("[RESYNC_ENGINE] Sync failed:", error)
    }

    return result
  }

  /**
   * Process individual transaction
   */
  private async processTransaction(transaction: any): Promise<void> {
    const data = JSON.parse(transaction.data)

    switch (transaction.type) {
      case "BOOKING":
        await this.syncBooking(data)
        break
      case "ENTRY":
        await this.syncEntryEvent(data)
        break
      case "EXIT":
        await this.syncExitEvent(data)
        break
      case "PAYMENT":
        await this.syncPayment(data)
        break
      default:
        console.warn(`[RESYNC_ENGINE] Unknown transaction type: ${transaction.type}`)
    }
  }

  /**
   * Sync booking
   */
  private async syncBooking(booking: any): Promise<void> {
    // Check if booking already exists
    const existing = await prisma.booking.findUnique({
      where: { id: booking.id },
    })

    if (existing) {
      console.log(`[RESYNC_ENGINE] Booking ${booking.id} already exists, skipping`)
      return
    }

    // Create booking
    await prisma.booking.create({
      data: booking,
    })

    console.log(`[RESYNC_ENGINE] Synced booking: ${booking.id}`)
  }

  /**
   * Sync entry event
   */
  private async syncEntryEvent(event: any): Promise<void> {
    // Update booking status to ACTIVE
    if (event.bookingId) {
      await prisma.booking.update({
        where: { id: event.bookingId },
        data: { status: "ACTIVE" },
      })
    }

    // Update bay status
    if (event.bayId) {
      await prisma.parkingBay.update({
        where: { id: event.bayId },
        data: { status: "OCCUPIED", currentPlate: event.vehicleNumber },
      })
    }

    console.log(`[RESYNC_ENGINE] Synced entry event: ${event.bookingId}`)
  }

  /**
   * Sync exit event
   */
  private async syncExitEvent(event: any): Promise<void> {
    // Update booking status to COMPLETED
    if (event.bookingId) {
      await prisma.booking.update({
        where: { id: event.bookingId },
        data: { status: "COMPLETED", endTime: new Date() },
      })
    }

    // Release bay
    if (event.bayId) {
      await prisma.parkingBay.update({
        where: { id: event.bayId },
        data: { status: "AVAILABLE", currentPlate: null },
      })
    }

    console.log(`[RESYNC_ENGINE] Synced exit event: ${event.bookingId}`)
  }

  /**
   * Sync payment
   */
  private async syncPayment(payment: any): Promise<void> {
    // Check if payment already exists
    const existing = await prisma.payment.findUnique({
      where: { id: payment.id },
    })

    if (existing) {
      console.log(`[RESYNC_ENGINE] Payment ${payment.id} already exists, skipping`)
      return
    }

    // Create payment
    await prisma.payment.create({
      data: payment,
    })

    console.log(`[RESYNC_ENGINE] Synced payment: ${payment.id}`)
  }

  /**
   * Handle collision resolution (expired holds during offline duration)
   */
  private async resolveCollisions(): Promise<void> {
    const now = new Date()

    // Find expired holds that were not synced
    const expiredHolds = await prisma.booking.findMany({
      where: {
        status: "HELD", // B6: Use HELD status for holds
        lockExpiresAt: {
          lt: now,
        },
      },
    })

    for (const hold of expiredHolds) {
      await prisma.booking.update({
        where: { id: hold.id },
        data: { status: "EXPIRED" },
      })

      // Release bay if occupied
      if (hold.parkingBayId) {
        await prisma.parkingBay.update({
          where: { id: hold.parkingBayId },
          data: { status: "AVAILABLE", currentPlate: null },
        })
      }

      console.log(`[RESYNC_ENGINE] Resolved expired hold: ${hold.id}`)
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{
    isRunning: boolean
    pendingTransactions: number
    lastSync?: Date
  }> {
    const bufferStatus = await (await import("./sqlite-buffer")).getBufferStatus()
    
    return {
      isRunning: this.isRunning,
      pendingTransactions: bufferStatus.pendingTransactions,
      lastSync: new Date(), // Would track actual last sync time
    }
  }
}

// Singleton instance
const resyncEngine = new ResyncEngine()

/**
 * Start re-sync engine
 */
export function startResyncEngine(): void {
  resyncEngine.start()
}

/**
 * Stop re-sync engine
 */
export function stopResyncEngine(): void {
  resyncEngine.stop()
}

/**
 * Get sync status
 */
export async function getResyncStatus() {
  return await resyncEngine.getSyncStatus()
}

/**
 * Manual sync trigger
 */
export async function triggerManualSync(): Promise<SyncResult> {
  return await (resyncEngine as any).syncTransactions()
}

export { resyncEngine }