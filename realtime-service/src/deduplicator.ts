/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   SLOTS Module 3: Stream Deduplicator (TypeScript)                       ║
 * ║                                                                          ║
 * ║   Sliding-window temporal deduplication and delta encoding for           ║
 * ║   real-time slot state updates over WebTransport/WebSocket.              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ──────────────────────────────────────────────────────────────────────────
//   TYPES
// ──────────────────────────────────────────────────────────────────────────

export type SlotStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'VIOLATION' | 'EV_CHARGING';

export interface SlotState {
  slotId: string;
  status: SlotStatus;
  confidence?: number;
  overlapRatio?: number;
}

export interface DeltaChange {
  slotId: string;
  previousStatus: string;
  currentStatus: string;
  confidence: number;
}

export interface LotDeltaPayload {
  lotId: string;
  timestamp: number;
  deltaCount: number;
  changes: DeltaChange[];
}

export interface DeduplicatorStats {
  totalFramesProcessed: number;
  totalDeltasEmitted: number;
  totalFramesSuppressed: number;
  suppressionRate: number;
  totalSlotsTracked: number;
  holdWindowMs: number;
}

interface CacheEntry {
  status: string;
  updatedAt: number;
  lastEmitted: number;
}

// ──────────────────────────────────────────────────────────────────────────
//   CONSTANTS
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_HOLD_WINDOW_MS = 1000;       // 1 second temporal stability
const DEFAULT_STALE_TIMEOUT_MS = 300_000;  // 5 minutes

// ──────────────────────────────────────────────────────────────────────────
//   STREAM DEDUPLICATOR
// ──────────────────────────────────────────────────────────────────────────

/**
 * Sliding-window temporal deduplicator and delta encoder for SLOTS edge events.
 *
 * Prevents redundant WebSocket/WebTransport floods by publishing only state
 * transitions that persist beyond a configurable temporal hold window.
 *
 * @example
 * const dedup = new StreamDeduplicator(1000); // 1s hold window
 * const delta = dedup.processLotUpdate('LOT_001', currentSlots);
 * if (delta) {
 *   io.to(`lot:LOT_001`).emit('slot:delta', delta);
 * }
 */
export class StreamDeduplicator {
  private stateStore: Map<string, CacheEntry> = new Map();
  private holdWindowMs: number;
  private staleTimeoutMs: number;

  // Statistics
  private stats = {
    totalFramesProcessed: 0,
    totalDeltasEmitted: 0,
    totalFramesSuppressed: 0,
  };

  constructor(holdWindowMs: number = DEFAULT_HOLD_WINDOW_MS, staleTimeoutMs: number = DEFAULT_STALE_TIMEOUT_MS) {
    this.holdWindowMs = holdWindowMs;
    this.staleTimeoutMs = staleTimeoutMs;
  }

  /**
   * Process a lot update and compute the delta payload.
   *
   * Returns null if no meaningful changes occurred within the hold window.
   *
   * @param lotId - Parking lot identifier
   * @param slots - Array of current slot states
   * @returns Delta payload or null if suppressed
   */
  public processLotUpdate(lotId: string, slots: SlotState[]): LotDeltaPayload | null {
    this.stats.totalFramesProcessed++;
    const now = Date.now();
    const changes: DeltaChange[] = [];

    for (const slot of slots) {
      const key = `${lotId}:${slot.slotId}`;
      const existing = this.stateStore.get(key);
      const confidence = slot.confidence ?? slot.overlapRatio ?? 1.0;

      if (!existing) {
        // Initial state observed — always emit
        this.stateStore.set(key, {
          status: slot.status,
          updatedAt: now,
          lastEmitted: now,
        });
        changes.push({
          slotId: slot.slotId,
          previousStatus: 'UNKNOWN',
          currentStatus: slot.status,
          confidence: Math.round(confidence * 1000) / 1000,
        });
      } else if (existing.status !== slot.status) {
        // Status change detected — check hold window
        if (now - existing.lastEmitted >= this.holdWindowMs) {
          changes.push({
            slotId: slot.slotId,
            previousStatus: existing.status,
            currentStatus: slot.status,
            confidence: Math.round(confidence * 1000) / 1000,
          });
          this.stateStore.set(key, {
            status: slot.status,
            updatedAt: now,
            lastEmitted: now,
          });
        }
        // else: suppress — within hold window
      }

      // Update cache timestamp even if suppressed
      if (existing) {
        existing.updatedAt = now;
      }
    }

    if (changes.length === 0) {
      this.stats.totalFramesSuppressed++;
      return null;
    }

    this.stats.totalDeltasEmitted += changes.length;

    return {
      lotId,
      timestamp: now,
      deltaCount: changes.length,
      changes,
    };
  }

  /**
   * Get the current cached state for all slots in a lot.
   */
  public getState(lotId: string): Record<string, string> {
    const prefix = `${lotId}:`;
    const result: Record<string, string> = {};
    for (const [key, entry] of this.stateStore.entries()) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = entry.status;
      }
    }
    return result;
  }

  /**
   * Reset state cache for a specific lot or all lots.
   */
  public reset(lotId?: string): void {
    if (lotId) {
      const prefix = `${lotId}:`;
      for (const key of [...this.stateStore.keys()]) {
        if (key.startsWith(prefix)) {
          this.stateStore.delete(key);
        }
      }
    } else {
      this.stateStore.clear();
    }
  }

  /**
   * Purge stale entries from the state cache.
   *
   * @returns Number of entries purged
   */
  public purgeStale(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of [...this.stateStore.entries()]) {
      if (now - entry.updatedAt > this.staleTimeoutMs) {
        this.stateStore.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Get deduplicator statistics.
   */
  public getStats(): DeduplicatorStats {
    const processed = this.stats.totalFramesProcessed;
    const suppressed = this.stats.totalFramesSuppressed;
    return {
      totalFramesProcessed: processed,
      totalDeltasEmitted: this.stats.totalDeltasEmitted,
      totalFramesSuppressed: suppressed,
      suppressionRate: Math.round((suppressed / Math.max(processed, 1)) * 10000) / 10000,
      totalSlotsTracked: this.stateStore.size,
      holdWindowMs: this.holdWindowMs,
    };
  }

  /**
   * Encode a delta payload to compact JSON string.
   */
  static encodeDelta(delta: LotDeltaPayload): string {
    return JSON.stringify(delta);
  }

  /**
   * Compute the byte size of a delta payload.
   */
  static computePayloadSize(delta: LotDeltaPayload): number {
    return Buffer.byteLength(StreamDeduplicator.encodeDelta(delta), 'utf-8');
  }
}