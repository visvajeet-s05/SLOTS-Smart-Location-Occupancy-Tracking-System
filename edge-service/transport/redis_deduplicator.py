"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 3: Redis Streams Delta Deduplication Engine  v1.0         ║
║   ┌─────────────────────────────────────────────────────────────────┐     ║
║   │ 1. Sliding-Window Temporal Deduplication                       │     ║
║   │ 2. Delta Encoding (Only Changed Slot States Published)         │     ║
║   │ 3. Redis Streams XADD Integration                              │     ║
║   │ 4. State Cache Management & Stale Purge                        │     ║
║   └─────────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════════╝

Blueprint:
  Edge Slot State Delta Detector
       │
       ▼ (Emits Delta Payload ONLY)
  Redis Streams Deduplicator & Buffer
       │  XADD `slots:telemetry:stream` with sliding window dedupe
       ▼
  Real-Time Transport Cluster
       │  ┌──────────────────────────┬──────────────────────────┐
       │  │ HTTP/3 WebTransport      │ WebSocket (Socket.IO)    │
       │  │ (QUIC Streams)           │ (Fallback Stack)         │
       │  └──────────────────────────┴──────────────────────────┘
       ▼
  Power-Aware Client Hooks
"""

import time
import json
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("RedisDeduplicator")


# ══════════════════════════════════════════════════════════════════════════
#   CONSTANTS
# ══════════════════════════════════════════════════════════════════════════

DEFAULT_HOLD_TIME_SEC = 1.0          # Temporal stability window (1 second)
DEFAULT_STALE_TIMEOUT_SEC = 300.0   # Purge entries older than 5 minutes
DEFAULT_REDIS_STREAM = "slots:telemetry:stream"
DEFAULT_MAX_STREAM_LENGTH = 10000    # Max entries in Redis Stream (trim)


class RedisDeltaDeduplicator:
    """
    Sliding-window temporal deduplicator and delta encoder for SLOTS edge events.

    Prevents redundant MQTT/Redis stream floods by publishing only state
    transitions that persist beyond a configurable temporal hold window.

    Features:
      - Delta encoding: Only changed slot states are published
      - Temporal hold window: Suppresses transient noise toggles
      - State cache: Tracks previous state per slot
      - Redis Streams XADD: Optional integration with Redis Streams
      - Stale purge: Cleans up old entries to prevent memory leaks
      - Statistics: Tracks suppression rate, delta count, etc.

    Usage:
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        delta = dedup.compute_delta("LOT_001", current_slots)
        if delta:
            # Publish delta to Redis/MQTT/WebSocket
            publish(delta)
    """

    def __init__(
        self,
        hold_time_sec: float = DEFAULT_HOLD_TIME_SEC,
        stale_timeout_sec: float = DEFAULT_STALE_TIMEOUT_SEC,
        redis_client: Optional[Any] = None,
        redis_stream: str = DEFAULT_REDIS_STREAM,
        max_stream_length: int = DEFAULT_MAX_STREAM_LENGTH,
    ):
        """
        Initialize the deduplicator.

        Args:
            hold_time_sec: Temporal stability window in seconds.
                           State changes within this window are suppressed.
            stale_timeout_sec: Entries older than this are purged.
            redis_client: Optional Redis client for XADD integration.
            redis_stream: Redis Stream key for publishing deltas.
            max_stream_length: Max entries in Redis Stream (XTRIM).
        """
        self.hold_time_sec = hold_time_sec
        self.stale_timeout_sec = stale_timeout_sec
        self.redis_client = redis_client
        self.redis_stream = redis_stream
        self.max_stream_length = max_stream_length

        # State cache: "lot_id:slot_id" → {"status": str, "updated_at": float}
        self.state_cache: Dict[str, Dict[str, Any]] = {}

        # Last emitted time: "lot_id:slot_id" → float (timestamp)
        self.last_emitted_time: Dict[str, float] = {}

        # Statistics
        self._stats = {
            "total_frames_processed": 0,
            "total_deltas_emitted": 0,
            "total_frames_suppressed": 0,
            "total_slots_tracked": 0,
        }

        logger.info(
            f"RedisDeltaDeduplicator initialized: "
            f"hold_time={hold_time_sec}s, "
            f"stream={redis_stream}, "
            f"redis={'connected' if redis_client else 'disabled'}"
        )

    # ────────────────────────────────────────────────────────────────────────
    #   1. CORE: DELTA COMPUTATION
    # ────────────────────────────────────────────────────────────────────────

    def compute_delta(
        self,
        lot_id: str,
        current_slots: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        """
        Calculate delta transitions between cached state and current detection.

        Returns None if no meaningful changes occurred within the hold window.

        Args:
            lot_id: Parking lot identifier
            current_slots: List of slot state dicts with keys:
                - "slotId": str
                - "status": "AVAILABLE" | "OCCUPIED" | "RESERVED"
                - "overlapRatio" or "confidence": float (optional)

        Returns:
            Delta payload dict or None if no changes:
                {
                    "lotId": str,
                    "timestamp": int (ms),
                    "deltaCount": int,
                    "changes": [
                        {
                            "slotId": str,
                            "previousStatus": str,
                            "currentStatus": str,
                            "confidence": float
                        }
                    ]
                }
        """
        self._stats["total_frames_processed"] += 1
        now = time.time()
        changed_slots: List[Dict[str, Any]] = []

        for slot in current_slots:
            slot_id = slot.get("slotId") or slot.get("slot_id", "unknown")
            current_status = slot.get("status", "UNKNOWN")
            confidence = slot.get("overlapRatio", slot.get("confidence", 1.0))

            cache_key = f"{lot_id}:{slot_id}"
            previous_entry = self.state_cache.get(cache_key)

            if previous_entry is None:
                # Initial state observed — always emit
                self.state_cache[cache_key] = {
                    "status": current_status,
                    "updated_at": now,
                }
                self.last_emitted_time[cache_key] = now
                self._stats["total_slots_tracked"] = len(self.state_cache)

                changed_slots.append({
                    "slotId": slot_id,
                    "previousStatus": "UNKNOWN",
                    "currentStatus": current_status,
                    "confidence": round(confidence, 3),
                })
            else:
                prev_status = previous_entry["status"]
                last_time = self.last_emitted_time.get(cache_key, 0.0)

                # Status change detected
                if current_status != prev_status:
                    # Enforce temporal stability hold window
                    if (now - last_time) >= self.hold_time_sec:
                        self.state_cache[cache_key] = {
                            "status": current_status,
                            "updated_at": now,
                        }
                        self.last_emitted_time[cache_key] = now

                        changed_slots.append({
                            "slotId": slot_id,
                            "previousStatus": prev_status,
                            "currentStatus": current_status,
                            "confidence": round(confidence, 3),
                        })
                    # else: suppress — within hold window

                # Update cache timestamp even if suppressed
                self.state_cache[cache_key]["updated_at"] = now

        if not changed_slots:
            self._stats["total_frames_suppressed"] += 1
            return None

        # Compact Delta Payload
        delta = {
            "lotId": lot_id,
            "timestamp": int(now * 1000),  # milliseconds
            "deltaCount": len(changed_slots),
            "changes": changed_slots,
        }

        self._stats["total_deltas_emitted"] += len(changed_slots)

        # Publish to Redis Stream if client available
        if self.redis_client:
            try:
                self._xadd_to_stream(delta)
            except Exception as e:
                logger.warning(f"Redis XADD failed: {e}")

        return delta

    # ────────────────────────────────────────────────────────────────────────
    #   2. REDIS STREAMS INTEGRATION
    # ────────────────────────────────────────────────────────────────────────

    def _xadd_to_stream(self, delta: Dict[str, Any]) -> Optional[str]:
        """
        Publish delta payload to Redis Stream using XADD.

        Args:
            delta: Delta payload dict

        Returns:
            Redis Stream entry ID or None if failed
        """
        if not self.redis_client:
            return None

        # Serialize delta to JSON
        payload = json.dumps(delta, separators=(",", ":"))

        # XADD with MAXLEN trimming
        entry_id = self.redis_client.xadd(
            self.redis_stream,
            {"data": payload, "lotId": delta["lotId"]},
            maxlen=self.max_stream_length,
            approximate=True,
        )

        logger.debug(f"XADD {self.redis_stream} → {entry_id} ({delta['deltaCount']} changes)")
        return entry_id

    # ────────────────────────────────────────────────────────────────────────
    #   3. STATE CACHE MANAGEMENT
    # ────────────────────────────────────────────────────────────────────────

    def get_state(self, lot_id: str) -> Dict[str, str]:
        """
        Get the current cached state for all slots in a lot.

        Args:
            lot_id: Parking lot identifier

        Returns:
            Dict mapping slot_id → status
        """
        prefix = f"{lot_id}:"
        return {
            key[len(prefix):]: entry["status"]
            for key, entry in self.state_cache.items()
            if key.startswith(prefix)
        }

    def reset(self, lot_id: Optional[str] = None):
        """
        Reset state cache for a specific lot or all lots.

        Args:
            lot_id: If specified, only reset that lot. Otherwise reset all.
        """
        if lot_id:
            prefix = f"{lot_id}:"
            keys_to_remove = [k for k in self.state_cache if k.startswith(prefix)]
            for key in keys_to_remove:
                del self.state_cache[key]
                self.last_emitted_time.pop(key, None)
            logger.info(f"Reset state cache for lot {lot_id} ({len(keys_to_remove)} slots)")
        else:
            count = len(self.state_cache)
            self.state_cache.clear()
            self.last_emitted_time.clear()
            logger.info(f"Reset all state cache ({count} slots)")

    def purge_stale(self) -> int:
        """
        Purge stale entries from the state cache.

        Removes entries that haven't been updated within stale_timeout_sec.

        Returns:
            Number of entries purged
        """
        now = time.time()
        stale_keys = [
            key for key, entry in self.state_cache.items()
            if (now - entry.get("updated_at", 0)) > self.stale_timeout_sec
        ]

        for key in stale_keys:
            del self.state_cache[key]
            self.last_emitted_time.pop(key, None)

        if stale_keys:
            logger.info(f"Purged {len(stale_keys)} stale entries from state cache")

        self._stats["total_slots_tracked"] = len(self.state_cache)
        return len(stale_keys)

    # ────────────────────────────────────────────────────────────────────────
    #   4. STATISTICS
    # ────────────────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """
        Get deduplicator statistics.

        Returns:
            Stats dict with:
                - total_frames_processed
                - total_deltas_emitted
                - total_frames_suppressed
                - suppression_rate (0.0-1.0)
                - total_slots_tracked
                - hold_time_sec
        """
        processed = self._stats["total_frames_processed"]
        suppressed = self._stats["total_frames_suppressed"]
        suppression_rate = suppressed / max(processed, 1)

        return {
            "total_frames_processed": processed,
            "total_deltas_emitted": self._stats["total_deltas_emitted"],
            "total_frames_suppressed": suppressed,
            "suppression_rate": round(suppression_rate, 4),
            "total_slots_tracked": len(self.state_cache),
            "hold_time_sec": self.hold_time_sec,
            "redis_stream": self.redis_stream if self.redis_client else None,
        }

    # ────────────────────────────────────────────────────────────────────────
    #   5. UTILITY: ENCODE/DECODE DELTA
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def encode_delta(delta: Dict[str, Any]) -> str:
        """
        Encode delta payload to compact JSON string.

        Args:
            delta: Delta payload dict

        Returns:
            Compact JSON string
        """
        return json.dumps(delta, separators=(",", ":"))

    @staticmethod
    def decode_delta(payload: str) -> Dict[str, Any]:
        """
        Decode delta payload from JSON string.

        Args:
            payload: JSON string

        Returns:
            Delta payload dict
        """
        return json.loads(payload)

    @staticmethod
    def compute_payload_size(delta: Dict[str, Any]) -> int:
        """
        Compute the byte size of a delta payload.

        Args:
            delta: Delta payload dict

        Returns:
            Size in bytes
        """
        return len(RedisDeltaDeduplicator.encode_delta(delta).encode("utf-8"))