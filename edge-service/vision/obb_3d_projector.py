"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Module 2: OBB & 3D Ground-Plane Projection Engine  v1.0           ║
║   ┌─────────────────────────────────────────────────────────────────┐     ║
║   │ 1. Oriented Bounding Box (OBB) Corner Construction              │     ║
║   │ 2. Monocular Homography Projection (Pixel → Ground-Plane Meters)│     ║
║   │ 3. Overhang-Aware Oriented Polygon Intersection                 │     ║
║   │ 4. Pitch/Yaw Heading Angle Estimation                          │     ║
║   └─────────────────────────────────────────────────────────────────┘     ║
╚══════════════════════════════════════════════════════════════════════════╝

Blueprint:
  OBB Inference [cx, cy, w, h, θ]
       │
       ▼
  Corner Polygon Generation (4 rotated points in image space)
       │
       ▼
  Monocular Homography Projection (H₃ₓ₃ → Ground-Plane Metric X,Y)
       │
       ▼
  Oriented Polygon Overlap Check (exact floor footprint intersection)
       │
       ▼
  Overhang Mitigation (≥ 35% floor contact area threshold)
"""

import cv2
import numpy as np
import math
import logging
from typing import List, Dict, Any, Tuple, Optional

logger = logging.getLogger("OBB3DProjector")


# ══════════════════════════════════════════════════════════════════════════
#   CONSTANTS
# ══════════════════════════════════════════════════════════════════════════

DEFAULT_MIN_OVERLAP_RATIO = 0.35      # Minimum floor contact area (35%)
DEFAULT_MAX_OVERHANG_RATIO = 0.20     # Maximum vehicle overhang allowed (20%)
EPSILON = 1e-6                        # Numerical stability


class OBB3DProjector:
    """
    Oriented Bounding Box (OBB) & 3D Ground-Plane Projection Engine for SLOTS.

    Handles:
      - Rotated bounding box corner construction from (cx, cy, w, h, θ)
      - Camera homography transformation (pixel → ground-plane meters)
      - Overhang-aware slot intersection using oriented polygon intersection
      - Vehicle heading angle estimation from OBB rotation

    Overhang Mitigation Strategy:
      Calculates the exact intersection area between the projected vehicle
      ground footprint and calibrated parking slot polygons. Overhang (e.g.,
      bumper extending over adjacent slot boundary) is filtered out by
      enforcing a minimum floor contact surface area threshold (≥ 35%).
    """

    def __init__(self, homography_matrix: Optional[np.ndarray] = None):
        """
        Initialize the OBB 3D Projector.

        Args:
            homography_matrix: 3×3 matrix mapping pixel coordinates to
                               ground-plane meters. If None, identity matrix
                               is used (pixel-space = ground-space).
        """
        if homography_matrix is not None:
            self.H = np.array(homography_matrix, dtype=np.float64)
            try:
                self.H_inv = np.linalg.inv(self.H)
            except np.linalg.LinAlgError:
                logger.warning("Homography matrix is singular — using pseudo-inverse")
                self.H_inv = np.linalg.pinv(self.H)
        else:
            # Default Identity Homography (uncalibrated fallback)
            self.H = np.eye(3, dtype=np.float64)
            self.H_inv = np.eye(3, dtype=np.float64)

        logger.info(
            f"OBB3DProjector initialized: "
            f"homography={'calibrated' if homography_matrix is not None else 'identity'}"
        )

    # ────────────────────────────────────────────────────────────────────────
    #   1. OBB CORNER CONSTRUCTION
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def get_obb_corners(
        cx: float,
        cy: float,
        w: float,
        h: float,
        angle_rad: float,
    ) -> np.ndarray:
        """
        Calculate 4 rotated corner points [P0, P1, P2, P3] from OBB parameters.

        Uses the rotation matrix:
            P = [cx] + R(θ) · [±w/2]
                [cy]         [±h/2]

        Args:
            cx: Center X (pixel)
            cy: Center Y (pixel)
            w: Box width (pixels)
            h: Box height (pixels)
            angle_rad: Rotation angle in radians

        Returns:
            np.ndarray of shape (4, 2) with corner coordinates:
                [P0: top-left, P1: top-right, P2: bottom-right, P3: bottom-left]
        """
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)

        # Local corner vectors (relative to center)
        dx = w / 2.0
        dy = h / 2.0

        local_corners = np.array(
            [
                [-dx, -dy],
                [dx, -dy],
                [dx, dy],
                [-dx, dy],
            ],
            dtype=np.float32,
        )

        # Rotation matrix
        R = np.array(
            [
                [cos_a, -sin_a],
                [sin_a, cos_a],
            ],
            dtype=np.float32,
        )

        # Rotate and translate
        rotated_corners = np.dot(local_corners, R.T)
        rotated_corners[:, 0] += cx
        rotated_corners[:, 1] += cy

        return rotated_corners  # Shape: (4, 2)

    @staticmethod
    def get_obb_from_bbox(
        x1: float, y1: float, x2: float, y2: float, angle: float = 0.0
    ) -> List[float]:
        """
        Convert axis-aligned bbox [x1, y1, x2, y2] to OBB format [cx, cy, w, h, θ].

        Args:
            x1, y1, x2, y2: Axis-aligned bounding box coordinates
            angle: Rotation angle in radians (default: 0.0 for axis-aligned)

        Returns:
            OBB parameters [cx, cy, w, h, angle_rad]
        """
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        w = float(x2 - x1)
        h = float(y2 - y1)
        return [cx, cy, w, h, angle]

    # ────────────────────────────────────────────────────────────────────────
    #   2. MONOCULAR HOMOGRAPHY PROJECTION
    # ────────────────────────────────────────────────────────────────────────

    def project_pixels_to_ground(self, points: np.ndarray) -> np.ndarray:
        """
        Transform pixel coordinates (N, 2) to real-world ground-plane meters
        using Homography matrix H.

        Applies:
            [Xm]       [x_i]
            [Ym] ~ H · [y_i]
            [ 1]       [ 1 ]

        Args:
            points: Array of shape (N, 2) with pixel coordinates

        Returns:
            Array of shape (N, 2) with ground-plane metric coordinates (X, Y in meters)
        """
        points = np.array(points, dtype=np.float64)
        if points.ndim == 1:
            points = points.reshape(1, -1)

        n = points.shape[0]
        ones = np.ones((n, 1), dtype=np.float64)
        pts_homo = np.hstack([points, ones])  # (N, 3)

        ground_homo = np.dot(self.H, pts_homo.T).T  # (N, 3)

        # Normalize w component (avoid division by zero)
        w_comp = ground_homo[:, 2:3]
        w_comp = np.where(np.abs(w_comp) < EPSILON, EPSILON, w_comp)
        ground_pts = ground_homo[:, :2] / w_comp

        return ground_pts

    def project_ground_to_pixels(self, points: np.ndarray) -> np.ndarray:
        """
        Inverse projection: ground-plane meters → pixel coordinates.

        Args:
            points: Array of shape (N, 2) with ground-plane metric coordinates

        Returns:
            Array of shape (N, 2) with pixel coordinates
        """
        points = np.array(points, dtype=np.float64)
        if points.ndim == 1:
            points = points.reshape(1, -1)

        n = points.shape[0]
        ones = np.ones((n, 1), dtype=np.float64)
        pts_homo = np.hstack([points, ones])  # (N, 3)

        pixel_homo = np.dot(self.H_inv, pts_homo.T).T  # (N, 3)

        w_comp = pixel_homo[:, 2:3]
        w_comp = np.where(np.abs(w_comp) < EPSILON, EPSILON, w_comp)
        pixel_pts = pixel_homo[:, :2] / w_comp

        return pixel_pts

    def project_obb_to_ground(
        self, cx: float, cy: float, w: float, h: float, angle_rad: float
    ) -> np.ndarray:
        """
        Project OBB corners to ground-plane metric coordinates.

        Args:
            cx, cy, w, h, angle_rad: OBB parameters in pixel space

        Returns:
            np.ndarray of shape (4, 2) with ground-plane metric corner coordinates
        """
        corners = self.get_obb_corners(cx, cy, w, h, angle_rad)
        return self.project_pixels_to_ground(corners)

    # ────────────────────────────────────────────────────────────────────────
    #   3. ORIENTED POLYGON INTERSECTION
    # ────────────────────────────────────────────────────────────────────────

    def compute_oriented_intersection_area(
        self,
        poly1_pts: np.ndarray,
        poly2_pts: np.ndarray,
    ) -> float:
        """
        Compute intersection area between two arbitrary oriented polygons.

        Uses a robust mask-based approach (works with any OpenCV version,
        including 5.x where cv2.intersectConvexPolygons is unavailable).

        Args:
            poly1_pts: First polygon as np.ndarray of shape (N, 2)
            poly2_pts: Second polygon as np.ndarray of shape (M, 2)

        Returns:
            Intersection area in pixels (0.0 if no intersection)
        """
        # Reshape to (N, 2)
        p1 = np.array(poly1_pts, dtype=np.float32).reshape(-1, 2)
        p2 = np.array(poly2_pts, dtype=np.float32).reshape(-1, 2)

        if len(p1) < 3 or len(p2) < 3:
            return 0.0

        # Quick bounding box rejection (optimization)
        bb1_min, bb1_max = p1.min(axis=0), p1.max(axis=0)
        bb2_min, bb2_max = p2.min(axis=0), p2.max(axis=0)

        if (
            bb1_max[0] < bb2_min[0]
            or bb2_max[0] < bb1_min[0]
            or bb1_max[1] < bb2_min[1]
            or bb2_max[1] < bb1_min[1]
        ):
            return 0.0

        # Find bounding box of both polygons
        all_pts = np.vstack([p1, p2])
        x_min, y_min = np.min(all_pts, axis=0).astype(int)
        x_max, y_max = np.max(all_pts, axis=0).astype(int)

        # Add padding and ensure positive dimensions
        x_min = max(0, x_min - 1)
        y_min = max(0, y_min - 1)
        x_max = max(x_max + 2, x_min + 2)
        y_max = max(y_max + 2, y_min + 2)

        w = int(x_max - x_min)
        h = int(y_max - y_min)

        # Create masks in the bounding box region
        mask1 = np.zeros((h, w), dtype=np.uint8)
        mask2 = np.zeros((h, w), dtype=np.uint8)

        # Offset polygons to the bounding box origin
        offset = np.array([x_min, y_min], dtype=np.float32)
        p1_roi = (p1 - offset).astype(np.int32)
        p2_roi = (p2 - offset).astype(np.int32)

        # Fill polygons
        cv2.fillPoly(mask1, [p1_roi.reshape(-1, 1, 2)], 255)
        cv2.fillPoly(mask2, [p2_roi.reshape(-1, 1, 2)], 255)

        # Compute intersection
        intersection = cv2.bitwise_and(mask1, mask2)
        return float(cv2.countNonZero(intersection))

    @staticmethod
    def polygon_area(poly_pts: np.ndarray) -> float:
        """
        Compute the area of a polygon using the Shoelace formula.

        Args:
            poly_pts: Polygon points as np.ndarray of shape (N, 2)

        Returns:
            Polygon area
        """
        pts = np.array(poly_pts, dtype=np.float64).reshape(-1, 2)
        if len(pts) < 3:
            return 0.0
        # Use cv2.contourArea for consistency
        return float(cv2.contourArea(pts.astype(np.float32)))

    # ────────────────────────────────────────────────────────────────────────
    #   4. OVERHANG-AWARE SLOT OCCUPANCY EVALUATION
    # ────────────────────────────────────────────────────────────────────────

    def evaluate_slot_occupancy_obb(
        self,
        obb_detections: List[Dict[str, Any]],
        slot_polygons: List[Dict[str, Any]],
        min_overlap_ratio: float = DEFAULT_MIN_OVERLAP_RATIO,
        max_overhang_ratio: float = DEFAULT_MAX_OVERHANG_RATIO,
    ) -> List[Dict[str, Any]]:
        """
        Map Oriented Bounding Boxes (OBB) to slot ground areas.

        Overhang Rule: Vehicle occupies slot ONLY if:
          1. Floor contact area ≥ min_overlap_ratio (35% of slot area)
          2. Vehicle overhang ≤ max_overhang_ratio (20% of vehicle outside slot)

        This eliminates false neighbor-slot occupancy triggers from:
          - Diagonally parked vehicles
          - Large SUVs/trucks with bumper overhang
          - Vehicles in adjacent slots

        Args:
            obb_detections: List of dicts with keys:
                - "obb": [cx, cy, w, h, angle_rad]
                - "confidence": float (0.0-1.0)
            slot_polygons: List of slot dicts with keys:
                - "id": Slot identifier
                - "coordinates": List of [x, y] corner points
            min_overlap_ratio: Minimum floor contact area ratio (default: 0.35)
            max_overhang_ratio: Maximum vehicle overhang ratio (default: 0.20)

        Returns:
            List of slot status dicts:
                {
                    "slotId": str,
                    "status": "OCCUPIED" | "AVAILABLE",
                    "groundOverlapRatio": float,
                    "overhangRatio": float,
                    "headingAngleDeg": float | None,
                    "confidence": float,
                    "vehicleClass": str | None
                }
        """
        slot_results = []

        for slot in slot_polygons:
            slot_id = slot.get("id") or slot.get("slotId", "unknown")
            coords = slot.get("coordinates", [])

            if not coords:
                # Fallback: use x, y, w, h format
                sx = float(slot.get("x", 0))
                sy = float(slot.get("y", 0))
                sw = float(slot.get("width", 240))
                sh = float(slot.get("height", 140))
                slot_poly = np.array(
                    [[sx, sy], [sx + sw, sy], [sx + sw, sy + sh], [sx, sy + sh]],
                    dtype=np.float32,
                )
            else:
                slot_poly = np.array(coords, dtype=np.float32)

            slot_area = max(self.polygon_area(slot_poly), 1.0)

            occupied = False
            best_overlap = 0.0
            best_overhang = 1.0
            best_confidence = 0.0
            occupying_vehicle_angle = None
            occupying_vehicle_class = None

            for det in obb_detections:
                # Extract OBB format [cx, cy, w, h, angle]
                obb = det["obb"]
                cx, cy, w, h, angle = obb
                confidence = det.get("confidence", 0.0)
                class_name = det.get("class_name", det.get("className", None))

                # Generate vehicle corner polygon
                vehicle_corners = self.get_obb_corners(cx, cy, w, h, angle)
                vehicle_area = max(self.polygon_area(vehicle_corners), 1.0)

                # Compute floor intersection
                inter_area = self.compute_oriented_intersection_area(
                    slot_poly, vehicle_corners
                )
                overlap_ratio = inter_area / slot_area
                overhang_ratio = 1.0 - (inter_area / vehicle_area)

                # Track best overlap
                if overlap_ratio > best_overlap:
                    best_overlap = overlap_ratio
                    best_overhang = overhang_ratio
                    best_confidence = confidence
                    occupying_vehicle_angle = math.degrees(angle)
                    occupying_vehicle_class = class_name

                # Overhang Rule: Vehicle occupies slot ONLY if:
                #   1. Contact area meets floor threshold (≥ 35%)
                #   2. Vehicle overhang is within limit (≤ 20%)
                if (
                    overlap_ratio >= min_overlap_ratio
                    and overhang_ratio <= max_overhang_ratio
                ):
                    occupied = True

            slot_results.append(
                {
                    "slotId": slot_id,
                    "status": "OCCUPIED" if occupied else "AVAILABLE",
                    "groundOverlapRatio": round(best_overlap, 3),
                    "overhangRatio": round(best_overhang, 3),
                    "headingAngleDeg": (
                        round(occupying_vehicle_angle, 1)
                        if occupying_vehicle_angle is not None
                        else None
                    ),
                    "confidence": round(best_confidence, 3),
                    "vehicleClass": occupying_vehicle_class,
                }
            )

        return slot_results

    # ────────────────────────────────────────────────────────────────────────
    #   5. HEADING ANGLE / PITCH-YAW ESTIMATION
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def estimate_heading_angle(
        obb_angle_rad: float,
        slot_orientation_rad: float = 0.0,
    ) -> float:
        """
        Estimate vehicle heading angle relative to slot orientation.

        Args:
            obb_angle_rad: OBB rotation angle in radians
            slot_orientation_rad: Slot's expected heading angle (default: 0.0)

        Returns:
            Heading angle in degrees (relative to slot orientation)
        """
        relative_angle = obb_angle_rad - slot_orientation_rad
        # Normalize to [-180, 180]
        relative_deg = math.degrees(relative_angle)
        while relative_deg > 180:
            relative_deg -= 360
        while relative_deg < -180:
            relative_deg += 360
        return round(relative_deg, 1)

    @staticmethod
    def is_parked_aligned(
        obb_angle_rad: float,
        slot_orientation_rad: float = 0.0,
        alignment_threshold_deg: float = 15.0,
    ) -> bool:
        """
        Check if a vehicle is parked aligned with the slot orientation.

        Args:
            obb_angle_rad: OBB rotation angle in radians
            slot_orientation_rad: Slot's expected heading angle
            alignment_threshold_deg: Max deviation for "aligned" (default: 15°)

        Returns:
            True if vehicle is aligned within threshold
        """
        heading = OBB3DProjector.estimate_heading_angle(
            obb_angle_rad, slot_orientation_rad
        )
        return abs(heading) <= alignment_threshold_deg

    # ────────────────────────────────────────────────────────────────────────
    #   6. UTILITY: DRAW OBB OVERLAY
    # ────────────────────────────────────────────────────────────────────────

    @staticmethod
    def draw_obb(
        frame: np.ndarray,
        cx: float,
        cy: float,
        w: float,
        h: float,
        angle_rad: float,
        color: Tuple[int, int, int] = (0, 255, 0),
        thickness: int = 2,
        label: Optional[str] = None,
    ) -> np.ndarray:
        """
        Draw an oriented bounding box on a frame.

        Args:
            frame: BGR image
            cx, cy, w, h, angle_rad: OBB parameters
            color: BGR color tuple
            thickness: Line thickness
            label: Optional text label

        Returns:
            Annotated frame
        """
        corners = OBB3DProjector.get_obb_corners(cx, cy, w, h, angle_rad)
        corners_int = corners.astype(np.int32)

        # Draw polygon
        cv2.polylines(frame, [corners_int], True, color, thickness)

        # Draw center point
        cv2.circle(frame, (int(cx), int(cy)), 3, color, -1)

        # Draw heading line (from center to first corner direction)
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        heading_end = (int(cx + cos_a * w / 2), int(cy + sin_a * w / 2))
        cv2.line(frame, (int(cx), int(cy)), heading_end, color, max(1, thickness - 1))

        # Draw label
        if label:
            cv2.putText(
                frame,
                label,
                (int(corners[0, 0]), int(corners[0, 1]) - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
            )

        return frame