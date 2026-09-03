import { releaseExpiredLocks } from "@/lib/booking-engine"

/**
 * Background lock cleanup function
 * Should be called periodically (e.g., every minute via cron)
 */
export async function runLockCleanup() {
  try {
    const releasedCount = await releaseExpiredLocks()
    console.log(`🧹 Lock cleanup completed: Released ${releasedCount} expired slot locks`)
    return releasedCount
  } catch (error) {
    console.error("❌ Lock cleanup failed:", error)
    throw error
  }
}

// Run immediately if executed directly
if (require.main === module) {
  runLockCleanup()
    .then((count) => {
      console.log(`✅ Cleanup complete: ${count} locks released`)
      process.exit(0)
    })
    .catch((error) => {
      console.error("❌ Cleanup failed:", error)
      process.exit(1)
    })
}