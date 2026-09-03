import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

interface AuditLogOptions {
  userId?: string
  action: string
  resource: string
  ipAddress?: string
  userAgent?: string
  details?: any
}

/**
 * Log an audit event to the database
 * This is asynchronous and doesn't block the main request
 */
export async function logAuditEvent(options: AuditLogOptions): Promise<void> {
  try {
    await prisma.auditlog.create({
      data: {
        actorId: options.userId || "system",
        actorRole: "USER",
        action: options.action,
        targetResource: options.resource || "unknown",
        ipAddress: options.ipAddress || "unknown",
        metadataJson: options.details as any,
      },
    })
  } catch (error) {
    console.error("Failed to log audit event:", error)
    // Don't throw - audit logging shouldn't break the main flow
  }
}

/**
 * Log a successful login
 */
export async function logLogin(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
  await logAuditEvent({
    userId,
    action: "USER_LOGIN",
    resource: "/api/auth/signin",
    ipAddress,
    userAgent,
    details: { timestamp: new Date().toISOString() },
  })
}

/**
 * Log a failed login attempt
 */
export async function logFailedLogin(email: string, ipAddress?: string, userAgent?: string): Promise<void> {
  await logAuditEvent({
    action: "FAILED_LOGIN_ATTEMPT",
    resource: "/api/auth/signin",
    ipAddress,
    userAgent,
    details: { email, timestamp: new Date().toISOString() },
  })
}

/**
 * Log a role change
 */
export async function logRoleChange(
  userId: string,
  fromRole: string,
  toRole: string,
  changedBy: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    userId: changedBy,
    action: "ROLE_CHANGE",
    resource: `User:${userId}`,
    ipAddress,
    userAgent,
    details: {
      targetUserId: userId,
      fromRole,
      toRole,
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Log unauthorized access attempt
 */
export async function logUnauthorizedAccess(
  resource: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await logAuditEvent({
    action: "UNAUTHORIZED_ACCESS_ATTEMPT",
    resource,
    ipAddress,
    userAgent,
    details: { timestamp: new Date().toISOString() },
  })
}

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(userId: string, limit: number = 50) {
  return await prisma.auditlog.findMany({
    where: { actorId: userId },
    orderBy: { timestamp: "desc" },
    take: limit,
  })
}

/**
 * Get all audit logs (admin only)
 */
export async function getAllAuditLogs(options: {
  skip?: number
  take?: number
  action?: string
  userId?: string
  startDate?: Date
  endDate?: Date
}) {
  const where: any = {}
  
  if (options.action) {
    where.action = options.action
  }
  
  if (options.userId) {
    where.actorId = options.userId
  }
  
  if (options.startDate || options.endDate) {
    where.timestamp = {}
    if (options.startDate) {
      where.timestamp.gte = options.startDate
    }
    if (options.endDate) {
      where.timestamp.lte = options.endDate
    }
  }
  
  const [logs, total] = await Promise.all([
    prisma.auditlog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: options.skip || 0,
      take: options.take || 50,
    }),
    prisma.auditlog.count({ where }),
  ])
  
  return { logs, total }
}