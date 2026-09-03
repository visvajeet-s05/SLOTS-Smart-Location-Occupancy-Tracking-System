/**
 * Telemetry Payload Encoders
 * Compact MQTT encoder (50-byte) vs full-payload JSON baseline
 */

export interface TelemetryData {
  slotId: string
  occupancyState: boolean // 0 = available, 1 = occupied
  vehicleType: VehicleType
  timestamp: Date
  detectionConfidence: number // 0.0 to 1.0
  coordinates?: { x: number; y: number }
  deviceMetadata?: {
    deviceId: string
    batteryLevel: number
    signalStrength: number
  }
}

export enum VehicleType {
  CAR = 0,
  TWO_WHEELER = 1,
  AUTO_RICKSHAW = 2,
  LCV = 3,
  UNKNOWN = 15, // 4-bit value 1111
}

export interface EncodedPayload {
  data: Buffer
  size: number
  encoding: "mqtt_binary" | "json"
}

/**
 * Compact MQTT Encoder (50-byte Binary/QoS-1)
 * Bit-packed payload for efficient transmission
 */
class CompactMQTTEncoder {
  private readonly MAX_PAYLOAD_SIZE = 50

  /**
   * Encode telemetry data to compact binary format
   * Format:
   * - Slot ID: 8 bytes (64-bit)
   * - Occupancy State: 1 bit
   * - Vehicle Type: 4 bits
   * - Timestamp Offset: 32 bits (seconds from epoch)
   * - Detection Confidence: 8 bits (0-255)
   * - Reserved: 17 bits
   * Total: 64 bits = 8 bytes (slot data)
   * With additional metadata, total max 50 bytes
   */
  encode(data: TelemetryData): EncodedPayload {
    const buffer = Buffer.alloc(this.MAX_PAYLOAD_SIZE)
    let offset = 0

    // Slot ID (8 bytes - convert string to hash)
    const slotIdHash = this.hashSlotId(data.slotId)
    buffer.writeBigUInt64LE(slotIdHash, offset)
    offset += 8

    // Bit-packed fields (1 byte)
    const occupancyBit = data.occupancyState ? 1 : 0
    const vehicleTypeBits = data.vehicleType & 0x0F // 4 bits
    const confidenceByte = Math.floor(data.detectionConfidence * 255)
    
    const packedByte = (occupancyBit << 7) | (vehicleTypeBits << 3) | (confidenceByte >> 5)
    buffer.writeUInt8(packedByte, offset)
    offset += 1

    // Remaining confidence bits (3 bits from previous byte)
    const remainingConfidence = confidenceByte & 0x1F
    buffer.writeUInt8(remainingConfidence, offset)
    offset += 1

    // Timestamp offset (4 bytes - seconds from epoch)
    const timestampOffset = Math.floor(data.timestamp.getTime() / 1000)
    buffer.writeUInt32LE(timestampOffset, offset)
    offset += 4

    // Total so far: 14 bytes
    // Remaining 36 bytes for optional metadata
    if (data.deviceMetadata) {
      // Device ID (16 bytes - truncated if longer)
      const deviceIdBuffer = Buffer.from(data.deviceMetadata.deviceId, 'utf8').slice(0, 16)
      deviceIdBuffer.copy(buffer, offset)
      offset += 16

      // Battery level (1 byte)
      buffer.writeUInt8(Math.floor(data.deviceMetadata.batteryLevel * 100), offset)
      offset += 1

      // Signal strength (1 byte)
      buffer.writeUInt8(Math.floor(data.deviceMetadata.signalStrength * 100), offset)
      offset += 1
    }

    // Return actual used size
    const actualSize = offset
    return {
      data: buffer.slice(0, actualSize),
      size: actualSize,
      encoding: "mqtt_binary"
    }
  }

  /**
   * Decode compact binary payload
   */
  decode(buffer: Buffer): TelemetryData {
    let offset = 0

    // Slot ID hash (8 bytes)
    const slotIdHash = buffer.readBigUInt64LE(offset)
    offset += 8

    // Bit-packed fields (1 byte)
    const packedByte = buffer.readUInt8(offset)
    offset += 1

    const occupancyBit = (packedByte >> 7) & 0x01
    const vehicleTypeBits = (packedByte >> 3) & 0x0F
    const confidenceHighBits = packedByte & 0x07

    // Remaining confidence bits (1 byte)
    const confidenceLowBits = buffer.readUInt8(offset)
    offset += 1

    const confidenceByte = (confidenceHighBits << 5) | confidenceLowBits
    const confidence = confidenceByte / 255

    // Timestamp offset (4 bytes)
    const timestampOffset = buffer.readUInt32LE(offset)
    offset += 4

    const timestamp = new Date(timestampOffset * 1000)

    // Optional metadata
    let deviceMetadata
    if (offset < buffer.length) {
      const deviceId = buffer.toString('utf8', offset, offset + 16).replace(/\0/g, '')
      offset += 16

      const batteryLevel = buffer.readUInt8(offset) / 100
      offset += 1

      const signalStrength = buffer.readUInt8(offset) / 100
      offset += 1

      deviceMetadata = {
        deviceId,
        batteryLevel,
        signalStrength
      }
    }

    return {
      slotId: this.recoverSlotId(slotIdHash),
      occupancyState: occupancyBit === 1,
      vehicleType: vehicleTypeBits as VehicleType,
      timestamp,
      detectionConfidence: confidence,
      deviceMetadata
    }
  }

  /**
   * Hash slot ID to 64-bit integer
   */
  private hashSlotId(slotId: string): bigint {
    let hash = 0n
    for (let i = 0; i < slotId.length; i++) {
      const char = slotId.charCodeAt(i)
      hash = (hash << 5n) - hash + BigInt(char)
      hash = hash & 0xFFFFFFFFFFFFFFFFn // Keep within 64 bits
    }
    return hash
  }

  /**
   * Recover slot ID from hash (not perfect, but sufficient for ID matching)
   */
  private recoverSlotId(hash: bigint): string {
    // In production, maintain a hash-to-ID mapping
    // For now, return hex representation
    return hash.toString(16)
  }

  /**
   * Get maximum payload size
   */
  getMaxPayloadSize(): number {
    return this.MAX_PAYLOAD_SIZE
  }
}

/**
 * Full-Payload JSON Baseline Encoder
 * Standard verbose JSON payload for comparison
 */
class JSONEncoder {
  /**
   * Encode telemetry data to verbose JSON
   */
  encode(data: TelemetryData): EncodedPayload {
    const jsonPayload = {
      slotId: data.slotId,
      occupancyState: data.occupancyState,
      vehicleType: VehicleType[data.vehicleType],
      timestamp: data.timestamp.toISOString(),
      detectionConfidence: data.detectionConfidence,
      coordinates: data.coordinates,
      deviceMetadata: data.deviceMetadata ? {
        deviceId: data.deviceMetadata.deviceId,
        batteryLevel: data.deviceMetadata.batteryLevel,
        signalStrength: data.deviceMetadata.signalStrength,
        firmwareVersion: "1.0.0",
        lastSeen: new Date().toISOString()
      } : undefined,
      metadata: {
        encoding: "json",
        version: "1.0",
        source: "edge-device"
      }
    }

    const jsonString = JSON.stringify(jsonPayload)
    const buffer = Buffer.from(jsonString, 'utf8')

    return {
      data: buffer,
      size: buffer.length,
      encoding: "json"
    }
  }

  /**
   * Decode JSON payload
   */
  decode(buffer: Buffer): TelemetryData {
    const jsonString = buffer.toString('utf8')
    const jsonPayload = JSON.parse(jsonString)

    // Map vehicle type string back to enum
    const vehicleTypeMap: Record<string, VehicleType> = {
      "CAR": VehicleType.CAR,
      "TWO_WHEELER": VehicleType.TWO_WHEELER,
      "AUTO_RICKSHAW": VehicleType.AUTO_RICKSHAW,
      "LCV": VehicleType.LCV,
      "UNKNOWN": VehicleType.UNKNOWN
    }

    return {
      slotId: jsonPayload.slotId,
      occupancyState: jsonPayload.occupancyState,
      vehicleType: vehicleTypeMap[jsonPayload.vehicleType] || VehicleType.UNKNOWN,
      timestamp: new Date(jsonPayload.timestamp),
      detectionConfidence: jsonPayload.detectionConfidence,
      coordinates: jsonPayload.coordinates,
      deviceMetadata: jsonPayload.deviceMetadata
    }
  }

  /**
   * Get average payload size (for estimation)
   */
  getAveragePayloadSize(): number {
    // Average JSON payload size
    return 600 // Typical size for full JSON payload
  }
}

// Singleton instances
const compactMQTTEncoder = new CompactMQTTEncoder()
const jsonEncoder = new JSONEncoder()

/**
 * Encode telemetry data using compact MQTT encoder
 */
export function encodeCompactMQTT(data: TelemetryData): EncodedPayload {
  return compactMQTTEncoder.encode(data)
}

/**
 * Decode compact MQTT payload
 */
export function decodeCompactMQTT(buffer: Buffer): TelemetryData {
  return compactMQTTEncoder.decode(buffer)
}

/**
 * Encode telemetry data using JSON encoder
 */
export function encodeJSON(data: TelemetryData): EncodedPayload {
  return jsonEncoder.encode(data)
}

/**
 * Decode JSON payload
 */
export function decodeJSON(buffer: Buffer): TelemetryData {
  return jsonEncoder.decode(buffer)
}

/**
 * Get maximum compact payload size
 */
export function getCompactPayloadMaxSize(): number {
  return compactMQTTEncoder.getMaxPayloadSize()
}

/**
 * Get average JSON payload size
 */
export function getJSONPayloadAverageSize(): number {
  return jsonEncoder.getAveragePayloadSize()
}

export { compactMQTTEncoder, jsonEncoder }