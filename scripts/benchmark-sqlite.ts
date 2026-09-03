/**
 * SQLite Throughput Benchmark
 * 
 * This script benchmarks the SQLite edge buffer with real database operations.
 * It measures write throughput, transaction latency, and file size.
 * 
 * Usage:
 *   npx tsx scripts/benchmark-sqlite.ts
 */

import fs from "fs"
import path from "path"
import { getSQLiteEdgeBuffer, closeSQLiteEdgeBuffer } from "../lib/db/sqlite-edge"

interface SQLiteBenchmarkResult {
  operations: number
  writeThroughputOpsPerSec: number
  avgTransactionLatencyMs: number
  minTransactionLatencyMs: number
  maxTransactionLatencyMs: number
  physicalFileSizeBytes: number
  physicalFileSizeKB: number
  transactionLatencies: number[]
  error?: string
}

/**
 * Run SQLite throughput benchmark
 */
async function runSQLiteBenchmark(operations: number = 5000): Promise<SQLiteBenchmarkResult> {
  const result: SQLiteBenchmarkResult = {
    operations,
    writeThroughputOpsPerSec: 0,
    avgTransactionLatencyMs: 0,
    minTransactionLatencyMs: Infinity,
    maxTransactionLatencyMs: 0,
    physicalFileSizeBytes: 0,
    physicalFileSizeKB: 0,
    transactionLatencies: [],
  }

  console.log("\n" + "=".repeat(80))
  console.log("SQLITE THROUGHPUT BENCHMARK")
  console.log("=".repeat(80))
  console.log(`Operations: ${operations}`)

  try {
    // Initialize buffer
    const buffer = getSQLiteEdgeBuffer()
    console.log(`[SQLITE] Buffer initialized`)

    // Clear any existing data
    buffer.cleanupOldEvents(0)
    console.log(`[SQLITE] Cleared existing data`)

    // Benchmark writes
    const latencies: number[] = []
    const slotIds = ["slot-001", "slot-002", "slot-003", "slot-004", "slot-005"]
    
    const startTime = Date.now()

    for (let i = 0; i < operations; i++) {
      const slotId = slotIds[i % slotIds.length]
      const state = i % 2 // Alternate between 0 and 1
      const timestamp = new Date()

      const opStart = Date.now()
      const eventId = buffer.queueOccupancyEvent(slotId, state, timestamp)
      const opTime = Date.now() - opStart

      latencies.push(opTime)

      if (opTime < result.minTransactionLatencyMs) {
        result.minTransactionLatencyMs = opTime
      }
      if (opTime > result.maxTransactionLatencyMs) {
        result.maxTransactionLatencyMs = opTime
      }

      // Progress logging
      if ((i + 1) % 1000 === 0) {
        console.log(`[SQLITE] Progress: ${i + 1}/${operations} operations`)
      }
    }

    const totalTime = Date.now() - startTime

    // Calculate metrics
    result.transactionLatencies = latencies
    result.avgTransactionLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length
    result.writeThroughputOpsPerSec = (operations / totalTime) * 1000

    // Get physical file size
    result.physicalFileSizeBytes = buffer.getDatabaseSize()
    result.physicalFileSizeKB = result.physicalFileSizeBytes / 1024

    console.log(`[SQLITE] Total time: ${totalTime}ms`)
    console.log(`[SQLITE] Throughput: ${result.writeThroughputOpsPerSec.toFixed(2)} ops/sec`)
    console.log(`[SQLITE] Avg latency: ${result.avgTransactionLatencyMs.toFixed(2)}ms`)
    console.log(`[SQLITE] Min latency: ${result.minTransactionLatencyMs}ms`)
    console.log(`[SQLITE] Max latency: ${result.maxTransactionLatencyMs}ms`)
    console.log(`[SQLITE] File size: ${result.physicalFileSizeKB.toFixed(2)} KB`)

    // Verify data integrity
    const syncStatus = buffer.getSyncStatus()
    console.log(`[SQLITE] Data verification: ${syncStatus.totalEvents} events in database`)

    if (syncStatus.totalEvents !== operations) {
      console.warn(`[SQLITE] WARNING: Expected ${operations} events, found ${syncStatus.totalEvents}`)
    }

    closeSQLiteEdgeBuffer()
    console.log(`[SQLITE] Buffer closed`)
  } catch (error: any) {
    result.error = error.message
    console.error(`[SQLITE] Error: ${error.message}`)
  }

  return result
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  const result = await runSQLiteBenchmark(5000)

  console.log("\n" + "=".repeat(80))
  console.log("SQLITE BENCHMARK RESULTS")
  console.log("=".repeat(80))
  console.log(`Operations: ${result.operations}`)
  console.log(`Write Throughput: ${result.writeThroughputOpsPerSec.toFixed(2)} ops/sec`)
  console.log(`Avg Transaction Latency: ${result.avgTransactionLatencyMs.toFixed(2)} ms`)
  console.log(`Min Transaction Latency: ${result.minTransactionLatencyMs} ms`)
  console.log(`Max Transaction Latency: ${result.maxTransactionLatencyMs} ms`)
  console.log(`Physical File Size: ${result.physicalFileSizeBytes} bytes (${result.physicalFileSizeKB.toFixed(2)} KB)`)
  console.log(`Transaction Latencies (sample): ${result.transactionLatencies.slice(0, 20).join(", ")} ms`)

  if (result.error) {
    console.log(`Error: ${result.error}`)
  }

  console.log("=".repeat(80))

  // Output as JSON for log consolidation
  console.log("\nJSON OUTPUT:")
  console.log(JSON.stringify(result, null, 2))
}

// Run if executed directly
if (require.main === module) {
  main()
}
