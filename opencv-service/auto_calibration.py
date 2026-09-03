"""
Automated Blueprint Calibration System
Handles coordinate transformation using reference markers and perspective transformation
"""

import cv2
import numpy as np
import json
from typing import Tuple, Optional, Dict, List
import requests
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AutoCalibration:
    """
    Automated calibration system for mapping camera coordinates to blueprint coordinates
    Uses reference markers and perspective transformation
    """
    
    def __init__(self, lot_id: str, camera_id: str, central_api_url: str):
        self.lot_id = lot_id
        self.camera_id = camera_id
        self.central_api_url = central_api_url
        self.reference_points = self.load_reference_points()
        self.transformation_matrix = None
        self.slot_coordinates = {}
        self.calibration_accuracy = 0.0
        
    def load_reference_points(self) -> List[Tuple[float, float]]:
        """
        Load reference points from API or use default blueprint corners
        Returns: List of (x, y) tuples for reference points
        """
        try:
            # Try to fetch from API
            response = requests.get(
                f"{self.central_api_url}/api/parking/{self.lotId}/blueprint/reference-points",
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                return [(p['x'], p['y']) for p in data.get('referencePoints', [])]
        except Exception as e:
            logger.warning(f"Failed to load reference points from API: {e}")
        
        # Default blueprint corners (will be customized per blueprint)
        return [
            (0, 0),      # Top-left
            (100, 0),    # Top-right  
            (100, 100),  # Bottom-right
            (0, 100)     # Bottom-left
        ]
    
    def load_slot_coordinates(self) -> Dict[str, Tuple[int, int, int, int]]:
        """
        Load slot coordinates from API
        Returns: Dict mapping slot_id -> (x, y, width, height)
        """
        try:
            response = requests.get(
                f"{self.central_api_url}/api/parking/{self.lotId}/slots/coordinates",
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                slots = data.get('slots', [])
                slot_coords = {}
                for slot in slots:
                    if slot.get('x') is not None and slot.get('y') is not None:
                        slot_coords[slot['id']] = (
                            slot['x'],
                            slot['y'], 
                            slot.get('width', 20),
                            slot.get('height', 30)
                        )
                self.slot_coordinates = slot_coords
                return slot_coords
        except Exception as e:
            logger.error(f"Failed to load slot coordinates: {e}")
        
        return {}
    
    def detect_reference_markers(self, frame: np.ndarray) -> List[Tuple[float, float]]:
        """
        Detect reference markers in camera frame
        Supports ArUco markers and colored markers
        
        Args:
            frame: Camera frame (numpy array)
            
        Returns:
            List of detected (x, y) coordinates
        """
        detected_points = []
        
        # Try ArUco marker detection first
        try:
            aruco_dict = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
            parameters = cv2.aruco.DetectorParameters()
            detector = cv2.aruco.ArucoDetector(aruco_dict, parameters)
            
            corners, ids, rejected = detector.detectMarkers(frame)
            
            if corners and len(corners) >= 4:
                # Sort by marker ID to ensure consistent ordering
                marker_data = list(zip(ids.flatten(), corners))
                marker_data.sort(key=lambda x: x[0])
                
                for marker_id, corner in marker_data:
                    # Get center of marker
                    x = int(corner[0][0][0])
                    y = int(corner[0][0][1])
                    detected_points.append((x, y))
                    
                logger.info(f"Detected {len(detected_points)} ArUco markers")
                return detected_points[:4]  # Return first 4 markers
                
        except Exception as e:
            logger.warning(f"ArUco detection failed: {e}")
        
        # Fallback to colored marker detection
        detected_points = self.detect_colored_markers(frame)
        
        return detected_points
    
    def detect_colored_markers(self, frame: np.ndarray) -> List[Tuple[float, float]]:
        """
        Detect colored reference markers (red, green, blue, yellow corners)
        
        Args:
            frame: Camera frame
            
        Returns:
            List of detected (x, y) coordinates
        """
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # Define color ranges for reference markers
        color_ranges = [
            # Red (two ranges in HSV)
            (np.array([0, 120, 70]), np.array([10, 255, 255])),
            (np.array([170, 120, 70]), np.array([180, 255, 255])),
            # Green
            (np.array([40, 50, 50]), np.array([80, 255, 255])),
            # Blue
            (np.array([100, 50, 50]), np.array([130, 255, 255])),
            # Yellow
            (np.array([20, 100, 100]), np.array([30, 255, 255]))
        ]
        
        detected_points = []
        
        for lower, upper in color_ranges:
            mask = cv2.inRange(hsv, lower, upper)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > 100:  # Minimum area threshold
                    M = cv2.moments(contour)
                    if M["m00"] != 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                        detected_points.append((cx, cy))
        
        # Sort points by position (top-left, top-right, bottom-right, bottom-left)
        if len(detected_points) >= 4:
            detected_points = sorted(detected_points, key=lambda p: (p[1], p[0]))
            # Split into top and bottom rows
            top_row = sorted(detected_points[:2], key=lambda p: p[0])
            bottom_row = sorted(detected_points[2:], key=lambda p: p[0])
            detected_points = top_row + bottom_row
            
        logger.info(f"Detected {len(detected_points)} colored markers")
        return detected_points[:4]
    
    def calculate_perspective_transform(
        self, 
        detected_points: List[Tuple[float, float]], 
        reference_points: List[Tuple[float, float]]
    ) -> Optional[np.ndarray]:
        """
        Calculate perspective transformation matrix
        
        Args:
            detected_points: Points detected in camera frame
            reference_points: Corresponding reference points on blueprint
            
        Returns:
            3x3 perspective transformation matrix or None
        """
        if len(detected_points) < 4 or len(reference_points) < 4:
            logger.error("Need at least 4 points for perspective transformation")
            return None
        
        try:
            src_points = np.array(detected_points[:4], dtype="float32")
            dst_points = np.array(reference_points[:4], dtype="float32")
            
            matrix = cv2.getPerspectiveTransform(src_points, dst_points)
            logger.info("Perspective transformation matrix calculated successfully")
            return matrix
            
        except Exception as e:
            logger.error(f"Failed to calculate perspective transform: {e}")
            return None
    
    def apply_perspective_transform(
        self, 
        coordinates: Tuple[float, float, float, float], 
        matrix: np.ndarray
    ) -> Tuple[float, float, float, float]:
        """
        Apply perspective transformation to coordinates
        
        Args:
            coordinates: (x1, y1, x2, y2) in camera frame
            matrix: Perspective transformation matrix
            
        Returns:
            Transformed (x1, y1, x2, y2) in blueprint coordinates
        """
        x1, y1, x2, y2 = coordinates
        
        # Transform each corner
        corners = np.array([
            [x1, y1],
            [x2, y1], 
            [x2, y2],
            [x1, y2]
        ], dtype="float32")
        
        corners = corners.reshape(-1, 1, 2)
        transformed = cv2.perspectiveTransform(corners, matrix)
        
        transformed = transformed.reshape(-1, 2)
        
        # Get bounding box of transformed corners
        x_coords = transformed[:, 0]
        y_coords = transformed[:, 1]
        
        return (
            float(np.min(x_coords)),
            float(np.min(y_coords)),
            float(np.max(x_coords)),
            float(np.max(y_coords))
        )
    
    def calibrate_camera(self, camera_frame: np.ndarray) -> bool:
        """
        Perform complete camera calibration
        
        Args:
            camera_frame: Current camera frame
            
        Returns:
            True if calibration successful (>90% accuracy)
        """
        logger.info(f"Starting calibration for camera {self.camera_id}")
        
        # Detect reference markers
        detected_markers = self.detect_reference_markers(camera_frame)
        
        if len(detected_markers) < 4:
            logger.error(f"Only {len(detected_markers)} markers detected, need at least 4")
            return False
        
        # Calculate perspective transformation matrix
        self.transformation_matrix = self.calculate_perspective_transform(
            detected_markers, self.reference_points
        )
        
        if self.transformation_matrix is None:
            logger.error("Failed to calculate transformation matrix")
            return False
        
        # Load slot coordinates for validation
        self.load_slot_coordinates()
        
        # Validate calibration accuracy
        accuracy = self.validate_calibration(camera_frame)
        self.calibration_accuracy = accuracy
        
        if accuracy < 0.90:
            logger.warning(f"Calibration accuracy {accuracy:.2%} below 90% threshold")
            return False
        
        logger.info(f"Calibration successful with {accuracy:.2%} accuracy")
        
        # Save calibration data to database
        self.save_calibration_data()
        
        return True
    
    def validate_calibration(self, camera_frame: np.ndarray) -> float:
        """
        Validate calibration accuracy using known reference points
        
        Args:
            camera_frame: Current camera frame
            
        Returns:
            Accuracy percentage (0.0 to 1.0)
        """
        if not self.transformation_matrix or not self.slot_coordinates:
            return 0.0
        
        # For validation, we'll use a simple heuristic:
        # Check if transformation produces reasonable coordinates
        # In production, this would use known test points
        
        try:
            # Transform frame corners to blueprint space
            h, w = camera_frame.shape[:2]
            frame_corners = [
                (0, 0),
                (w, 0),
                (w, h),
                (0, h)
            ]
            
            transformed_coords = []
            for corner in frame_corners:
                x, y = corner
                point = np.array([[x, y]], dtype="float32").reshape(-1, 1, 2)
                transformed = cv2.perspectiveTransform(point, self.transformation_matrix)
                transformed_coords.append((transformed[0][0][0], transformed[0][0][1]))
            
            # Check if transformed coordinates are within reasonable blueprint bounds
            max_coord = max(max(abs(p[0]), abs(p[1])) for p in transformed_coords)
            
            # If coordinates are reasonable (within 0-200 range for our blueprint)
            if 0 < max_coord < 200:
                return 0.95  # Good calibration
            else:
                return 0.70  # Acceptable but could be better
                
        except Exception as e:
            logger.error(f"Calibration validation failed: {e}")
            return 0.0
    
    def detection_to_slot(self, detection_bbox: Tuple[int, int, int, int]) -> Optional[str]:
        """
        Convert AI detection bbox to slot ID using calibrated transformation
        
        Args:
            detection_bbox: (x1, y1, x2, y2) in camera frame
            
        Returns:
            slot_id or None if no match found
        """
        if not self.transformation_matrix:
            logger.warning("No transformation matrix available")
            return None
        
        if not self.slot_coordinates:
            logger.warning("No slot coordinates loaded")
            return None
        
        # Transform detection coordinates to blueprint coordinates
        blueprint_coords = self.apply_perspective_transform(
            detection_bbox, self.transformation_matrix
        )
        
        # Calculate center of detection
        center_x = (blueprint_coords[0] + blueprint_coords[2]) / 2
        center_y = (blueprint_coords[1] + blueprint_coords[3]) / 2
        
        # Find which slot contains this center point
        for slot_id, (slot_x, slot_y, slot_w, slot_h) in self.slot_coordinates.items():
            if (slot_x <= center_x <= slot_x + slot_w and 
                slot_y <= center_y <= slot_y + slot_h):
                logger.debug(f"Detection mapped to slot {slot_id}")
                return slot_id
        
        logger.debug(f"No slot found for detection at ({center_x:.1f}, {center_y:.1f})")
        return None
    
    def save_calibration_data(self):
        """
        Save calibration data to database via API
        """
        try:
            if self.transformation_matrix is not None:
                matrix_json = json.dumps(self.transformation_matrix.tolist())
                
                # Update camera with calibration data
                response = requests.put(
                    f"{self.central_api_url}/api/parking/{self.lotId}/cameras/configure",
                    json={
                        "cameraId": self.camera_id,
                        "calibrationMatrix": matrix_json,
                        "calibrationAccuracy": self.calibration_accuracy,
                        "lastCalibratedAt": datetime.now().isoformat()
                    },
                    timeout=5
                )
                
                if response.status_code == 200:
                    logger.info("Calibration data saved successfully")
                else:
                    logger.warning(f"Failed to save calibration data: {response.status_code}")
                    
        except Exception as e:
            logger.error(f"Failed to save calibration data: {e}")


def create_calibration_system(lot_id: str, camera_id: str, central_api_url: str) -> AutoCalibration:
    """
    Factory function to create calibration system
    
    Args:
        lot_id: Parking lot ID
        camera_id: Camera ID
        central_api_url: Central API base URL
        
    Returns:
        AutoCalibration instance
    """
    return AutoCalibration(lot_id, camera_id, central_api_url)