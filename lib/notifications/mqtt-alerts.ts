/**
 * MQTT Alert System
 * Handles dispatch of compliance violation alerts via MQTT to lot attendant devices
 */

import mqtt, { MqttClient } from "mqtt"

// MQTT client singleton
let mqttClient: MqttClient | null = null

// MQTT configuration
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883"
const MQTT_CLIENT_ID = "slots-compliance-alerts"
const MQTT_QOS = 1 // Quality of Service level 1 (at least once delivery)

/**
 * Initialize MQTT client for alert dispatch
 */
export function initializeMQTTAlerts(): MqttClient {
  if (mqttClient) {
    console.log("✅ MQTT alerts already initialized")
    return mqttClient
  }

  console.log(`🔌 Connecting to MQTT broker: ${MQTT_BROKER_URL}`)
  
  mqttClient = mqtt.connect(MQTT_BROKER_URL, {
    clientId: MQTT_CLIENT_ID,
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  })

  mqttClient.on("connect", () => {
    console.log("✅ MQTT alerts client connected")
  })

  mqttClient.on("error", (error) => {
    console.error("❌ MQTT alerts error:", error)
  })

  mqttClient.on("reconnect", () => {
    console.log("🔄 MQTT alerts client reconnecting...")
  })

  return mqttClient
}

/**
 * Disconnect MQTT client
 */
export function disconnectMQTTAlerts(): void {
  if (mqttClient) {
    mqttClient.end()
    mqttClient = null
    console.log("🔌 MQTT alerts client disconnected")
  }
}

/**
 * Dispatch compliance alert via MQTT to lot attendant devices
 */
export function dispatchMQTTAlert(
  lotId: string,
  alert: any
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!mqttClient || !mqttClient.connected) {
      console.warn("⚠️ MQTT client not connected, attempting to initialize...")
      try {
        initializeMQTTAlerts()
      } catch (error) {
        console.error("❌ Failed to initialize MQTT client:", error)
        reject(new Error("MQTT client not available"))
        return
      }
    }

    const topic = `slots/${lotId}/compliance`
    const payload = JSON.stringify({
      ...alert,
      timestamp: alert.timestamp ? alert.timestamp.toISOString() : new Date().toISOString(),
    })

    mqttClient!.publish(topic, payload, { qos: MQTT_QOS }, (error) => {
      if (error) {
        console.error(`❌ Failed to publish MQTT alert to ${topic}:`, error)
        reject(error)
      } else {
        console.log(`📡 Compliance alert dispatched via MQTT to ${topic}`)
        resolve()
      }
    })
  })
}

/**
 * Dispatch system-wide MQTT alert
 */
export function dispatchSystemAlert(alert: any): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!mqttClient || !mqttClient.connected) {
      console.warn("⚠️ MQTT client not connected, attempting to initialize...")
      try {
        initializeMQTTAlerts()
      } catch (error) {
        console.error("❌ Failed to initialize MQTT client:", error)
        reject(new Error("MQTT client not available"))
        return
      }
    }

    const topic = "slots/system/alerts"
    const payload = JSON.stringify({
      ...alert,
      timestamp: alert.timestamp ? alert.timestamp.toISOString() : new Date().toISOString(),
    })

    mqttClient!.publish(topic, payload, { qos: MQTT_QOS }, (error) => {
      if (error) {
        console.error(`❌ Failed to publish system alert to ${topic}:`, error)
        reject(error)
      } else {
        console.log(`📡 System alert dispatched via MQTT to ${topic}`)
        resolve()
      }
    })
  })
}

/**
 * Subscribe to compliance alerts for a specific lot (for testing/monitoring)
 */
export function subscribeToComplianceAlerts(lotId: string, callback: (topic: string, message: Buffer) => void): void {
  if (!mqttClient) {
    initializeMQTTAlerts()
  }

  const topic = `slots/${lotId}/compliance`
  mqttClient!.subscribe(topic, { qos: MQTT_QOS }, (error) => {
    if (error) {
      console.error(`❌ Failed to subscribe to ${topic}:`, error)
    } else {
      console.log(`✅ Subscribed to compliance alerts for lot ${lotId}`)
    }
  })

  mqttClient!.on("message", (topic, message) => {
    if (topic === `slots/${lotId}/compliance`) {
      callback(topic, message)
    }
  })
}

/**
 * Get MQTT client connection status
 */
export function getMQTTConnectionStatus(): "connected" | "disconnected" | "connecting" {
  if (!mqttClient) return "disconnected"
  if (mqttClient.connected) return "connected"
  return "connecting"
}