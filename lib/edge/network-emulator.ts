/**
 * Network Degradation Emulator
 * Simulates degraded Indian network conditions for edge sync testing
 */

export interface NetworkProfile {
  name: string
  baseLatency: number // ms
  maxLatency: number // ms
  packetLossRate: number // 0.0 to 1.0
  jitterVariance: number // ms
  disconnectInterval: number // seconds between disconnects
  disconnectDuration: number // seconds
  bandwidth: number // bytes per second
}

export interface NetworkEmulationResult {
  success: boolean
  latency: number
  dropped: boolean
  bandwidthThrottled: boolean
  timestamp: Date
}

export interface NetworkStatistics {
  totalAttempts: number
  successfulTransmissions: number
  failedTransmissions: number
  averageLatency: number
  totalBytesTransferred: number
  totalBandwidthConsumed: number
  packetLossRate: number
  disconnectCount: number
}

// Predefined network profiles for Indian conditions
export const NETWORK_PROFILES: Record<string, NetworkProfile> = {
  optimal_fiber: {
    name: "optimal_fiber",
    baseLatency: 10,
    maxLatency: 50,
    packetLossRate: 0.001, // 0.1%
    jitterVariance: 5,
    disconnectInterval: 0, // No disconnects
    disconnectDuration: 0,
    bandwidth: 10000000, // 10 Mbps
  },
  urban_4g: {
    name: "urban_4g",
    baseLatency: 50,
    maxLatency: 200,
    packetLossRate: 0.02, // 2%
    jitterVariance: 20,
    disconnectInterval: 300, // 5 minutes
    disconnectDuration: 5, // 5 seconds
    bandwidth: 2000000, // 2 Mbps
  },
  degraded_3g_edge: {
    name: "degraded_3g_edge",
    baseLatency: 200,
    maxLatency: 2000,
    packetLossRate: 0.15, // 15%
    jitterVariance: 100,
    disconnectInterval: 60, // 1 minute
    disconnectDuration: 10, // 10 seconds
    bandwidth: 500000, // 500 Kbps
  },
  monsoon_spotty: {
    name: "monsoon_spotty",
    baseLatency: 500,
    maxLatency: 5000,
    packetLossRate: 0.35, // 35%
    jitterVariance: 200,
    disconnectInterval: 30, // 30 seconds
    disconnectDuration: 15, // 15 seconds
    bandwidth: 100000, // 100 Kbps
  },
}

/**
 * Network Degradation Emulator
 * Simulates realistic network conditions for edge sync testing
 */
class NetworkEmulator {
  private currentProfile: NetworkProfile
  private statistics: NetworkStatistics
  private lastDisconnectTime: Date | null = null
  private isInDisconnectWindow: boolean = false

  constructor(profile: NetworkProfile | string) {
    this.currentProfile = typeof profile === "string" 
      ? NETWORK_PROFILES[profile] 
      : profile
    
    this.statistics = {
      totalAttempts: 0,
      successfulTransmissions: 0,
      failedTransmissions: 0,
      averageLatency: 0,
      totalBytesTransferred: 0,
      totalBandwidthConsumed: 0,
      packetLossRate: 0,
      disconnectCount: 0,
    }
  }

  /**
   * Set network profile
   */
  setProfile(profile: NetworkProfile | string): void {
    this.currentProfile = typeof profile === "string" 
      ? NETWORK_PROFILES[profile] 
      : profile
  }

  /**
   * Simulate network transmission with injected degradation
   */
  async transmit(payload: Buffer): Promise<NetworkEmulationResult> {
    const startTime = Date.now()
    this.statistics.totalAttempts++

    // Check if in disconnect window
    if (this.isInDisconnectWindow) {
      // Check if disconnect period has ended
      if (this.lastDisconnectTime) {
        const elapsed = (Date.now() - this.lastDisconnectTime.getTime()) / 1000
        if (elapsed >= this.currentProfile.disconnectDuration) {
          this.isInDisconnectWindow = false
          this.lastDisconnectTime = null
        } else {
          // Still in disconnect window
          this.statistics.failedTransmissions++
          this.statistics.disconnectCount++
          return {
            success: false,
            latency: 0,
            dropped: true,
            bandwidthThrottled: false,
            timestamp: new Date(),
          }
        }
      }
    }

    // Check if it's time for a disconnect
    if (this.currentProfile.disconnectInterval > 0 && !this.isInDisconnectWindow) {
      if (!this.lastDisconnectTime) {
        this.lastDisconnectTime = new Date()
      } else {
        const elapsed = (Date.now() - this.lastDisconnectTime.getTime()) / 1000
        if (elapsed >= this.currentProfile.disconnectInterval) {
          this.isInDisconnectWindow = true
          this.lastDisconnectTime = new Date()
          this.statistics.disconnectCount++
        }
      }
    }

    // Simulate packet loss
    if (Math.random() < this.currentProfile.packetLossRate) {
      this.statistics.failedTransmissions++
      return {
        success: false,
        latency: 0,
        dropped: true,
        bandwidthThrottled: false,
        timestamp: new Date(),
      }
    }

    // Calculate latency with jitter
    const jitter = this.generateGaussianJitter()
    const latency = this.currentProfile.baseLatency + jitter
    
    // Ensure latency doesn't exceed max
    const actualLatency = Math.min(latency, this.currentProfile.maxLatency)

    // Simulate bandwidth throttling
    const transmissionTime = (payload.length / this.currentProfile.bandwidth) * 1000
    const bandwidthThrottled = transmissionTime > 100 // If > 100ms, considered throttled

    // Apply simulated latency
    await this.simulateLatency(actualLatency)

    // Update statistics
    this.statistics.successfulTransmissions++
    this.statistics.totalBytesTransferred += payload.length
    this.statistics.totalBandwidthConsumed += payload.length
    
    // Update average latency
    const totalLatency = this.statistics.averageLatency * (this.statistics.successfulTransmissions - 1)
    this.statistics.averageLatency = (totalLatency + actualLatency) / this.statistics.successfulTransmissions
    
    // Update packet loss rate
    this.statistics.packetLossRate = this.statistics.failedTransmissions / this.statistics.totalAttempts

    return {
      success: true,
      latency: actualLatency,
      dropped: false,
      bandwidthThrottled,
      timestamp: new Date(),
    }
  }

  /**
   * Generate Gaussian jitter
   */
  private generateGaussianJitter(): number {
    // Box-Muller transform for Gaussian distribution
    const u1 = Math.random()
    const u2 = Math.random()
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
    
    return z0 * this.currentProfile.jitterVariance
  }

  /**
   * Simulate latency delay
   */
  private async simulateLatency(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get current statistics
   */
  getStatistics(): NetworkStatistics {
    return { ...this.statistics }
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.statistics = {
      totalAttempts: 0,
      successfulTransmissions: 0,
      failedTransmissions: 0,
      averageLatency: 0,
      totalBytesTransferred: 0,
      totalBandwidthConsumed: 0,
      packetLossRate: 0,
      disconnectCount: 0,
    }
    this.lastDisconnectTime = null
    this.isInDisconnectWindow = false
  }

  /**
   * Get current profile
   */
  getCurrentProfile(): NetworkProfile {
    return { ...this.currentProfile }
  }

  /**
   * Check if currently in disconnect window
   */
  isCurrentlyDisconnected(): boolean {
    return this.isInDisconnectWindow
  }
}

// Singleton instance
let networkEmulator: NetworkEmulator | null = null

/**
 * Get or create network emulator instance
 */
export function getNetworkEmulator(profile?: NetworkProfile | string): NetworkEmulator {
  if (!networkEmulator) {
    networkEmulator = new NetworkEmulator(profile || "optimal_fiber")
  } else if (profile) {
    networkEmulator.setProfile(profile)
  }
  return networkEmulator
}

/**
 * Reset network emulator instance
 */
export function resetNetworkEmulator(): void {
  networkEmulator = null
}

export { NetworkEmulator }