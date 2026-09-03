#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 2: OBB & Overhang Benchmark                              ║
║                                                                          ║
║   Validates:                                                             ║
║   - OBB corner construction correctness                                   ║
║   - Homography ground-plane projection                                   ║
║   - Oriented polygon intersection accuracy                               ║
║   - Overhang mitigation (≥ 35% floor contact threshold)                  ║
║   - False neighbor-slot occupancy suppression                            ║
║   - Heading angle estimation                                             ║
║   - Performance (< 5ms per slot evaluation)                              ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import os
import sys
import time
import json
import math
import argparse
import numpy as np
import cv2
from typing import Dict, Any, List, Tuple

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from edge_service.vision.obb_3d_projector import OBB3DProjector
    IMPORT_OK = True
except ImportError as e:
    print(f"[ERROR] Failed to import OBB3DProjector: {e}")
    print("[ERROR] Ensure edge_service/ package is in your Python path")
    IMPORT_OK = False


# ══════════════════════════════════════════════════════════════════════════
#   BENCHMARK SUITE
# ══════════════════════════════════════════════════════════════════════════

class OBBBenchmarkSuite:
    """Comprehensive benchmark suite for OBB & 3D projection engine."""

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
    #   TEST 1: OBB Corner Construction
    # ────────────────────────────────────────────────────────────────────────

    def test_obb_corners(self) -> Dict[str, Any]:
        """Test OBB corner construction with known rotation angles."""
        print("\n  -- Test 1: OBB Corner Construction --")

        results = {}

        # Test 1a: Axis-aligned box (angle=0)
        corners = OBB3DProjector.get_obb_corners(100, 100, 80, 180, 0.0)
        expected = np.array([
            [60, 10],   # top-left
            [140, 10],  # top-right
            [140, 190], # bottom-right
            [60, 190],  # bottom-left
        ], dtype=np.float32)

        corner_match = np.allclose(corners, expected, atol=1.0)
        self._check("Axis-aligned corners (θ=0)", corner_match,
                    f"got {corners[0].tolist()}, expected {expected[0].tolist()}")
        results["axis_aligned"] = corner_match

        # Test 1b: 45-degree rotation
        angle_45 = math.radians(45)
        corners_45 = OBB3DProjector.get_obb_corners(100, 100, 80, 180, angle_45)

        # All corners should be equidistant from center
        distances = np.sqrt(np.sum((corners_45 - np.array([100, 100])) ** 2, axis=1))
        # For a rectangle, opposite corners have same distance, but adjacent differ
        # Check that opposite corners are equidistant
        opp_equal = np.isclose(distances[0], distances[2], atol=1.0) and \
                    np.isclose(distances[1], distances[3], atol=1.0)
        self._check("45° rotation: opposite corners equidistant", opp_equal,
                    f"distances={distances.tolist()}")
        results["rotation_45"] = opp_equal

        # Test 1c: Corner count
        corner_count = len(corners) == 4
        self._check("Returns 4 corners", corner_count)
        results["corner_count"] = corner_count

        # Test 1d: Center point preserved
        center = np.mean(corners, axis=0)
        center_match = np.allclose(center, [100, 100], atol=0.5)
        self._check("Center point preserved", center_match,
                    f"center={center.tolist()}")
        results["center_preserved"] = center_match

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 2: Homography Projection
    # ────────────────────────────────────────────────────────────────────────

    def test_homography_projection(self) -> Dict[str, Any]:
        """Test pixel-to-ground-plane projection."""
        print("\n  -- Test 2: Homography Ground-Plane Projection --")

        results = {}

        # Test 2a: Identity homography (pixel = ground)
        projector = OBB3DProjector(homography_matrix=None)
        pts = np.array([[100, 200], [300, 400]], dtype=np.float64)
        ground = projector.project_pixels_to_ground(pts)
        identity_match = np.allclose(ground, pts, atol=0.01)
        self._check("Identity homography: pixel=ground", identity_match,
                    f"got {ground.tolist()}")
        results["identity"] = identity_match

        # Test 2b: Scale homography (1 pixel = 0.01 meters)
        H_scale = np.array([
            [0.01, 0, 0],
            [0, 0.01, 0],
            [0, 0, 1]
        ], dtype=np.float64)
        projector_scale = OBB3DProjector(homography_matrix=H_scale)
        pts2 = np.array([[100, 200], [300, 400]], dtype=np.float64)
        ground2 = projector_scale.project_pixels_to_ground(pts2)
        expected2 = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float64)
        scale_match = np.allclose(ground2, expected2, atol=0.01)
        self._check("Scale homography: 100px → 1m", scale_match,
                    f"got {ground2.tolist()}")
        results["scale"] = scale_match

        # Test 2c: Inverse projection (ground → pixel)
        pixel_back = projector_scale.project_ground_to_pixels(ground2)
        inverse_match = np.allclose(pixel_back, pts2, atol=0.01)
        self._check("Inverse projection: ground→pixel", inverse_match,
                    f"got {pixel_back.tolist()}")
        results["inverse"] = inverse_match

        # Test 2d: OBB to ground projection
        ground_obb = projector_scale.project_obb_to_ground(100, 200, 80, 180, 0.0)
        obb_ground_match = len(ground_obb) == 4
        self._check("OBB→ground projection returns 4 corners", obb_ground_match)
        results["obb_to_ground"] = obb_ground_match

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 3: Overhang Mitigation (Core Module 2 Test)
    # ────────────────────────────────────────────────────────────────────────

    def test_overhang_mitigation(self) -> Dict[str, Any]:
        """Test that overhanging vehicles don't trigger false occupancy."""
        print("\n  -- Test 3: Overhang Mitigation (Core Module 2) --")

        results = {}
        projector = OBB3DProjector()

        # Slot polygon (100×200 box)
        slot_poly = {
            "id": "SLOT_A1",
            "coordinates": [[100, 100], [200, 100], [200, 300], [100, 300]]
        }

        # Test 3a: Straight vehicle parked inside (should be OCCUPIED)
        obb_inside = [{"obb": [150, 200, 80, 180, 0.0], "confidence": 0.90}]
        res1 = projector.evaluate_slot_occupancy_obb(obb_inside, [slot_poly])
        occupied_inside = res1[0]["status"] == "OCCUPIED"
        overlap1 = res1[0]["groundOverlapRatio"]
        self._check("Straight vehicle inside slot → OCCUPIED", occupied_inside,
                    f"overlap={overlap1}")
        results["inside_occupied"] = occupied_inside
        results["inside_overlap"] = overlap1

        # Test 3b: Overhanging truck bumper (only ~10% inside, 45° angle)
        # Vehicle center is at (95, 200) — mostly outside the slot
        obb_overhang = [{"obb": [95, 200, 80, 180, math.radians(45)], "confidence": 0.88}]
        res2 = projector.evaluate_slot_occupancy_obb(obb_overhang, [slot_poly])
        available_overhang = res2[0]["status"] == "AVAILABLE"
        overlap2 = res2[0]["groundOverlapRatio"]
        self._check("Overhanging bumper → AVAILABLE (no false trigger)", available_overhang,
                    f"overlap={overlap2}")
        results["overhang_available"] = available_overhang
        results["overhang_overlap"] = overlap2

        # Test 3c: Vehicle fully outside slot (no overlap)
        obb_outside = [{"obb": [500, 500, 80, 180, 0.0], "confidence": 0.85}]
        res3 = projector.evaluate_slot_occupancy_obb(obb_outside, [slot_poly])
        available_outside = res3[0]["status"] == "AVAILABLE"
        self._check("Vehicle fully outside → AVAILABLE", available_outside,
                    f"overlap={res3[0]['groundOverlapRatio']}")
        results["outside_available"] = available_outside

        # Test 3d: Diagonally parked vehicle mostly inside (should be OCCUPIED)
        # Center at (150, 200), 30° angle, smaller box
        obb_diagonal = [{"obb": [150, 200, 70, 160, math.radians(30)], "confidence": 0.82}]
        res4 = projector.evaluate_slot_occupancy_obb(obb_diagonal, [slot_poly])
        occupied_diagonal = res4[0]["status"] == "OCCUPIED"
        overlap4 = res4[0]["groundOverlapRatio"]
        self._check("Diagonal vehicle mostly inside → OCCUPIED", occupied_diagonal,
                    f"overlap={overlap4}, angle={res4[0]['headingAngleDeg']}°")
        results["diagonal_occupied"] = occupied_diagonal
        results["diagonal_overlap"] = overlap4

        # Test 3e: Large truck with slight overhang (mostly inside, should be OCCUPIED)
        # Center at (160, 200), large box, 0° angle
        obb_large = [{"obb": [160, 200, 90, 200, 0.0], "confidence": 0.91}]
        res5 = projector.evaluate_slot_occupancy_obb(obb_large, [slot_poly])
        occupied_large = res5[0]["status"] == "OCCUPIED"
        overlap5 = res5[0]["groundOverlapRatio"]
        overhang5 = res5[0]["overhangRatio"]
        self._check("Large truck mostly inside → OCCUPIED", occupied_large,
                    f"overlap={overlap5}, overhang={overhang5}")
        results["large_truck_occupied"] = occupied_large
        results["large_truck_overlap"] = overlap5

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 4: Multi-Slot Neighbor Overhang Suppression
    # ────────────────────────────────────────────────────────────────────────

    def test_neighbor_overhang(self) -> Dict[str, Any]:
        """Test that a vehicle in one slot doesn't trigger adjacent slot occupancy."""
        print("\n  -- Test 4: Neighbor Overhang Suppression --")

        results = {}
        projector = OBB3DProjector()

        # Two adjacent slots
        slots = [
            {
                "id": "SLOT_A",
                "coordinates": [[100, 100], [200, 100], [200, 300], [100, 300]]
            },
            {
                "id": "SLOT_B",
                "coordinates": [[200, 100], [300, 100], [300, 300], [200, 300]]
            },
        ]

        # Vehicle centered in SLOT_A with slight overhang into SLOT_B
        # Center at (170, 200), width=100 (extends 50px into SLOT_B)
        obb_vehicle = [{"obb": [170, 200, 100, 180, 0.0], "confidence": 0.90}]
        res = projector.evaluate_slot_occupancy_obb(obb_vehicle, slots)

        slot_a = next(r for r in res if r["slotId"] == "SLOT_A")
        slot_b = next(r for r in res if r["slotId"] == "SLOT_B")

        # SLOT_A should be occupied (vehicle is mostly here)
        a_occupied = slot_a["status"] == "OCCUPIED"
        self._check("SLOT_A (primary) → OCCUPIED", a_occupied,
                    f"overlap={slot_a['groundOverlapRatio']}")

        # SLOT_B should be available (only slight overhang)
        b_available = slot_b["status"] == "AVAILABLE"
        self._check("SLOT_B (neighbor overhang) → AVAILABLE", b_available,
                    f"overlap={slot_b['groundOverlapRatio']}")

        results["primary_occupied"] = a_occupied
        results["neighbor_available"] = b_available
        results["slot_a_overlap"] = slot_a["groundOverlapRatio"]
        results["slot_b_overlap"] = slot_b["groundOverlapRatio"]

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 5: Heading Angle Estimation
    # ────────────────────────────────────────────────────────────────────────

    def test_heading_angle(self) -> Dict[str, Any]:
        """Test vehicle heading angle estimation."""
        print("\n  -- Test 5: Heading Angle Estimation --")

        results = {}

        # Test 5a: Aligned vehicle (0° relative to slot)
        heading = OBB3DProjector.estimate_heading_angle(0.0, 0.0)
        aligned = abs(heading) < 1.0
        self._check("Aligned vehicle: 0° heading", aligned, f"heading={heading}°")
        results["aligned"] = aligned

        # Test 5b: 45° angle
        heading_45 = OBB3DProjector.estimate_heading_angle(math.radians(45), 0.0)
        angle_45_ok = abs(heading_45 - 45.0) < 1.0
        self._check("45° vehicle heading", angle_45_ok, f"heading={heading_45}°")
        results["angle_45"] = angle_45_ok

        # Test 5c: Is parked aligned check
        is_aligned = OBB3DProjector.is_parked_aligned(math.radians(10), 0.0, 15.0)
        self._check("10° deviation is aligned (≤15° threshold)", is_aligned)
        results["is_aligned_10"] = is_aligned

        is_not_aligned = not OBB3DProjector.is_parked_aligned(math.radians(30), 0.0, 15.0)
        self._check("30° deviation is NOT aligned (>15° threshold)", is_not_aligned)
        results["is_not_aligned_30"] = is_not_aligned

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 6: Polygon Intersection Accuracy
    # ────────────────────────────────────────────────────────────────────────

    def test_polygon_intersection(self) -> Dict[str, Any]:
        """Test oriented polygon intersection area computation."""
        print("\n  -- Test 6: Polygon Intersection Accuracy --")

        results = {}
        projector = OBB3DProjector()

        # Test 6a: Identical polygons → area ≈ polygon area
        # Note: Mask-based approach counts pixels including boundaries,
        # so a 100×100 polygon yields 101×101=10201 pixels (expected).
        poly = np.array([[0, 0], [100, 0], [100, 100], [0, 100]], dtype=np.float32)
        inter = projector.compute_oriented_intersection_area(poly, poly)
        poly_area = OBB3DProjector.polygon_area(poly)
        # Allow up to 5% margin for pixel boundary inclusion
        identical_ok = abs(inter - poly_area) / max(poly_area, 1.0) < 0.05
        self._check("Identical polygons: full intersection (±5% mask margin)", identical_ok,
                    f"inter={inter:.1f}, area={poly_area:.1f}")
        results["identical"] = identical_ok

        # Test 6b: Non-overlapping polygons → 0
        poly1 = np.array([[0, 0], [100, 0], [100, 100], [0, 100]], dtype=np.float32)
        poly2 = np.array([[200, 200], [300, 200], [300, 300], [200, 300]], dtype=np.float32)
        inter2 = projector.compute_oriented_intersection_area(poly1, poly2)
        no_overlap = inter2 < 1.0
        self._check("Non-overlapping polygons: 0 intersection", no_overlap,
                    f"inter={inter2:.1f}")
        results["no_overlap"] = no_overlap

        # Test 6c: Half overlap
        # Expected: 50×100 = 5000, but mask includes boundary pixels (51×101=5151)
        poly3 = np.array([[0, 0], [100, 0], [100, 100], [0, 100]], dtype=np.float32)
        poly4 = np.array([[50, 0], [150, 0], [150, 100], [50, 100]], dtype=np.float32)
        inter3 = projector.compute_oriented_intersection_area(poly3, poly4)
        # Allow up to 10% margin for pixel boundary inclusion
        half_ok = abs(inter3 - 5000) / 5000 < 0.10
        self._check("Half overlap: ~5000px² intersection (±10% mask margin)", half_ok,
                    f"inter={inter3:.1f}")
        results["half_overlap"] = half_ok

        # Test 6d: Rotated rectangle intersection
        corners1 = OBB3DProjector.get_obb_corners(100, 100, 80, 80, 0.0)
        corners2 = OBB3DProjector.get_obb_corners(100, 100, 80, 80, math.radians(45))
        inter4 = projector.compute_oriented_intersection_area(corners1, corners2)
        rotated_ok = inter4 > 0
        self._check("Rotated rectangle intersection > 0", rotated_ok,
                    f"inter={inter4:.1f}")
        results["rotated_intersection"] = rotated_ok

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 7: Performance Benchmark
    # ────────────────────────────────────────────────────────────────────────

    def test_performance(self) -> Dict[str, Any]:
        """Benchmark OBB evaluation performance."""
        print("\n  -- Test 7: Performance Benchmark --")

        results = {}
        projector = OBB3DProjector()

        # Generate 12 slots and 8 vehicles
        slots = []
        for i in range(12):
            row = i // 4
            col = i % 4
            x = 100 + col * 150
            y = 100 + row * 250
            slots.append({
                "id": f"slot-{i+1}",
                "coordinates": [[x, y], [x+100, y], [x+100, y+200], [x, y+200]]
            })

        vehicles = []
        for i in range(8):
            row = i // 4
            col = i % 4
            cx = 150 + col * 150
            cy = 200 + row * 250
            angle = math.radians(np.random.uniform(-30, 30))
            vehicles.append({
                "obb": [cx, cy, 80, 180, angle],
                "confidence": 0.85
            })

        # Warmup
        _ = projector.evaluate_slot_occupancy_obb(vehicles, slots)

        # Timed runs
        times = []
        for _ in range(100):
            t0 = time.perf_counter()
            _ = projector.evaluate_slot_occupancy_obb(vehicles, slots)
            t1 = time.perf_counter()
            times.append((t1 - t0) * 1000)

        avg_ms = np.mean(times)
        p99_ms = np.percentile(times, 99)

        # 12 slots × 8 vehicles = 96 polygon intersection operations
        # Target: < 10ms total (sub-0.1ms per polygon pair)
        perf_ok = avg_ms < 10.0
        self._check(f"Performance: < 10ms avg ({len(slots)} slots, {len(vehicles)} vehicles)",
                    perf_ok, f"avg={avg_ms:.2f}ms, p99={p99_ms:.2f}ms")

        results["avg_latency_ms"] = round(avg_ms, 3)
        results["p99_latency_ms"] = round(p99_ms, 3)
        results["slots"] = len(slots)
        results["vehicles"] = len(vehicles)
        results["pass"] = perf_ok

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   TEST 8: OBB Drawing Utility
    # ────────────────────────────────────────────────────────────────────────

    def test_draw_obb(self) -> Dict[str, Any]:
        """Test OBB drawing on a frame."""
        print("\n  -- Test 8: OBB Drawing Utility --")

        results = {}

        frame = np.zeros((400, 400, 3), dtype=np.uint8)
        annotated = OBB3DProjector.draw_obb(
            frame, 200, 200, 100, 150, math.radians(30),
            color=(0, 255, 0), thickness=2, label="car"
        )

        # Check that the frame was modified (not all zeros)
        modified = np.any(annotated > 0)
        self._check("OBB drawing modifies frame", modified)
        results["drawn"] = modified

        return results

    # ────────────────────────────────────────────────────────────────────────
    #   RUN ALL TESTS
    # ────────────────────────────────────────────────────────────────────────

    def run_all(self) -> Dict[str, Any]:
        """Run all OBB benchmark tests."""
        print("=" * 70)
        print("  SLOTS Module 2: OBB & Overhang Benchmark")
        print("=" * 70)

        if not IMPORT_OK:
            print("\n[FAIL] Import error — skipping benchmarks")
            return {"status": "failed", "error": "ImportError"}

        all_results = {}

        all_results["obb_corners"] = self.test_obb_corners()
        all_results["homography"] = self.test_homography_projection()
        all_results["overhang_mitigation"] = self.test_overhang_mitigation()
        all_results["neighbor_overhang"] = self.test_neighbor_overhang()
        all_results["heading_angle"] = self.test_heading_angle()
        all_results["polygon_intersection"] = self.test_polygon_intersection()
        all_results["performance"] = self.test_performance()
        all_results["draw_obb"] = self.test_draw_obb()

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
        description="SLOTS Module 2: OBB & Overhang Benchmark"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Output JSON file for benchmark results"
    )
    args = parser.parse_args()

    suite = OBBBenchmarkSuite()
    results = suite.run_all()

    if args.output:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to: {args.output}")

    # Return exit code based on pass/fail
    summary = results.get("summary", {})
    if summary.get("passed", 0) == summary.get("total", 1):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()