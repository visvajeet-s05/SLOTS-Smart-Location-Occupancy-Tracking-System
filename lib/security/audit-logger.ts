/**
 * Audit Logging Manager
 * Append-only ledger for privileged operator actions
 * Tracks all administrative security events
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export interface AuditLogEntry {
  id: string
  actorId: string
  actorRole: string
  action: string
  targetResource: string
  ipAddress: string
  metadataJson: any
  timestamp: Date
}

export interface AuditLogCreateInput {
  actorId: string
  actorRole: string
  action: string
  targetResource: string
  ipAddress: string
  metadata?: any
}

export enum AuditAction {
  BARRIER_RELEASE = "BARRIER_RELEASE",
  TARIFF_OVERRIDE = "TARIFF_OVERRIDE",
  PRICING_RULE_MODIFICATION = "PRICING_RULE_MODIFICATION",
  USER_ROLE_CHANGE = "USER_ROLE_CHANGE",
  DEVICE_AUTHORIZATION = "DEVICE_AUTHORIZATION",
  SLOT_STATUS_OVERRIDE = "SLOT_STATUS_OVERRIDE",
  BOOKING_OVERRIDE = "BOOKING_OVERRIDE",
  VIOLATION_RESOLUTION = "VIOLATION_RESOLUTION",
  SYSTEM_CONFIG_CHANGE = "SYSTEM_CONFIG_CHANGE",
  MANUAL_SLOT_ASSIGNMENT = "MANUAL_SLOT_ASSIGNMENT",
}

export enum ActorRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  OPERATOR = "OPERATOR",
  OWNER = "OWNER",
  EDGE_DEVICE = "EDGE_DEVICE",
}

/**
 * Audit Logging Manager
 * Append-only ledger for privileged operations
 */
class AuditLogger {
  /**
   * Log admin action to database
   * Append-only ledger recording privileged operations
   */
  async logAdminAction(input: AuditLogCreateInput): Promise<AuditLogEntry> {
    const auditLog = await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        targetResource: input.targetResource,
        ipAddress: input.ipAddress,
        metadataJson: input.metadata || {},
      },
    })

    return {
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorRole: auditLog.actorRole,
      action: auditLog.action,
      targetResource: auditLog.targetResource,
      ipAddress: auditLog.ipAddress,
      metadataJson: auditLog.metadataJson,
      timestamp: auditLog.timestamp,
    }
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(filters: {
    actorId?: string
    action?: string
    targetResource?: string
    actorRole?: string
    fromDate?: Date
    toDate?: Date
    page?: number
    limit?: number
  }) {
    const {
      actorId,
      action,
      targetResource,
      actorRole,
      fromDate,
      toDate,
      page = 1,
      limit = 50,
    } = filters

    const where: any = {}

    if (actorId) {
      where.actorId = actorId
    }

    if (action) {
      where.action = action
    }

    if (targetResource) {
      where.targetResource = {
        contains: targetResource,
        mode: "insensitive",
      }
    }

    if (actorRole) {
      where.actorRole = actorRole
    }

    if (fromDate || toDate) {
      where.timestamp = {}
      if (fromDate) {
        where.timestamp.gte = fromDate
      }
      if (toDate) {
        where.timestamp.lte = toDate
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  /**
   * Get audit log by ID
   */
  async getAuditLogById(id: string): Promise<AuditLogEntry | null> {
    const auditLog = await prisma.auditLog.findUnique({
      where: { id },
    })

    if (!auditLog) {
      return null
    }

    return {
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorRole: auditLog.actorRole,
      action: auditLog.action,
      targetResource: auditLog.targetResource,
      ipAddress: auditLog.ipAddress,
      metadataJson: auditLog.metadataJson,
      timestamp: auditLog.timestamp,
    }
  }

  /**
   * Get audit logs for a specific actor
   */
  async getActorAuditLogs(actorId: string, limit: number = 100) {
    return await prisma.auditLog.findMany({
      where: { actorId },
      orderBy: { timestamp: "desc" },
      take: limit,
    })
  }

  /**
   * Get audit logs for a specific action type
   */
  async getActionAuditLogs(action: string, limit: number = 100) {
    return await prisma.auditLog.findMany({
      where: { action },
      orderBy: { timestamp: "desc" },
      take: limit,
    })
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(fromDate: Date, toDate: Date) {
    const stats = await prisma.auditLog.groupBy({
      by: ["action", "actorRole"],
      where: {
        timestamp: {
          gte: fromDate,
          lte: toDate,
        },
      },
      _count: true,
    })

    return stats
  }

  /**
   * Get recent audit logs (last N hours)
   */
  async getRecentAuditLogs(hours: number = 24, limit: number = 50) {
    const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000)

    return await prisma.auditLog.findMany({
      where: {
        timestamp: {
          gte: fromDate,
        },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    })
  }

  /**
   * Log barrier release action
   */
  async logBarrierRelease(
    actorId: string,
    actorRole: string,
    barrierId: string,
    ipAddress: string,
    reason?: string
  ) {
    return await this.logAdminAction({
      actorId,
      actorRole,
      action: AuditAction.BARRIER_RELEASE,
      targetResource: `barrier:${barrierId}`,
      ipAddress,
      metadata: { reason },
    })
  }

  /**
   * Log tariff override action
   */
  async logTariffOverride(
    actorId: string,
    actorRole: string,
    parkingLotId: string,
    originalRate: number,
    newRate: number,
    ipAddress: string
  ) {
    return await this.logAdminAction({
      actorId,
      actorRole,
      action: AuditAction.TARIFF_OVERRIDE,
      targetResource: `parkingLot:${parkingLotId}`,
      ipAddress,
      metadata: {
        originalRate,
        newRate,
        rateDifference: newRate - originalRate,
      },
    })
  }

  /**
   * Log pricing rule modification
   */
  async logPricingRuleModification(
    actorId: string,
    actorRole: string,
    pricingRuleId: string,
    oldValues: any,
    newValues: any,
    ipAddress: string
  ) {
    return await this.logAdminAction({
      actorId,
      actorRole,
      action: AuditAction.PRICING_RULE_MODIFICATION,
      targetResource: `pricingRule:${pricingRuleId}`,
      ipAddress,
      metadata: {
        oldValues,
        newValues,
        changes: this.detectChanges(oldValues, newValues),
      },
    })
  }

  /**
   * Log user role change
   */
  async logUserRoleChange(
    actorId: string,
    actorRole: string,
    targetUserId: string,
    oldRole: string,
    newRole: string,
    ipAddress: string
  ) {
    return await this.logAdminAction({
      actorId,
      actorRole,
      action: AuditAction.USER_ROLE_CHANGE,
      targetResource: `user:${targetUserId}`,
      ipAddress,
      metadata: {
        oldRole,
        newRole,
      },
    })
  }

  /**
   * Log device authorization
   */
  async logDeviceAuthorization(
    actorId: string,
    actorRole: string,
    deviceId: string,
    authorized: boolean,
    ipAddress: string
  ) {
    return await this.logAdminAction({
      actorId,
      actorRole,
      action: AuditAction.DEVICE_AUTHORIZATION,
      targetResource: `device:${deviceId}`,
      ipAddress,
      metadata: { authorized },
    })
  }

  /**
   * Detect changes between two objects
   */
  private detectChanges(oldObj: any, newObj: any): any {
    const changes: any = {}

    for (const key in newObj) {
      if (oldObj[key] !== newObj[key]) {
        changes[key] = {
          from: oldObj[key],
          to: newObj[key],
        }
      }
    }

    return changes
  }

  /**
   * Get audit log export (CSV format)
   */
  async exportAuditLogs(filters: {
    fromDate?: Date
    toDate?: Date
    actorId?: string
    action?: string
  }): Promise<string> {
    const logs = await this.getAuditLogs({
      ...filters,
      page: 1,
      limit: 10000, // Large limit for export
    })

    const headers = ["ID", "Actor ID", "Actor Role", "Action", "Target Resource", "IP Address", "Timestamp", "Metadata"]
    const rows = logs.logs.map(log => [
      log.id,
      log.actorId,
      log.actorRole,
      log.action,
      log.targetResource,
      log.ipAddress,
      log.timestamp.toISOString(),
      JSON.stringify(log.metadataJson),
    ])

    const csv = [headers.join(","), ...rows.map(row => row.join(","))].join("\n")
    return csv
  }
}

// Singleton instance
const auditLogger = new AuditLogger()

/**
 * Log admin action
 */
export async function logAdminAction(input: AuditLogCreateInput): Promise<AuditLogEntry> {
  return await auditLogger.logAdminAction(input)
}

/**
 * Get audit logs
 */
export async function getAuditLogs(filters: {
  actorId?: string
  action?: string
  targetResource?: string
  actorRole?: string
  fromDate?: Date
  toDate?: Date
  page?: number
  limit?: number
}) {
  return await auditLogger.getAuditLogs(filters)
}

/**
 * Get audit log by ID
 */
export async function getAuditLogById(id: string): Promise<AuditLogEntry | null> {
  return await auditLogger.getAuditLogById(id)
}

/**
 * Get actor audit logs
 */
export async function getActorAuditLogs(actorId: string, limit?: number) {
  return await auditLogger.getActorAuditLogs(actorId, limit)
}

/**
 * Get action audit logs
 */
export async function getActionAuditLogs(action: string, limit?: number) {
  return await auditLogger.getActionAuditLogs(action, limit)
}

/**
 * Get audit statistics
 */
export async function getAuditStats(fromDate: Date, toDate: Date) {
  return await auditLogger.getAuditStats(fromDate, toDate)
}

/**
 * Get recent audit logs
 */
export async function getRecentAuditLogs(hours?: number, limit?: number) {
  return await auditLogger.getRecentAuditLogs(hours, limit)
}

/**
 * Log barrier release
 */
export async function logBarrierRelease(
  actorId: string,
  actorRole: string,
  barrierId: string,
  ipAddress: string,
  reason?: string
) {
  return await auditLogger.logBarrierRelease(actorId, actorRole, barrierId, ipAddress, reason)
}

/**
 * Log tariff override
 */
export async function logTariffOverride(
  actorId: string,
  actorRole: string,
  parkingLotId: string,
  originalRate: number,
  newRate: number,
  ipAddress: string
) {
  return await auditLogger.logTariffOverride(actorId, actorRole, parkingLotId, originalRate, newRate, ipAddress)
}

/**
 * Log pricing rule modification
 */
export async function logPricingRuleModification(
  actorId: string,
  actorRole: string,
  pricingRuleId: string,
  oldValues: any,
  newValues: any,
  ipAddress: string
) {
  return await auditLogger.logPricingRuleModification(actorId, actorRole, pricingRuleId, oldValues, newValues, ipAddress)
}

/**
 * Log user role change
 */
export async function logUserRoleChange(
  actorId: string,
  actorRole: string,
  targetUserId: string,
  oldRole: string,
  newRole: string,
  ipAddress: string
) {
  return await auditLogger.logUserRoleChange(actorId, actorRole, targetUserId, oldRole, newRole, ipAddress)
}

/**
 * Log device authorization
 */
export async function logDeviceAuthorization(
  actorId: string,
  actorRole: string,
  deviceId: string,
  authorized: boolean,
  ipAddress: string
) {
  return await auditLogger.logDeviceAuthorization(actorId, actorRole, deviceId, authorized, ipAddress)
}

/**
 * Export audit logs
 */
export async function exportAuditLogs(filters: {
  fromDate?: Date
  toDate?: Date
  actorId?: string
  action?: string
}): Promise<string> {
  return await auditLogger.exportAuditLogs(filters)
}

export { auditLogger }