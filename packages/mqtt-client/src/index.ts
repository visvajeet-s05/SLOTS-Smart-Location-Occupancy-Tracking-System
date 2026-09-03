import fs from "node:fs";
import mqtt, { MqttClient, IClientOptions } from "mqtt";

export type SlotDelta = { s: string; v: "A" | "R" | "O" | "V" | "E"; t: number };
export function slotTopic(lotId: string, slotId: string) { return `slotify/v1/lot/${lotId}/slot/${slotId}/event`; }

/**
 * Connect to MQTT broker with mTLS (production mode)
 */
export function connectMtls(): MqttClient {
  const required = ["MQTT_URL", "MQTT_CA_PATH", "MQTT_CERT_PATH", "MQTT_KEY_PATH"] as const;
  for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
  return mqtt.connect(process.env.MQTT_URL!, { 
    protocol: "mqtts", 
    rejectUnauthorized: true, 
    ca: fs.readFileSync(process.env.MQTT_CA_PATH!), 
    cert: fs.readFileSync(process.env.MQTT_CERT_PATH!), 
    key: fs.readFileSync(process.env.MQTT_KEY_PATH!), 
    clientId: `slotify-${process.env.EDGE_NODE_ID ?? "service"}` 
  });
}

/**
 * Connect to MQTT broker with username/password (standard mode)
 */
export function connectWithAuth(): MqttClient {
  const url = process.env.MQTT_URL || "mqtt://localhost:1883";
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  
  const options: IClientOptions = {
    clientId: `slotify-${process.env.EDGE_NODE_ID ?? "service"}`,
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  };

  if (username && password) {
    options.username = username;
    options.password = password;
  }

  const client = mqtt.connect(url, options);
  
  client.on('connect', () => {
    console.log(`[MQTT] Connected to broker at ${url}`);
  });

  client.on('error', (err) => {
    console.error(`[MQTT] Connection error:`, err);
  });

  client.on('offline', () => {
    console.warn(`[MQTT] Client offline`);
  });

  return client;
}

/**
 * Connect to public test broker (for development/testing)
 * Uses HiveMQ public broker or Eclipse test broker
 */
export function connectTestBroker(): MqttClient {
  const testUrl = process.env.MQTT_TEST_URL || "mqtt://test.mosquitto.org:1883";
  const options: IClientOptions = {
    clientId: `slotify-test-${Math.random().toString(36).substring(7)}`,
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  };

  const client = mqtt.connect(testUrl, options);
  
  client.on('connect', () => {
    console.log(`[MQTT] Connected to test broker at ${testUrl}`);
  });

  client.on('error', (err) => {
    console.error(`[MQTT] Test broker error:`, err);
  });

  return client;
}

/**
 * Auto-select connection method based on environment
 */
export function connectMqtt(): MqttClient {
  // If mTLS credentials are present, use mTLS
  if (process.env.MQTT_CA_PATH && process.env.MQTT_CERT_PATH && process.env.MQTT_KEY_PATH) {
    return connectMtls();
  }
  
  // If username/password are present, use auth
  if (process.env.MQTT_USERNAME && process.env.MQTT_PASSWORD) {
    return connectWithAuth();
  }
  
  // Otherwise, use test broker for development
  console.warn("[MQTT] No production credentials found, using test broker");
  return connectTestBroker();
}

export function publishDelta(client: MqttClient, lotId: string, slotId: string, delta: SlotDelta) {
  const payload = JSON.stringify(delta);
  const payloadSize = Buffer.byteLength(payload);
  
  if (payloadSize >= 50) {
    console.error(`[MQTT] Slot delta payload too large: ${payloadSize} bytes (max 50)`);
    throw new Error("Slot delta must be under 50 bytes");
  }
  
  console.log(`[MQTT] Publishing to ${slotTopic(lotId, slotId)}: ${payload} (${payloadSize} bytes)`);
  client.publish(slotTopic(lotId, slotId), payload, { qos: 1, retain: false });
}
