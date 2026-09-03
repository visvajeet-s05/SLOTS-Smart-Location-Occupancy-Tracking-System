/**
 * MQTT Network Resilience Benchmark
 * 
 * This script benchmarks MQTT connectivity, packet delivery, and RTT.
 * It tests both normal and simulated degraded network conditions.
 * 
 * Usage:
 *   npx tsx scripts/benchmark-mqtt.ts
 */

import { connectMqtt, publishDelta, type SlotDelta } from "../packages/mqtt-client/src"

interface MQTTBenchmarkResult {
  broker: string
  packetsSent: number
  packetsReceived: number
  deliveryRate: number
  averageRTT: number
  minRTT: number
  maxRTT: number
  payloadSize: number
  rttMeasurements: number[]
  error?: string
}

/**
 * Simulate network delay
 */
function simulateNetworkDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Run MQTT benchmark
 */
async function runMQTTBenchmark(packets: number = 100, simulateLatency: boolean = false): Promise<MQTTBenchmarkResult> {
  const result: MQTTBenchmarkResult = {
    broker: "test.mosquitto.org:1883",
    packetsSent: 0,
    packetsReceived: 0,
    deliveryRate: 0,
    averageRTT: 0,
    minRTT: Infinity,
    maxRTT: 0,
    payloadSize: 0,
    rttMeasurements: [],
  }

  console.log("\n" + "=".repeat(80))
  console.log("MQTT NETWORK RESILIENCE BENCHMARK")
  console.log("=".repeat(80))
  console.log(`Broker: ${result.broker}`)
  console.log(`Packets: ${packets}`)
  console.log(`Simulate Latency: ${simulateLatency}`)

  try {
    // Connect to broker
    console.log(`[MQTT] Connecting to broker...`)
    const client = connectMqtt()

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000)

      client.on("connect", () => {
        clearTimeout(timeout)
        console.log(`[MQTT] Connected`)
        resolve()
      })

      client.on("error", (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    // Subscribe to test topic
    const testTopic = "slotify/v1/benchmark/test/event"
    let receivedCount = 0

    client.subscribe(testTopic, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[MQTT] Subscribe error: ${err.message}`)
      } else {
        console.log(`[MQTT] Subscribed to: ${testTopic}`)
      }
    })

    // Listen for messages
    client.on("message", (topic, message) => {
      if (topic === testTopic) {
        receivedCount++
        result.packetsReceived = receivedCount
        
        if (receivedCount % 20 === 0) {
          console.log(`[MQTT] Received: ${receivedCount}/${packets} packets`)
        }
      }
    })

    // Publish packets and measure RTT
    const rttMeasurements: number[] = []
    const timestamps = new Map<number, number>()

    // Set up message handler to capture RTT
    client.on("message", (topic, message) => {
      if (topic === testTopic) {
        try {
          const payload = JSON.parse(message.toString())
          if (payload.timestamp) {
            const rtt = Date.now() - payload.timestamp
            rttMeasurements.push(rtt)
            
            if (rtt < result.minRTT) result.minRTT = rtt
            if (rtt > result.maxRTT) result.maxRTT = rtt
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    })

    console.log(`[MQTT] Publishing ${packets} packets...`)

    for (let i = 0; i < packets; i++) {
      const delta: SlotDelta = {
        s: `bench-slot-${i % 10}`,
        v: i % 2 === 0 ? "O" : "A",
        t: Date.now(),
      }

      const payload = JSON.stringify({ ...delta, timestamp: Date.now() })
      result.payloadSize = Buffer.byteLength(payload)

      const pubStart = Date.now()

      // Publish to test topic for RTT measurement
      client.publish(testTopic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[MQTT] Publish error: ${err.message}`)
        }
      })

      // Also publish to normal topic
      publishDelta(client, "benchmark-lot", `bench-slot-${i % 10}`, delta)

      result.packetsSent = i + 1

      // Simulate network latency if requested
      if (simulateLatency) {
        await simulateNetworkDelay(50 + Math.random() * 100) // 50-150ms delay
      } else {
        await simulateNetworkDelay(10) // Small delay between packets
      }

      // Progress logging
      if ((i + 1) % 20 === 0) {
        console.log(`[MQTT] Published: ${i + 1}/${packets} packets`)
      }
    }

    // Wait for remaining messages
    console.log(`[MQTT] Waiting for remaining messages...`)
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Calculate metrics
    result.rttMeasurements = rttMeasurements
    result.deliveryRate = (result.packetsReceived / result.packetsSent) * 100

    if (rttMeasurements.length > 0) {
      result.averageRTT = rttMeasurements.reduce((a, b) => a + b, 0) / rttMeasurements.length
    }

    console.log(`[MQTT] Packets sent: ${result.packetsSent}`)
    console.log(`[MQTT] Packets received: ${result.packetsReceived}`)
    console.log(`[MQTT] Delivery rate: ${result.deliveryRate.toFixed(2)}%`)
    console.log(`[MQTT] Average RTT: ${result.averageRTT.toFixed(2)}ms`)
    console.log(`[MQTT] Min RTT: ${result.minRTT === Infinity ? 0 : result.minRTT}ms`)
    console.log(`[MQTT] Max RTT: ${result.maxRTT}ms`)
    console.log(`[MQTT] Payload size: ${result.payloadSize} bytes`)

    // Disconnect
    client.end()
    console.log(`[MQTT] Disconnected`)
  } catch (error: any) {
    result.error = error.message
    console.error(`[MQTT] Error: ${error.message}`)
  }

  return result
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log("=" .repeat(80))
  console.log("SLOTS MQTT NETWORK RESILIENCE BENCHMARK")
  console.log("=" .repeat(80))

  // Run normal benchmark
  console.log("\n--- NORMAL NETWORK CONDITIONS ---")
  const normalResult = await runMQTTBenchmark(100, false)

  // Run degraded benchmark
  console.log("\n--- DEGRADED NETWORK CONDITIONS ---")
  const degradedResult = await runMQTTBenchmark(100, true)

  console.log("\n" + "=".repeat(80))
  console.log("MQTT BENCHMARK RESULTS")
  console.log("=".repeat(80))
  console.log("\nNORMAL CONDITIONS:")
  console.log(`  Broker: ${normalResult.broker}`)
  console.log(`  Packets Sent/Received: ${normalResult.packetsSent}/${normalResult.packetsReceived}`)
  console.log(`  Delivery Rate: ${normalResult.deliveryRate.toFixed(2)}%`)
  console.log(`  Average RTT: ${normalResult.averageRTT.toFixed(2)}ms`)
  console.log(`  Min/Max RTT: ${normalResult.minRTT === Infinity ? 0 : normalResult.minRTT}ms / ${normalResult.maxRTT}ms`)
  console.log(`  Payload Size: ${normalResult.payloadSize} bytes`)

  console.log("\nDEGRADED CONDITIONS:")
  console.log(`  Broker: ${degradedResult.broker}`)
  console.log(`  Packets Sent/Received: ${degradedResult.packetsSent}/${degradedResult.packetsReceived}`)
  console.log(`  Delivery Rate: ${degradedResult.deliveryRate.toFixed(2)}%`)
  console.log(`  Average RTT: ${degradedResult.averageRTT.toFixed(2)}ms`)
  console.log(`  Min/Max RTT: ${degradedResult.minRTT === Infinity ? 0 : degradedResult.minRTT}ms / ${degradedResult.maxRTT}ms`)
  console.log(`  Payload Size: ${degradedResult.payloadSize} bytes`)

  if (normalResult.error) {
    console.log(`\nNormal Error: ${normalResult.error}`)
  }
  if (degradedResult.error) {
    console.log(`\nDegraded Error: ${degradedResult.error}`)
  }

  console.log("=".repeat(80))

  // Output as JSON for log consolidation
  console.log("\nJSON OUTPUT:")
  console.log(JSON.stringify({ normal: normalResult, degraded: degradedResult }, null, 2))
}

// Run if executed directly
if (require.main === module) {
  main()
}
