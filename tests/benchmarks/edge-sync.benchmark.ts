/**
 * Edge-to-Cloud Sync Benchmark Harness
 * Evaluates telemetry transmission performance under simulated network conditions
 */

import { getNetworkEmulator, resetNetworkEmulator, NETWORK_PROFILES } from "@/lib/edge/network-emulator"
import { 
  encodeCompactMQTT, 
  encodeJSON, 
  decodeCompactMQTT, 
  decodeJSON,
  type TelemetryData,
  VehicleType
} from "@/lib/edge/telemetry-encoders"

export interface BenchmarkResult {
  encoder: "mqtt_binary" | "json"
  networkProfile: string
  totalEvents: number
  successfulTransmissions: number
  failedTransmissions: number
  deliverySuccessRate: number
  totalBytesTransferred: number
  averagePayloadSize: number
  totalBandwidthConsumed: number
  averageLatency: number
  maxLatency: number
  minLatency: number
  meanStateStaleness: number
  maxStateStaleness: number
  disconnectCount: number
  memoryOverheadMB: number
  cpuOverheadPercent: number
  duration: number
}

export interface BenchmarkComparison {
  mqttBinary: BenchmarkResult
  json: BenchmarkResult
  bandwidthSavings: number
  stalenessImprovement: number
  successRateImprovement: number
}

export interface BenchmarkReport {
  networkProfiles: string[]
  results: Map<string, BenchmarkComparison>
  summary: {
    totalEvents: number
    overallBandwidthSavings: number
    overallStalenessImprovement: number
    overallSuccessRateImprovement: number
  }
  timestamp: Date
}

/**
 * Edge-to-Cloud Sync Benchmark Harness
 */
class EdgeSyncBenchmark {
  private readonly NUM_EVENTS = 10000
  private readonly NETWORK_PROFILES = ["optimal_fiber", "urban_4g", "degraded_3g_edge", "monsoon_spotty"]

  /**
   * Generate simulated telemetry data
   */
  private generateTelemetryData(index: number): TelemetryData {
    const vehicleTypes: VehicleType[] = [
      VehicleType.CAR,
      VehicleType.TWO_WHEELER,
      VehicleType.AUTO_RICKSHAW,
      VehicleType.LCV
    ]

    return {
      slotId: `slot-${index % 100}`,
      occupancyState: Math.random() > 0.5,
      vehicleType: vehicleTypes[Math.floor(Math.random() * vehicleTypes.length)],
      timestamp: new Date(),
      detectionConfidence: 0.7 + Math.random() * 0.3,
      coordinates: {
        x: Math.random() * 100,
        y: Math.random() * 100
      },
      deviceMetadata: {
        deviceId: `device-${Math.floor(index / 100)}`,
        batteryLevel: 0.5 + Math.random() * 0.5,
        signalStrength: 0.6 + Math.random() * 0.4
      }
    }
  }

  /**
   * Run benchmark for a single encoder and network profile
   */
  private async runSingleBenchmark(
    encoder: "mqtt_binary" | "json",
    networkProfile: string
  ): Promise<BenchmarkResult> {
    resetNetworkEmulator()
    const emulator = getNetworkEmulator(networkProfile)

    const startTime = Date.now()
    const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024

    let successfulTransmissions = 0
    let failedTransmissions = 0
    let totalBytesTransferred = 0
    let latencies: number[] = []
    let stateStaleness: number[] = []

    for (let i = 0; i < this.NUM_EVENTS; i++) {
      const telemetryData = this.generateTelemetryData(i)
      const eventTimestamp = telemetryData.timestamp

      // Encode based on encoder type
      let encodedPayload
      if (encoder === "mqtt_binary") {
        encodedPayload = encodeCompactMQTT(telemetryData)
      } else {
        encodedPayload = encodeJSON(telemetryData)
      }

      // Simulate transmission
      const result = await emulator.transmit(encodedPayload.data)

      if (result.success) {
        successfulTransmissions++
        totalBytesTransferred += encodedPayload.size
        latencies.push(result.latency)

        // Calculate state staleness (time from event to cloud sync)
        const staleness = Date.now() - eventTimestamp.getTime()
        stateStaleness.push(staleness)
      } else {
        failedTransmissions++
      }
    }

    const endTime = Date.now()
    const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024
    const memoryOverhead = memoryAfter - memoryBefore

    const duration = endTime - startTime
    const networkStats = emulator.getStatistics()

    const averageLatency = latencies.length > 0 
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length 
      : 0

    const result: BenchmarkResult = {
      encoder,
      networkProfile,
      totalEvents: this.NUM_EVENTS,
      successfulTransmissions,
      failedTransmissions,
      deliverySuccessRate: successfulTransmissions / this.NUM_EVENTS,
      totalBytesTransferred,
      averagePayloadSize: totalBytesTransferred / successfulTransmissions,
      totalBandwidthConsumed: networkStats.totalBandwidthConsumed,
      averageLatency,
      maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
      minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
      meanStateStaleness: stateStaleness.length > 0 
        ? stateStaleness.reduce((a, b) => a + b, 0) / stateStaleness.length 
        : 0,
      maxStateStaleness: stateStaleness.length > 0 ? Math.max(...stateStaleness) : 0,
      disconnectCount: networkStats.disconnectCount,
      memoryOverheadMB: memoryOverhead,
      cpuOverheadPercent: 0, // Would need actual CPU measurement
      duration
    }

    return result
  }

  /**
   * Run complete benchmark suite
   */
  async runBenchmarkSuite(): Promise<BenchmarkReport> {
    console.log("=== Edge-to-Cloud Sync Benchmark Suite ===")
    console.log(`Events per profile: ${this.NUM_EVENTS}`)
    console.log(`Network profiles: ${this.NETWORK_PROFILES.join(", ")}`)
    console.log()

    const results = new Map<string, BenchmarkComparison>()
    let totalBandwidthSavings = 0
    let totalStalenessImprovement = 0
    let totalSuccessRateImprovement = 0

    for (const profile of this.NETWORK_PROFILES) {
      console.log(`\n=== Testing network profile: ${profile} ===`)

      // Run MQTT binary benchmark
      console.log("  Running MQTT binary encoder benchmark...")
      const mqttResult = await this.runSingleBenchmark("mqtt_binary", profile)
      console.log(`    Success rate: ${(mqttResult.deliverySuccessRate * 100).toFixed(2)}%`)
      console.log(`    Avg latency: ${mqttResult.averageLatency.toFixed(2)}ms`)
      console.log(`    Total bandwidth: ${(mqttResult.totalBandwidthConsumed / 1024).toFixed(2)}KB`)

      // Run JSON benchmark
      console.log("  Running JSON encoder benchmark...")
      const jsonResult = await this.runSingleBenchmark("json", profile)
      console.log(`    Success rate: ${(jsonResult.deliverySuccessRate * 100).toFixed(2)}%`)
      console.log(`    Avg latency: ${jsonResult.averageLatency.toFixed(2)}ms`)
      console.log(`    Total bandwidth: ${(jsonResult.totalBandwidthConsumed / 1024).toFixed(2)}KB`)

      // Calculate improvements
      const bandwidthSavings = ((jsonResult.totalBandwidthConsumed - mqttResult.totalBandwidthConsumed) / jsonResult.totalBandwidthConsumed) * 100
      const stalenessImprovement = ((jsonResult.meanStateStaleness - mqttResult.meanStateStaleness) / jsonResult.meanStateStaleness) * 100
      const successRateImprovement = ((mqttResult.deliverySuccessRate - jsonResult.deliverySuccessRate) / jsonResult.deliverySuccessRate) * 100

      totalBandwidthSavings += bandwidthSavings
      totalStalenessImprovement += stalenessImprovement
      totalSuccessRateImprovement += successRateImprovement

      console.log(`\n  Comparison for ${profile}:`)
      console.log(`    Bandwidth savings: ${bandwidthSavings.toFixed(2)}%`)
      console.log(`    Staleness improvement: ${stalenessImprovement.toFixed(2)}%`)
      console.log(`    Success rate improvement: ${successRateImprovement.toFixed(2)}%`)

      results.set(profile, {
        mqttBinary: mqttResult,
        json: jsonResult,
        bandwidthSavings,
        stalenessImprovement,
        successRateImprovement
      })
    }

    const numProfiles = this.NETWORK_PROFILES.length
    const report: BenchmarkReport = {
      networkProfiles: this.NETWORK_PROFILES,
      results,
      summary: {
        totalEvents: this.NUM_EVENTS * numProfiles * 2, // 2 encoders per profile
        overallBandwidthSavings: totalBandwidthSavings / numProfiles,
        overallStalenessImprovement: totalStalenessImprovement / numProfiles,
        overallSuccessRateImprovement: totalSuccessRateImprovement / numProfiles
      },
      timestamp: new Date()
    }

    console.log("\n=== Benchmark Summary ===")
    console.log(`Total events: ${report.summary.totalEvents}`)
    console.log(`Overall bandwidth savings: ${report.summary.overallBandwidthSavings.toFixed(2)}%`)
    console.log(`Overall staleness improvement: ${report.summary.overallStalenessImprovement.toFixed(2)}%`)
    console.log(`Overall success rate improvement: ${report.summary.overallSuccessRateImprovement.toFixed(2)}%`)

    return report
  }

  /**
   * Export benchmark results to JSON
   */
  exportResultsToJson(report: BenchmarkReport): string {
    const jsonResults: any = {
      summary: report.summary,
      timestamp: report.timestamp.toISOString(),
      profiles: {}
    }

    for (const [profile, comparison] of report.results.entries()) {
      jsonResults.profiles[profile] = {
        mqtt_binary: comparison.mqttBinary,
        json: comparison.json,
        improvements: {
          bandwidthSavings: comparison.bandwidthSavings,
          stalenessImprovement: comparison.stalenessImprovement,
          successRateImprovement: comparison.successRateImprovement
        }
      }
    }

    return JSON.stringify(jsonResults, null, 2)
  }

  /**
   * Get benchmark results suitable for Python export
   */
  getResultsForPythonExport(report: BenchmarkReport): any {
    const results: any = {
      profiles: {},
      summary: report.summary
    }

    for (const [profile, comparison] of report.results.entries()) {
      results.profiles[profile] = {
        mqtt_binary: {
          success_rate: comparison.mqttBinary.deliverySuccessRate,
          bandwidth_kb: comparison.mqttBinary.totalBandwidthConsumed / 1024,
          avg_latency_ms: comparison.mqttBinary.averageLatency,
          staleness_ms: comparison.mqttBinary.meanStateStaleness
        },
        json: {
          success_rate: comparison.json.deliverySuccessRate,
          bandwidth_kb: comparison.json.totalBandwidthConsumed / 1024,
          avg_latency_ms: comparison.json.averageLatency,
          staleness_ms: comparison.json.meanStateStaleness
        }
      }
    }

    return results
  }
}

// Singleton instance
const edgeSyncBenchmark = new EdgeSyncBenchmark()

/**
 * Run complete edge sync benchmark suite
 */
export async function runEdgeSyncBenchmark(): Promise<BenchmarkReport> {
  return await edgeSyncBenchmark.runBenchmarkSuite()
}

/**
 * Export benchmark results to JSON
 */
export function exportBenchmarkResultsToJson(report: BenchmarkReport): string {
  return edgeSyncBenchmark.exportResultsToJson(report)
}

/**
 * Get results for Python export
 */
export function getBenchmarkResultsForPython(report: BenchmarkReport): any {
  return edgeSyncBenchmark.getResultsForPythonExport(report)
}

export { edgeSyncBenchmark }