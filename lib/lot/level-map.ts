/**
 * Level Spatial Manager
 * Multi-storey parking complex spatial management with zone-aware camera mapping
 */

import { PrismaClient, SlotStatus } from "@prisma/client"

const prisma = new PrismaClient()

export interface LevelOccupancySummary {
  levelId: string
  levelName: string
  floorNumber: number
  totalSlots: number
  occupiedSlots: number
  availableSlots: number
  occupancyRate: number
  zones: ZoneSummary[]
}

export interface ZoneSummary {
  zoneCode: string
  totalSlots: number
  occupiedSlots: number
  availableSlots: number
  occupancyRate: number
}

export interface SlotWithPosition {
  id: string
  slotNumber: number
  zoneCode: string | null
  aisleNumber: number | null
  positionX: number | null
  positionY: number | null
  status: SlotStatus
  distanceFromEntry: number | null
}

export interface CameraZoneMapping {
  cameraId: string
  levelId: string
  zones: string[]
}

/**
 * Level Spatial Manager
 * Handles multi-storey parking complex spatial operations
 */
class LevelSpatialManager {
  /**
   * Get level occupancy summary for a parking lot
   * Aggregates total, occupied, and available slots grouped per level and per zone
   */
  async getLevelOccupancySummary(lotId: string): Promise<LevelOccupancySummary[]> {
    // Get all levels for the lot
    const levels = await prisma.parkingLevel.findMany({
      where: { parkingLotId: lotId },
      orderBy: { floorNumber: "asc" },
      include: {
        slots: {
          select: {
            id: true,
            status: true,
            zoneCode: true,
          },
        },
      },
    })

    const summaries: LevelOccupancySummary[] = []

    for (const level of levels) {
      const totalSlots = level.slots.length
      const occupiedSlots = level.slots.filter(s => s.status === SlotStatus.OCCUPIED).length
      const availableSlots = totalSlots - occupiedSlots
      const occupancyRate = totalSlots > 0 ? occupiedSlots / totalSlots : 0

      // Group by zone
      const zoneMap = new Map<string, number>()
      const zoneOccupiedMap = new Map<string, number>()

      for (const slot of level.slots) {
        const zoneCode = slot.zoneCode || "UNASSIGNED"
        zoneMap.set(zoneCode, (zoneMap.get(zoneCode) || 0) + 1)
        if (slot.status === SlotStatus.OCCUPIED) {
          zoneOccupiedMap.set(zoneCode, (zoneOccupiedMap.get(zoneCode) || 0) + 1)
        }
      }

      const zones: ZoneSummary[] = []
      for (const [zoneCode, total] of zoneMap.entries()) {
        const occupied = zoneOccupiedMap.get(zoneCode) || 0
        zones.push({
          zoneCode,
          totalSlots: total,
          occupiedSlots: occupied,
          availableSlots: total - occupied,
          occupancyRate: total > 0 ? occupied / total : 0,
        })
      }

      summaries.push({
        levelId: level.id,
        levelName: level.levelName,
        floorNumber: level.floorNumber,
        totalSlots,
        occupiedSlots,
        availableSlots,
        occupancyRate,
        zones,
      })
    }

    return summaries
  }

  /**
   * Assign camera to specific zones on a level
   * Maps edge camera optical frames to specific multi-floor zones
   */
  async assignCameraToZone(
    cameraId: string,
    levelId: string,
    zones: string[]
  ): Promise<CameraZoneMapping> {
    // Update camera with level and zones
    const camera = await prisma.camera.update({
      where: { id: cameraId },
      data: {
        levelId,
        zones: zones.join(","),
      },
    })

    return {
      cameraId: camera.id,
      levelId: camera.levelId || "",
      zones: camera.zones ? camera.zones.split(",") : [],
    }
  }

  /**
   * Calculate nearest available slot on a specific floor
   * Identifies the closest free slot for dynamic barrier signages
   */
  async calculateNearestAvailableSlot(
    levelId: string,
    entryAisle: number
  ): Promise<SlotWithPosition | null> {
    // Get all available slots on the level
    const slots = await prisma.slot.findMany({
      where: {
        levelId,
        status: SlotStatus.AVAILABLE,
      },
      select: {
        id: true,
        slotNumber: true,
        zoneCode: true,
        aisleNumber: true,
        positionX: true,
        positionY: true,
        status: true,
      },
    })

    if (slots.length === 0) {
      return null
    }

    // Calculate distance from entry aisle
    const slotsWithDistance = slots.map(slot => {
      let distance: number | null = null

      if (slot.positionX !== null && slot.positionY !== null) {
        // Calculate Euclidean distance from entry point
        // Assuming entry is at position (0, entryAisle * gridWidth)
        const entryX = 0
        const entryY = entryAisle * 10 // Assuming 10 units per aisle
        
        const dx = slot.positionX - entryX
        const dy = slot.positionY - entryY
        distance = Math.sqrt(dx * dx + dy * dy)
      } else if (slot.aisleNumber !== null) {
        // Fallback to aisle-based distance
        distance = Math.abs(slot.aisleNumber - entryAisle)
      }

      return {
        ...slot,
        distanceFromEntry: distance,
      }
    })

    // Filter out slots without position data
    const slotsWithValidDistance = slotsWithDistance.filter(s => s.distanceFromEntry !== null)

    if (slotsWithValidDistance.length === 0) {
      // Return first available slot as fallback
      return {
        ...slots[0],
        distanceFromEntry: null,
      }
    }

    // Sort by distance and return nearest
    slotsWithValidDistance.sort((a, b) => 
      (a.distanceFromEntry || 0) - (b.distanceFromEntry || 0)
    )

    return slotsWithValidDistance[0]
  }

  /**
   * Get all available slots on a level
   */
  async getAvailableSlots(levelId: string): Promise<SlotWithPosition[]> {
    const slots = await prisma.slot.findMany({
      where: {
        levelId,
        status: SlotStatus.AVAILABLE,
      },
      select: {
        id: true,
        slotNumber: true,
        zoneCode: true,
        aisleNumber: true,
        positionX: true,
        positionY: true,
        status: true,
      },
    })

    return slots.map(slot => ({
      ...slot,
      distanceFromEntry: null,
    }))
  }

  /**
   * Get slot by position coordinates
   */
  async getSlotByPosition(
    levelId: string,
    positionX: number,
    positionY: number,
    tolerance: number = 5.0
  ): Promise<SlotWithPosition | null> {
    const slots = await prisma.slot.findMany({
      where: {
        levelId,
        positionX: {
          gte: positionX - tolerance,
          lte: positionX + tolerance,
        },
        positionY: {
          gte: positionY - tolerance,
          lte: positionY + tolerance,
        },
      },
      select: {
        id: true,
        slotNumber: true,
        zoneCode: true,
        aisleNumber: true,
        positionX: true,
        positionY: true,
        status: true,
      },
    })

    if (slots.length === 0) {
      return null
    }

    return {
      ...slots[0],
      distanceFromEntry: null,
    }
  }

  /**
   * Get level by floor number
   */
  async getLevelByFloorNumber(lotId: string, floorNumber: number) {
    return await prisma.parkingLevel.findFirst({
      where: {
        parkingLotId: lotId,
        floorNumber,
      },
    })
  }

  /**
   * Get cameras for a level
   */
  async getLevelCameras(levelId: string) {
    return await prisma.camera.findMany({
      where: { levelId },
      include: {
        parkingLot: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })
  }

  /**
   * Get zones for a level
   */
  async getLevelZones(levelId: string): Promise<string[]> {
    const slots = await prisma.slot.findMany({
      where: { levelId },
      select: { zoneCode: true },
      distinct: ["zoneCode"],
    })

    return slots
      .map(s => s.zoneCode)
      .filter((z): z is string => z !== null && z !== "")
  }

  /**
   * Update slot position data
   */
  async updateSlotPosition(
    slotId: string,
    positionX: number,
    positionY: number,
    zoneCode?: string,
    aisleNumber?: number
  ) {
    return await prisma.slot.update({
      where: { id: slotId },
      data: {
        positionX,
        positionY,
        ...(zoneCode && { zoneCode }),
        ...(aisleNumber !== undefined && { aisleNumber }),
      },
    })
  }

  /**
   * Create new parking level
   */
  async createParkingLevel(data: {
    parkingLotId: string
    levelName: string
    floorNumber: number
    totalSlots: number
    cameraCount: number
    mapSvgUrl?: string
  }) {
    return await prisma.parkingLevel.create({
      data,
    })
  }

  /**
   * Update parking level statistics
   */
  async updateLevelStatistics(levelId: string) {
    const level = await prisma.parkingLevel.findUnique({
      where: { id: levelId },
      include: {
        slots: true,
        cameras: true,
      },
    })

    if (!level) {
      throw new Error("Level not found")
    }

    return await prisma.parkingLevel.update({
      where: { id: levelId },
      data: {
        totalSlots: level.slots.length,
        cameraCount: level.cameras.length,
      },
    })
  }
}

// Singleton instance
const levelSpatialManager = new LevelSpatialManager()

/**
 * Get level occupancy summary
 */
export async function getLevelOccupancySummary(lotId: string): Promise<LevelOccupancySummary[]> {
  return await levelSpatialManager.getLevelOccupancySummary(lotId)
}

/**
 * Assign camera to zone
 */
export async function assignCameraToZone(
  cameraId: string,
  levelId: string,
  zones: string[]
): Promise<CameraZoneMapping> {
  return await levelSpatialManager.assignCameraToZone(cameraId, levelId, zones)
}

/**
 * Calculate nearest available slot
 */
export async function calculateNearestAvailableSlot(
  levelId: string,
  entryAisle: number
): Promise<SlotWithPosition | null> {
  return await levelSpatialManager.calculateNearestAvailableSlot(levelId, entryAisle)
}

/**
 * Get available slots
 */
export async function getAvailableSlots(levelId: string): Promise<SlotWithPosition[]> {
  return await levelSpatialManager.getAvailableSlots(levelId)
}

/**
 * Get slot by position
 */
export async function getSlotByPosition(
  levelId: string,
  positionX: number,
  positionY: number,
  tolerance?: number
): Promise<SlotWithPosition | null> {
  return await levelSpatialManager.getSlotByPosition(levelId, positionX, positionY, tolerance)
}

/**
 * Get level by floor number
 */
export async function getLevelByFloorNumber(lotId: string, floorNumber: number) {
  return await levelSpatialManager.getLevelByFloorNumber(lotId, floorNumber)
}

/**
 * Get level cameras
 */
export async function getLevelCameras(levelId: string) {
  return await levelSpatialManager.getLevelCameras(levelId)
}

/**
 * Get level zones
 */
export async function getLevelZones(levelId: string): Promise<string[]> {
  return await levelSpatialManager.getLevelZones(levelId)
}

/**
 * Update slot position
 */
export async function updateSlotPosition(
  slotId: string,
  positionX: number,
  positionY: number,
  zoneCode?: string,
  aisleNumber?: number
) {
  return await levelSpatialManager.updateSlotPosition(slotId, positionX, positionY, zoneCode, aisleNumber)
}

/**
 * Create parking level
 */
export async function createParkingLevel(data: {
  parkingLotId: string
  levelName: string
  floorNumber: number
  totalSlots: number
  cameraCount: number
  mapSvgUrl?: string
}) {
  return await levelSpatialManager.createParkingLevel(data)
}

/**
 * Update level statistics
 */
export async function updateLevelStatistics(levelId: string) {
  return await levelSpatialManager.updateLevelStatistics(levelId)
}

export { levelSpatialManager }