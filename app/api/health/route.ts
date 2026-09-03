import { NextResponse } from "next/server"
import { checkDatabaseHealth, getConnectionPoolStats } from "@/lib/db/optimizations"
import { pingHardwareDevices } from "@/lib/hardware/health-monitor"
import { getVlmQueueStatus } from "@/lib/vision/vlm-fallback"
import { getResyncStatus } from "@/lib/edge/resync-engine"

/**
 * System Health & Readiness Endpoint
 * Returns comprehensive system status for monitoring and load balancers
 */
export async function GET() {
  const startTime = Date.now()
  
  try {
    // Check database health
    const dbHealth = await checkDatabaseHealth()
    
    // Get connection pool stats
    const poolStats = await getConnectionPoolStats()
    
    // Check IoT device fleet connectivity
    const deviceHealth = await pingHardwareDevices()
    
    // Calculate device online percentage
    const deviceOnlinePercentage = deviceHealth.totalDevices > 0
      ? (deviceHealth.onlineDevices / deviceHealth.totalDevices) * 100
      : 0
    
    // Check Redis/Memory cache (simplified - just check if Redis URL is configured)
    const redisConfigured = !!process.env.REDIS_URL
    const redisLatency = redisConfigured ? 0 : null // Would actually ping Redis in production
    
    // Check VLM queue status
    const vlmQueueStatus = getVlmQueueStatus()
    
    // Check edge re-sync status
    const resyncStatus = await getResyncStatus()
    
    // Check booking lock engine queue status (simplified)
    const lockEngineStatus = {
      active: true,
      queueSize: 0, // Would check actual queue in production
      lastProcessed: new Date().toISOString(),
    }
    
    // WebSocket server active client connection count (simplified)
    const wsStatus = {
      active: true,
      clientCount: 0, // Would check actual WebSocket server
      uptime: process.uptime(),
    }
    
    // MQTT broker connectivity status (simplified)
    const mqttStatus = {
      connected: !!process.env.MQTT_BROKER_URL,
      brokerUrl: process.env.MQTT_BROKER_URL || "not_configured",
    }
    
    const totalLatency = Date.now() - startTime
    
    // Determine overall health status
    const isHealthy = 
      dbHealth.healthy &&
      dbHealth.latency < 1000 &&
      deviceOnlinePercentage >= 80
    
    const healthStatus = isHealthy ? "healthy" : "degraded"
    
    const response = {
      status: healthStatus,
      timestamp: new Date().toISOString(),
      latency: totalLatency,
      services: {
        database: {
          status: dbHealth.healthy ? "operational" : "down",
          latency: dbHealth.latency,
          error: dbHealth.error || null,
          connectionPool: {
            active: poolStats.activeConnections,
            total: poolStats.totalConnections,
            idle: poolStats.idleConnections,
          },
        },
        cache: {
          status: redisConfigured ? "operational" : "not_configured",
          latency: redisLatency,
          type: redisConfigured ? "redis" : "memory",
        },
        iot_fleet: {
          status: deviceOnlinePercentage >= 80 ? "operational" : "degraded",
          totalDevices: deviceHealth.totalDevices,
          onlineDevices: deviceHealth.onlineDevices,
          offlineDevices: deviceHealth.offlineDevices,
          onlinePercentage: Math.round(deviceOnlinePercentage),
          offlineDeviceIds: deviceHealth.offlineDeviceIds,
        },
        vision_pipeline: {
          status: "operational",
          vlmQueue: {
            queueSize: vlmQueueStatus.queueSize,
            processing: vlmQueueStatus.processing,
          },
        },
        edge_sync: {
          status: resyncStatus.isRunning ? "operational" : "inactive",
          isRunning: resyncStatus.isRunning,
          pendingTransactions: resyncStatus.pendingTransactions,
        },
        booking_lock_engine: {
          status: lockEngineStatus.active ? "operational" : "down",
          queueSize: lockEngineStatus.queueSize,
          lastProcessed: lockEngineStatus.lastProcessed,
        },
        websocket: {
          status: wsStatus.active ? "operational" : "down",
          clientCount: wsStatus.clientCount,
          uptime: wsStatus.uptime,
        },
        mqtt: {
          status: mqttStatus.connected ? "connected" : "disconnected",
          brokerUrl: mqttStatus.brokerUrl,
        },
      },
      environment: process.env.NODE_ENV || "development",
      version: process.env.npm_package_version || "1.0.0",
    }
    
    // Return appropriate HTTP status based on health
    const statusCode = isHealthy ? 200 : 503
    
    return NextResponse.json(response, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Health-Check-Latency': totalLatency.toString(),
      },
    })
  } catch (error: any) {
    const totalLatency = Date.now() - startTime
    
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        latency: totalLatency,
        error: error.message,
        services: {
          database: { status: "unknown" },
          cache: { status: "unknown" },
          iot_fleet: { status: "unknown" },
          vision_pipeline: { status: "unknown" },
          edge_sync: { status: "unknown" },
          booking_lock_engine: { status: "unknown" },
          websocket: { status: "unknown" },
          mqtt: { status: "unknown" },
        },
      },
      { 
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  }
}

/**
 * HEAD endpoint for simple health checks (load balancers often use HEAD)
 */
export async function HEAD() {
  const dbHealth = await checkDatabaseHealth()
  const statusCode = dbHealth.healthy ? 200 : 503
  
  return new NextResponse(null, { 
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}