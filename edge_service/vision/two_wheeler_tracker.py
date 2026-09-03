"""
Two-Wheeler Spatial Density Tracker

High-density two-wheeler (motorcycle/scooter) parking zone tracking.

In Indian urban centers, 60-70% of parked vehicles are two-wheelers.
Standard binary OCCUPIED/AVAILABLE slot tracking fails for these zones
because multiple two-wheelers share a single rectangular slot.

This module implements fractional spatial density measurement:
  - Vehicle count per zone (up to max_capacity)
  - Footprint coverage ratio (0.0 to 1.0)
  - Available capacity estimation
  - Zone status (AVAILABLE, FULL, OVERFLOW)

Integrates with:
  - Module 2: EnhancedVehicleDetector for two-wheeler detection
  - Module 1: OBB_3D_Projector for slot mapping
"""

import cv2
import numpy as np
import logging
from typing import List, Dict, Any, Tuple, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ──────────────────────────────────────────────────────────────────────────────
#   CONSTANTS
# ──────────────────────────────────────────────────────────────────────────────

# Default frame dimensions for mask generation
_DEFAULT_FRAME_WIDTH = 1920
_DEFAULT_FRAME_HEIGHT = 1080

# Density thresholds
DENSITY_FULL = 0.85       # Zone considered FULL when density > 85%
DENSITY_OVERFLOW = 1.0    # Zone considered OVERFLOW when density > 100%


class TwoWheelerSpatialTracker:
    """
    Spatial density tracking engine for high-density two-wheeler parking zones.

    Measures multi-vehicle capacity and fractional area occupancy rather than
    single binary occupancy. Supports multiple overlapping detections within
    a designated zone polygon.

    Args:
        max_capacity_per_zone: Maximum number of two-wheelers per zone.
        min_density_threshold: Minimum detection confidence threshold.
        frame_width: Width of the camera frame for mask generation.
        frame_height: Height of the camera frame for mask generation.
    """

    def __init__(
        self,
        max_capacity_per_zone: int = 5,
        min_density_threshold: float = 0.15,
        frame_width: int = _DEFAULT_FRAME_WIDTH,
        frame_height: int = _DEFAULT_FRAME_HEIGHT,
    ):
        self.max_capacity_per_zone = max_capacity_per_zone
        self.min_density_threshold = min_density_threshold
        self.frame_width = frame_width
        self.frame_height = frame_height
        logging.info(
            f"TwoWheelerSpatialTracker initialized "
            f"(capacity={max_capacity_per_zone}/zone, "
            f"threshold={min_density_threshold})"
        )

    # ──────────────────────────────────────────────────────────────────────────
    #   ZONE DENSITY CALCULATION
    # ──────────────────────────────────────────────────────────────────────────

    def calculate_zone_density(
        self,
        two_wheeler_detections: List[Dict[str, Any]],
        zone_polygon: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Calculate two-wheeler count, total footprint coverage, and available
        capacity for a given parking zone.

        The density ratio is computed as:
            density = (occupied pixel area) / (zone pixel area)

        This accounts for partial overlaps and varying vehicle sizes.

        Args:
            two_wheeler_detections: List of detection dicts, each with:
                - "bbox": [x1, y1, x2, y2] bounding box coordinates
                - "confidence" (optional): Detection confidence
                - "class_name" (optional): Vehicle class
            zone_polygon: Nx2 array of polygon vertices defining the zone.

        Returns:
            Dict with:
                - vehicleCount: Number of vehicles detected in zone
                - maxCapacity: Maximum zone capacity
                - remainingCapacity: Available spaces
                - densityRatio: Fractional area occupancy [0.0, 1.0]
                - status: 'AVAILABLE', 'FULL', or 'OVERFLOW'
                - vehicleDetails: List of per-vehicle overlap info
        """
        # Validate zone polygon
        zone_poly = np.array(zone_polygon, dtype=np.int32)
        if zone_poly.size == 0:
            return self._empty_result("Invalid zone polygon")

        zone_area = max(1.0, float(cv2.contourArea(zone_poly)))

        # Create zone mask
        zone_mask = np.zeros((self.frame_height, self.frame_width), dtype=np.uint8)
        cv2.fillPoly(zone_mask, [zone_poly], 255)

        vehicle_count = 0
        occupied_mask = np.zeros_like(zone_mask)
        vehicle_details: List[Dict[str, Any]] = []

        for det in two_wheeler_detections:
            bbox = det.get("bbox", [0, 0, 0, 0])
            x1, y1, x2, y2 = map(int, bbox[:4])

            # Clamp to frame bounds
            x1 = max(0, min(x1, self.frame_width - 1))
            y1 = max(0, min(y1, self.frame_height - 1))
            x2 = max(0, min(x2, self.frame_width - 1))
            y2 = max(0, min(y2, self.frame_height - 1))

            if x2 <= x1 or y2 <= y1:
                continue

            # Check confidence threshold
            confidence = det.get("confidence", 1.0)
            if confidence < self.min_density_threshold:
                continue

            # Create detection mask
            det_poly = np.array(
                [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
                dtype=np.int32,
            )
            det_mask = np.zeros_like(zone_mask)
            cv2.fillPoly(det_mask, [det_poly], 255)

            # Measure overlap with zone
            intersection = cv2.bitwise_and(zone_mask, det_mask)
            inter_area = float(np.count_nonzero(intersection))

            if inter_area > 0:
                vehicle_count += 1
                occupied_mask = cv2.bitwise_or(occupied_mask, intersection)
                vehicle_details.append({
                    "bbox": [x1, y1, x2, y2],
                    "confidence": round(float(confidence), 4),
                    "overlapArea": int(inter_area),
                    "overlapRatio": round(inter_area / zone_area, 4),
                })

        # Compute density
        total_occupied_pixels = float(np.count_nonzero(occupied_mask))
        density_ratio = min(1.0, total_occupied_pixels / zone_area)

        # Determine status
        remaining_capacity = max(0, self.max_capacity_per_zone - vehicle_count)
        if density_ratio >= DENSITY_OVERFLOW or vehicle_count >= self.max_capacity_per_zone:
            status = "OVERFLOW"
        elif density_ratio >= DENSITY_FULL or remaining_capacity == 0:
            status = "FULL"
        else:
            status = "AVAILABLE"

        return {
            "vehicleCount": vehicle_count,
            "maxCapacity": self.max_capacity_per_zone,
            "remainingCapacity": remaining_capacity,
            "densityRatio": round(density_ratio, 4),
            "status": status,
            "vehicleDetails": vehicle_details,
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   MULTI-ZONE DENSITY
    # ──────────────────────────────────────────────────────────────────────────

    def calculate_multi_zone_density(
        self,
        two_wheeler_detections: List[Dict[str, Any]],
        zones: Dict[str, np.ndarray],
    ) -> Dict[str, Dict[str, Any]]:
        """
        Calculate density for multiple zones simultaneously.

        Args:
            two_wheeler_detections: List of detection dicts.
            zones: Dict mapping zone_id -> zone_polygon (Nx2 array).

        Returns:
            Dict mapping zone_id -> density result dict.
        """
        results = {}
        for zone_id, zone_poly in zones.items():
            results[zone_id] = self.calculate_zone_density(
                two_wheeler_detections, zone_poly
            )
        return results

    # ──────────────────────────────────────────────────────────────────────────
    #   ZONE UTILITY
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def get_zone_center(zone_polygon: np.ndarray) -> Tuple[float, float]:
        """Get the centroid of a zone polygon."""
        moments = cv2.moments(np.array(zone_polygon, dtype=np.int32))
        if moments["m00"] == 0:
            return (0.0, 0.0)
        cx = moments["m10"] / moments["m00"]
        cy = moments["m01"] / moments["m00"]
        return (round(cx, 2), round(cy, 2))

    @staticmethod
    def get_zone_area_pixels(zone_polygon: np.ndarray) -> float:
        """Get the area of a zone polygon in pixels."""
        return float(cv2.contourArea(np.array(zone_polygon, dtype=np.int32)))

    # ──────────────────────────────────────────────────────────────────────────
    #   INTERNAL HELPERS
    # ──────────────────────────────────────────────────────────────────────────

    def _empty_result(self, reason: str = "") -> Dict[str, Any]:
        """Return an empty/zeroed density result."""
        return {
            "vehicleCount": 0,
            "maxCapacity": self.max_capacity_per_zone,
            "remainingCapacity": self.max_capacity_per_zone,
            "densityRatio": 0.0,
            "status": "AVAILABLE",
            "vehicleDetails": [],
        }