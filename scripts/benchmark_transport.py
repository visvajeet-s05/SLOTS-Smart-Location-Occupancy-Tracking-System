#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 3: Redis Delta Deduplication Benchmark                    ║
║                                                                          ║
║   Validates:                                                             ║
║   - Sliding-window temporal deduplication                                ║
║   - Delta encoding (only changed slot states published)                  ║
║   - Initial state emission                                               ║
║   - Transient noise suppression within hold window                       ║
║   - Persistent change emission after hold window                         ║
║   - Statistics tracking (suppression rate, delta count)                  ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import os
import sys
import time
import json
import argparse
from typing import Dict, Any, List

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from edge_service.transport.redis_deduplicator import RedisDeltaDeduplicator
    IMPORT_OK = True
except ImportError as e:
    print(f"[ERROR] Failed to import RedisDeltaDeduplicator: {e}")
    print("[ERROR] Ensure edge_service/ package is in your Python path")
    IMPORT_OK = False


# ══════════════════════════════════════════════════════════════════════════
#   BENCHMARK SUITE
# ══════════════════════════════════════════════════════════════════════════

class TransportBenchmarkSuite:
    """Comprehensive benchmark suite for Redis Delta Deduplication."""

    def __init__(self):
        self.results: Dict[str, Any] = {}
        self.passed = 0
        self.total = 0

    def _check(self, name: str, condition: bool, detail: str = ""):
        """Record a pass/fail check."""
        self.total += 1
        status = "PASS" if condition else "FAIL"
        if condition:
            self.passed += 1
        print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
        return condition

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 1: Initial State Emission
    # ────────────────────────────────────────────────────────────────────────

    def test_initial_state(self) -> Dict[str, Any]:
        """Test that initial state is always emitted."""
        print("\n  -- Test 1: Initial State Emission --")

        results = {}
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        lot_id = "LOT_CHENNAI_CENTRAL"

        # Frame 1: Initial state (10 slots AVAILABLE)
        frame1 = [{"slotId": f"S_{i}", "status": "AVAILABLE", "overlapRatio": 0.0} for i in range(10)]
        delta1 = dedup.compute_delta(lot_id, frame1)

        initial_emitted = delta1 is not None
        count1 = delta1["deltaCount"] if delta1 else 0
        self._check("Initial state emitted (10 slots)", initial_emitted, f"deltaCount={count1}")
        results["initial_emitted"] = initial_emitted
        results["initial_count"] = count1

        # All slots should have previousStatus = "UNKNOWN"
        if delta1:
            all_unknown = all(c["previousStatus"] == "UNKNOWN" for c in delta1["changes"])
            self._check("All slots have previousStatus=UNKNOWN", all_unknown)
            results["all_unknown"] = all_unknown

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 2: Identical Frame Suppression
    # ────────────────────────────────────────────────────────────────────────

    def test_identical_suppression(self) -> Dict[str, Any]:
        """Test that identical frames are completely suppressed."""
        print("\n  -- Test 2: Identical Frame Suppression --")

        results = {}
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        lot_id = "LOT_CHENNAI_CENTRAL"

        # Frame 1: Initial state
        frame1 = [{"slotId": f"S_{i}", "status": "AVAILABLE", "overlapRatio": 0.0} for i in range(10)]
        dedup.compute_delta(lot_id, frame1)

        # Frame 2: Identical state immediately after -> Should be suppressed
        delta2 = dedup.compute_delta(lot_id, frame1)
        suppressed = delta2 is None
        self._check("Identical frame suppressed (None returned)", suppressed)
        results["identical_suppressed"] = suppressed

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 3: Transient Noise Suppression
    # ────────────────────────────────────────────────────────────────────────

    def test_transient_noise_suppression(self) -> Dict[str, Any]:
        """Test that transient toggles within hold window are suppressed."""
        print("\n  -- Test 3: Transient Noise Suppression --")

        results = {}
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        lot_id = "LOT_CHENNAI_CENTRAL"

        # Frame 1: Initial state (all AVAILABLE)
        frame1 = [{"slotId": f"S_{i}", "status": "AVAILABLE", "overlapRatio": 0.0} for i in range(10)]
        dedup.compute_delta(lot_id, frame1)

        # Frame 2: Transient toggle on Slot 0 within hold window (<0.5s)
        frame2 = [{"slotId": f"S_{i}", "status": "OCCUPIED" if i == 0 else "AVAILABLE", "overlapRatio": 0.8} for i in range(10)]
        delta2 = dedup.compute_delta(lot_id, frame2)
        suppressed_within_window = delta2 is None
        self._check("Transient noise <0.5s suppressed", suppressed_within_window)
        results["transient_suppressed"] = suppressed_within_window

        # Sleep to exceed hold window
        time.sleep(0.55)

        # Frame 3: Same state as Frame 2 (persistent change) -> Should emit
        delta3 = dedup.compute_delta(lot_id, frame2)
        persistent_emitted = delta3 is not None and delta3["deltaCount"] == 1
        self._check("Persistent change >0.5s emitted", persistent_emitted, f"deltaCount={delta3['deltaCount'] if delta3 else 0}")
        results["persistent_emitted"] = persistent_emitted

        if delta3:
            results["persistent_change"] = delta3["changes"][0]

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 4: Multi-Slot Delta Encoding
    # ────────────────────────────────────────────────────────────────────────

    def test_multi_slot_delta(self) -> Dict[str, Any]:
        """Test delta encoding with multiple slot changes."""
        print("\n  -- Test 4: Multi-Slot Delta Encoding --")

        results = {}
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        lot_id = "LOT_CHENNAI_CENTRAL"

        # Frame 1: Initial state
        frame1 = [{"slotId": f"S_{i}", "status": "AVAILABLE", "overlapRatio": 0.0} for i in range(10)]
        dedup.compute_delta(lot_id, frame1)

        # Sleep past hold window
        time.sleep(0.6)

        # Frame 2: Multiple slots changed
        frame2 = [
            {"slotId": f"S_{i}", "status": "OCCUPIED" if i in [0, 2, 4, 6, 8] else "AVAILABLE", "overlapRatio": 0.8}
            for i in range(10)
        ]
        delta2 = dedup.compute_delta(lot_id, frame2)

        multi_emitted = delta2 is not None and delta2["deltaCount"] == 5
        self._check("Multi-slot delta (5 changes) emitted", multi_emitted, f"deltaCount={delta2['deltaCount'] if delta2 else 0}")
        results["multi_emitted"] = multi_emitted
        results["delta_count"] = delta2["deltaCount"] if delta2 else 0

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 5: State Cache Management
    # ────────────────────────────────────────────────────────────────────────

    def test_state_cache(self) -> Dict[str, Any]:
        """Test state cache get/reset functionality."""
        print("\n  -- Test 5: State Cache Management --")

        results = {}
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        lot_id = "LOT_CHENNAI_CENTRAL"

        # Populate cache
        frame1 = [{"slotId": f"S_{i}", "status": "OCCUPIED" if i % 2 == 0 else "AVAILABLE", "overlapRatio": 0.8} for i in range(10)]
        dedup.compute_delta(lot_id, frame1)

        # Get state
        state = dedup.get_state(lot_id)
        state_correct = len(state) == 10 and all(s in ("OCCUPIED", "AVAILABLE") for s in state.values())
        self._check("State cache returns all 10 slots", state_correct, f"slots={len(state)}")
        results["state_populated"] = state_correct

        # Reset specific lot
        dedup.reset(lot_id)
        state_after_reset = dedup.get_state(lot_id)
        reset_ok = len(state_after_reset) == 0
        self._check("Reset clears lot state", reset_ok, f"slots after reset={len(state_after_reset)}")
        results["reset_works"] = reset_ok

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 6: Statistics Tracking
    # ────────────────────────────────────────────────────────────────────────

    def test_statistics(self) -> Dict[str, Any]:
        """Test statistics tracking."""
        print("\n  -- Test 6: Statistics Tracking --")

        results = {}
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        lot_id = "LOT_CHENNAI_CENTRAL"

        # Frame 1: Initial
        frame1 = [{"slotId": f"S_{i}", "status": "AVAILABLE", "overlapRatio": 0.0} for i in range(10)]
        dedup.compute_delta(lot_id, frame1)

        # Frame 2: Identical (suppressed)
        dedup.compute_delta(lot_id, frame1)

        # Frame 3: Change
        time.sleep(0.6)
        frame2 = [{"slotId": f"S_{i}", "status": "OCCUPIED" if i == 0 else "AVAILABLE", "overlapRatio": 0.8} for i in range(10)]
        dedup.compute_delta(lot_id, frame2)

        stats = dedup.get_stats()
        stats_ok = (
            stats["total_frames_processed"] == 3 and
            stats["total_frames_suppressed"] == 1 and
            stats["total_slots_tracked"] == 10
        )
        self._check("Statistics tracked correctly", stats_ok,
                    f"processed={stats['total_frames_processed']}, suppressed={stats['total_frames_suppressed']}")
        results["stats_correct"] = stats_ok
        results["suppression_rate"] = stats["suppression_rate"]

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 7: Delta Payload Size
    # ────────────────────────────────────────────────────────────────────────

    def test_payload_size(self) -> Dict[str, Any]:
        """Test delta payload compactness."""
        print("\n  -- Test 7: Delta Payload Size --")

        results = {}
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        lot_id = "LOT_CHENNAI_CENTRAL"

        # Frame 1: Initial
        frame1 = [{"slotId": f"S_{i}", "status": "AVAILABLE", "overlapRatio": 0.0} for i in range(10)]
        delta1 = dedup.compute_delta(lot_id, frame1)

        # Frame 2: Single change
        time.sleep(0.6)
        frame2 = [{"slotId": f"S_{i}", "status": "OCCUPIED" if i == 0 else "AVAILABLE", "overlapRatio": 0.8} for i in range(10)]
        delta2 = dedup.compute_delta(lot_id, frame2)

        if delta1 and delta2:
            size1 = RedisDeltaDeduplicator.compute_payload_size(delta1)
            size2 = RedisDeltaDeduplicator.compute_payload_size(delta2)
            # Initial delta should be larger (10 slots), subsequent deltas should be compact
            compact_ok = size2 < size1 / 2
            self._check("Subsequent delta < 50% of initial size", compact_ok,
                        f"initial={size1}B, delta={size2}B")
            results["compact"] = compact_ok
            results["initial_size"] = size1
            results["delta_size"] = size2
        else:
            self._check("Payload size test", False, "delta was None")

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 8: Performance Benchmark
    # ────────────────────────────────────────────────────────────────────────

    def test_performance(self) -> Dict[str, Any]:
        """Benchmark deduplication performance."""
        print("\n  -- Test 8: Performance Benchmark --")

        results = {}
        dedup = RedisDeltaDeduplicator(hold_time_sec=0.5)
        lot_id = "LOT_CHENNAI_CENTRAL"

        # Generate 100 slots
        slots = [{"slotId": f"S_{i}", "status": "AVAILABLE", "overlapRatio": 0.0} for i in range(100)]

        # Initial state
        dedup.compute_delta(lot_id, slots)

        # Time 100 frames with mostly identical state (should be suppressed)
        times = []
        for _ in range(100):
            t0 = time.perf_counter()
            delta = dedup.compute_delta(lot_id, slots)
            t1 = time.perf_counter()
            times.append((t1 - t0) * 1000)

        avg_ms = sum(times) / len(times)
        p99_ms = sorted(times)[int(len(times) * 0.99)]

        perf_ok = avg_ms < 1.0
        self._check(f"Performance: < 1ms avg (100 slots)", perf_ok, f"avg={avg_ms:.3f}ms, p99={p99_ms:.3f}ms")

        results["avg_latency_ms"] = round(avg_ms, 4)
        results["p99_latency_ms"] = round(p99_ms, 4)
        results["pass"] = perf_ok

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   RUN ALL TESTS
    # ────────────────────────────────────────────────────────────────────────

    def run_all(self) -> Dict[str, Any]:
        """Run all transport benchmark tests."""
        print("=" * 70)
        print("  SLOTS Module 3: Redis Delta Deduplication Benchmark")
        print("=" * 70)

        if not IMPORT_OK:
            print("\n[FAIL] Import error — skipping benchmarks")
            return {"status": "failed", "error": "ImportError"}

        all_results = {}

        all_results["initial_state"] = self.test_initial_state()
        all_results["identical_suppression"] = self.test_identical_suppression()
        all_results["transient_noise"] = self.test_transient_noise_suppression()
        all_results["multi_slot_delta"] = self.test_multi_slot_delta()
        all_results["state_cache"] = self.test_state_cache()
        all_results["statistics"] = self.test_statistics()
        all_results["payload_size"] = self.test_payload_size()
        all_results["performance"] = self.test_performance()

        all_results["summary"] = {
            "passed": self.passed,
            "total": self.total,
            "pass_rate": f"{self.passed}/{self.total}",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "overall": "PASS" if self.passed == self.total else "PARTIAL",
        }

        print("-" * 70)
        print(f"  Results: {self.passed}/{self.total} checks passed")
        print(f"  Overall: {'PASS' if self.passed == self.total else 'PARTIAL'}")
        print("=" * 70)

        return all_results


# ══════════════════════════════════════════════════════════════════════════
#   MAIN ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="SLOTS Module 3: Redis Delta Deduplication Benchmark"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output JSON file for benchmark results"
    )
    args = parser.parse_args()

    suite = TransportBenchmarkSuite()
    results = suite.run_all()

    if args.output:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to: {args.output}")

    summary = results.get("summary", {})
    if summary.get("passed", 0) == summary.get("total", 1):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()