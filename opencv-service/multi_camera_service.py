"""
Multi-Camera Smart Parking Service
Manages multiple cameras per parking lot with zone-specific monitoring
"""

import threading
import time
import logging
from typing import Dict, List, Optional
from main import SmartMonitor
from auto_calibration import AutoCalibration, create_calibration_system

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MultiCameraSmartMonitor:
    """
    Manages multiple cameras for a single parking lot
    Each camera monitors specific zones with its own calibration
    """
    
    def __init__(self, lot_id: str, central_api_url: str):
        self.lot_id = lot_id
        self.central_api_url = central_api_url
        self.cameras: Dict[str, SmartMonitor] = {}  # camera_id -> SmartMonitor
        self.calibrations: Dict[str, AutoCalibration] = {}  # camera_id -> AutoCalibration
        self.camera_configs: Dict[str, dict] = {}  # camera_id -> config
        self.running = False
        self.lock = threading.Lock()
        
        # Load camera configurations
        self.load_camera_configs()
        
    def load_camera_configs(self):
        """Fetch all camera configs for this lot from API"""
        try:
            import requests
            response = requests.get(
                f"{self.central_api_url}/api/parking/{self.lot_id}/cameras/configure",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                cameras = data.get('cameras', [])
                
                for camera in cameras:
                    if camera.get('isActive', True):
                        self.camera_configs[camera['id']] = camera
                        logger.info(f"Loaded config for camera {camera['id']}: {camera['name']}")
                
                logger.info(f"Loaded {len(self.camera_configs)} camera configurations")
            else:
                logger.warning(f"Failed to load camera configs: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error loading camera configs: {e}")
    
    def initialize_camera(self, camera_id: str) -> bool:
        """
        Initialize a single camera with its SmartMonitor and calibration
        Returns: True if successful
        """
        with self.lock:
            if camera_id in self.cameras:
                logger.warning(f"Camera {camera_id} already initialized")
                return True
            
            config = self.camera_configs.get(camera_id)
            if not config:
                logger.error(f"No config found for camera {camera_id}")
                return False
            
            try:
                # Create SmartMonitor for this camera
                monitor = SmartMonitor(
                    lot_id=self.lot_id,
                    camera_id=camera_id
                )
                
                # Override camera URL from config
                monitor.camera_url = config.get('url')
                
                # Create calibration system
                calibration = create_calibration_system(
                    self.lot_id, 
                    camera_id, 
                    self.central_api_url
                )
                
                # Store in dictionaries
                self.cameras[camera_id] = monitor
                self.calibrations[camera_id] = calibration
                
                logger.info(f"Initialized camera {camera_id} ({config['name']})")
                return True
                
            except Exception as e:
                logger.error(f"Failed to initialize camera {camera_id}: {e}")
                return False
    
    def start_camera(self, camera_id: str) -> bool:
        """
        Start monitoring for a specific camera
        Returns: True if successful
        """
        with self.lock:
            if camera_id not in self.cameras:
                if not self.initialize_camera(camera_id):
                    return False
            
            monitor = self.cameras[camera_id]
            if not monitor.running:
                try:
                    monitor.start()
                    logger.info(f"Started camera {camera_id}")
                    return True
                except Exception as e:
                    logger.error(f"Failed to start camera {camera_id}: {e}")
                    return False
            
            return True
    
    def stop_camera(self, camera_id: str):
        """Stop monitoring for a specific camera"""
        with self.lock:
            if camera_id in self.cameras:
                monitor = self.cameras[camera_id]
                if monitor.running:
                    monitor.stop()
                    logger.info(f"Stopped camera {camera_id}")
    
    def start_all_cameras(self):
        """Start all configured cameras"""
        logger.info(f"Starting {len(self.camera_configs)} cameras...")
        
        for camera_id in self.camera_configs:
            if self.start_camera(camera_id):
                logger.info(f"Camera {camera_id} started successfully")
            else:
                logger.error(f"Failed to start camera {camera_id}")
        
        self.running = True
        logger.info("All cameras started")
    
    def stop_all_cameras(self):
        """Stop all cameras"""
        logger.info("Stopping all cameras...")
        
        for camera_id in list(self.cameras.keys()):
            self.stop_camera(camera_id)
        
        self.running = False
        logger.info("All cameras stopped")
    
    def calibrate_camera(self, camera_id: str, camera_frame) -> bool:
        """
        Perform calibration for a specific camera
        Returns: True if calibration successful
        """
        with self.lock:
            if camera_id not in self.calibrations:
                logger.error(f"Calibration system not found for camera {camera_id}")
                return False
            
            calibration = self.calibrations[camera_id]
            success = calibration.calibrate_camera(camera_frame)
            
            if success:
                logger.info(f"Camera {camera_id} calibrated successfully")
            else:
                logger.warning(f"Camera {camera_id} calibration failed")
            
            return success
    
    def get_camera_zones(self, camera_id: str) -> List[str]:
        """Get zones monitored by a specific camera"""
        config = self.camera_configs.get(camera_id, {})
        zones_str = config.get('zones', '')
        return [z.strip() for z in zones_str.split(',') if z.strip()]
    
    def get_zone_camera(self, zone_code: str) -> Optional[str]:
        """
        Find which camera monitors a specific zone
        Returns: camera_id or None
        """
        for camera_id, config in self.camera_configs.items():
            zones = self.get_camera_zones(camera_id)
            if zone_code in zones:
                return camera_id
        return None
    
    def get_camera_status(self) -> Dict[str, dict]:
        """Get status of all cameras"""
        status = {}
        
        for camera_id, monitor in self.cameras.items():
            config = self.camera_configs.get(camera_id, {})
            calibration = self.calibrations.get(camera_id)
            
            status[camera_id] = {
                'name': config.get('name', 'Unknown'),
                'zones': self.get_camera_zones(camera_id),
                'running': monitor.running,
                'camera_url': config.get('url'),
                'calibrated': calibration is not None and calibration.transformation_matrix is not None,
                'calibration_accuracy': calibration.calibration_accuracy if calibration else 0.0,
                'last_frame_time': time.time() if monitor.last_frame is not None else None
            }
        
        return status
    
    def process_detection_with_calibration(self, camera_id: str, detection_bbox: tuple) -> Optional[str]:
        """
        Process AI detection with calibration to map to slot ID
        Args:
            camera_id: Which camera made the detection
            detection_bbox: (x1, y1, x2, y2) in camera frame
        Returns:
            slot_id or None
        """
        with self.lock:
            if camera_id not in self.calibrations:
                logger.warning(f"No calibration for camera {camera_id}, using direct mapping")
                return None
            
            calibration = self.calibrations[camera_id]
            slot_id = calibration.detection_to_slot(detection_bbox)
            
            if slot_id:
                logger.info(f"Detection from camera {camera_id} mapped to slot {slot_id}")
            else:
                logger.debug(f"Detection from camera {camera_id} could not be mapped to slot")
            
            return slot_id
    
    def reload_camera_configs(self):
        """Reload camera configurations from API"""
        logger.info("Reloading camera configurations...")
        old_configs = set(self.camera_configs.keys())
        
        self.load_camera_configs()
        new_configs = set(self.camera_configs.keys())
        
        # Handle new cameras
        added = new_configs - old_configs
        for camera_id in added:
            logger.info(f"New camera detected: {camera_id}")
            if self.running:
                self.start_camera(camera_id)
        
        # Handle removed cameras
        removed = old_configs - new_configs
        for camera_id in removed:
            logger.info(f"Camera removed: {camera_id}")
            self.stop_camera(camera_id)
            with self.lock:
                self.cameras.pop(camera_id, None)
                self.calibrations.pop(camera_id, None)
        
        # Handle updated cameras
        for camera_id in old_configs & new_configs:
            if self.camera_configs[camera_id] != self.get_stored_config(camera_id):
                logger.info(f"Camera config updated: {camera_id}")
                self.stop_camera(camera_id)
                with self.lock:
                    self.cameras.pop(camera_id, None)
                    self.calibrations.pop(camera_id, None)
                if self.running:
                    self.start_camera(camera_id)
    
    def get_stored_config(self, camera_id: str) -> dict:
        """Get currently stored config for comparison"""
        # This would need to be implemented based on how you store configs
        return self.camera_configs.get(camera_id, {})
    
    def health_check(self) -> dict:
        """Perform health check on all cameras"""
        health = {
            'lot_id': self.lot_id,
            'running': self.running,
            'total_cameras': len(self.camera_configs),
            'active_cameras': sum(1 for m in self.cameras.values() if m.running),
            'calibrated_cameras': sum(1 for c in self.calibrations.values() if c.transformation_matrix is not None),
            'cameras': {}
        }
        
        for camera_id, status in self.get_camera_status().items():
            health['cameras'][camera_id] = {
                'status': 'healthy' if status['running'] else 'stopped',
                'calibrated': status['calibrated'],
                'zones': status['zones']
            }
        
        return health


def create_multi_camera_service(lot_id: str, central_api_url: str) -> MultiCameraSmartMonitor:
    """
    Factory function to create multi-camera service
    
    Args:
        lot_id: Parking lot ID
        central_api_url: Central API base URL
        
    Returns:
        MultiCameraSmartMonitor instance
    """
    return MultiCameraSmartMonitor(lot_id, central_api_url)