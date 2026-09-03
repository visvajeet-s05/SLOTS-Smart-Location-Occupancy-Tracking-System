/** Core data models for the SLOTIFY Live AI Camera Surveillance Hub */

export type LayoutMode = "2x2" | "3x3" | "4x4" | "1UP"

export interface Detection {
  id: string
  label: "CAR" | "TRUCK" | "MOTORCYCLE" | "BUS" | "PEDESTRIAN"
  confidence: number
  /** Bounding box as percentages of the feed canvas (0-100) */
  box: { x: number; y: number; w: number; h: number }
  plate?: string
}

export interface CameraFeed {
  id: string
  name: string
  row: string
  label: string
  fps: number
  bitrateMbps: number
  resolution: string
  occupied: number
  capacity: number
  detections: Detection[]
  /** Optional IP webcam / MJPEG stream URL for real video feed */
  ipWebcamUrl?: string
  /** Slots this camera covers (row letter + slot numbers) */
  coveredSlots?: string[]
}

export type SlotStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "DISABLED" | "CLOSED"

export interface ParkingSlot {
  id: string
  slotNumber: number
  row: string
  status: SlotStatus
  aiConfidence?: number
  updatedBy?: "AI" | "OWNER" | "CUSTOMER"
  price?: number
}

export type EventType =
  | "VEHICLE_DETECTED"
  | "PLATE_RECOGNIZED"
  | "SLOT_OCCUPIED"
  | "SLOT_RELEASED"
  | "ANOMALY_FLAGGED"
  | "VEHICLE_EXITED"

export interface AIEvent {
  id: string
  timestamp: string
  camId: string
  slot: string
  type: EventType
  plate?: string
  confidence?: number
}

/** Mock slot & plate pools for realistic simulations */
export const SLOT_NAMES = ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08"]
export const PLATE_POOL = [
  "TN-01-AB-1234",
  "TN-07-CX-8821",
  "KA-03-MK-4470",
  "TN-22-BV-9912",
  "AP-16-ZY-3345",
  "TN-09-QW-7766",
  "KL-07-ER-1120",
  "TN-18-NM-6503",
]

export interface LotConfig {
  id: string
  name: string
  totalSlots: number
  location?: string
  price?: number
  /** IP webcam URL(s) for this parking lot (comma-separated if multiple) */
  webcamUrls?: string[]
}

/**
 * Builds camera feeds mapped to parking lot rows.
 * Phoenix Marketcity (250 slots) → 13 rows (A–M) × ~20 slots, 1 camera per row.
 * Each camera covers exactly 1 row and gets an IP webcam URL.
 */
export function buildCamerasForLot(
  lot: LotConfig,
  defaultWebcamUrl?: string,
  apiSlots?: any[]
): CameraFeed[] {
  const rows = Math.min(13, Math.ceil(lot.totalSlots / 20))
  const rowLetters = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i))
  const slotsPerRow = Math.ceil(lot.totalSlots / rows)

  // 1 camera per row
  const numCameras = rows
  const rowsPerCamera = 1

  // Build webcam URL pool
  const webcamPool: string[] = defaultWebcamUrl
    ? [defaultWebcamUrl]
    : lot.webcamUrls || []

  // Build slot map from API data if provided
  const apiSlotMap: Record<string, any> = {}
  if (apiSlots) {
    apiSlots.forEach((s) => {
      const row = (s.row || "A").toUpperCase()
      const num = String(s.slotNumber).padStart(2, "0")
      const key = `${row}${num}`
      apiSlotMap[key] = s
    })
  }

  return Array.from({ length: numCameras }, (_, camIdx) => {
    const rowLetter = rowLetters[camIdx]
    const rowLabel = rowLetter

    const coveredSlots: string[] = []
    for (let s = 1; s <= slotsPerRow; s++) {
      if (coveredSlots.length >= lot.totalSlots) break
      const slotKey = `${rowLetter}${String(s).padStart(2, "0")}`
      if (Object.keys(apiSlotMap).length > 0) {
        if (apiSlotMap[slotKey]) coveredSlots.push(slotKey)
      } else {
        coveredSlots.push(slotKey)
      }
    }

    const camNum = String(camIdx + 1).padStart(2, "0")

    return {
      id: `CAM-${camNum}`,
      name: `CAM-${camNum}`,
      row: `Row ${rowLabel}`,
      label: `${rowLabel.toUpperCase()}-${camNum}`,
      fps: 30,
      bitrateMbps: Number((3.8 + ((camIdx * 1.7) % 2.4)).toFixed(1)),
      resolution: "3840x2160",
      occupied: 0,
      capacity: coveredSlots.length,
      detections: [],
      ipWebcamUrl: webcamPool[camIdx % (webcamPool.length || 1)],
      coveredSlots,
    }
  })
}

/** Builds the initial set of 16 surveillance cameras across 4 CCTV rows (legacy) */
export function buildInitialCameras(): CameraFeed[] {
  const rows = ["A", "B", "C", "D"]
  return Array.from({ length: 16 }, (_, i) => {
    const rowIdx = Math.floor(i / 4)
    const row = rows[rowIdx]
    const num = String(i + 1).padStart(2, "0")
    const detCount = i % 2 === 0 ? 1 : 2
    return {
      id: `CAM-${num}`,
      name: `CAM-${num}`,
      row: `Row ${row}`,
      label: `${row.toUpperCase()}-${String(i % 4 + 1).padStart(2, "0")}`,
      fps: 28 + (i % 4),
      bitrateMbps: Number((3.8 + ((i * 1.7) % 2.4)).toFixed(1)),
      resolution: "3840x2160",
      occupied: 2 + Math.min(i % 6, 6),
      capacity: 8,
      detections: Array.from({ length: detCount }, (_, d) => ({
        id: `det-${i}-${d}`,
        label: d % 2 === 0 ? "CAR" : "TRUCK",
        confidence: Number((0.9 + (d * 0.03) % 0.08).toFixed(2)),
        box: {
          x: Number((8 + (d * 48) + (i % 3) * 4).toFixed(1)),
          y: Number((28 + (i % 4) * 6 + d * 14).toFixed(1)),
          w: Number((11 + (i % 3) * 2).toFixed(1)),
          h: Number((18 + (i % 2) * 5).toFixed(1)),
        },
        plate: PLATE_POOL[(i + d) % PLATE_POOL.length],
      })),
    }
  })
}

/** Live-ish timestamp formatter (HH:MM:SS) */
export function nowTimestamp(): string {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":")
}

let eventCounter = 0
export function nextEventId(): string {
  eventCounter += 1
  return `evt-${Date.now()}-${eventCounter}`
}

const EVENT_TYPES: EventType[] = [
  "VEHICLE_DETECTED",
  "PLATE_RECOGNIZED",
  "SLOT_OCCUPIED",
  "SLOT_RELEASED",
  "ANOMALY_FLAGGED",
  "VEHICLE_EXITED",
]

export function randomEventType(): EventType {
  return EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)]
}

/** Generator for synthetic AI event log entries */
export function generateMockEvent(cams: CameraFeed[]): AIEvent {
  const cam = cams[Math.floor(Math.random() * cams.length)]
  const slot = SLOT_NAMES[Math.floor(Math.random() * SLOT_NAMES.length)]
  const type = randomEventType()
  const isDetection = type === "VEHICLE_DETECTED" || type === "PLATE_RECOGNIZED"
  return {
    id: nextEventId(),
    timestamp: nowTimestamp(),
    camId: cam.name,
    slot,
    type,
    plate: isDetection ? PLATE_POOL[Math.floor(Math.random() * PLATE_POOL.length)] : undefined,
    confidence: type === "VEHICLE_DETECTED" ? Number((0.85 + Math.random() * 0.14).toFixed(2)) : undefined,
  }
}