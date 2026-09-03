"""
SLOTS Vision Pipeline Runner - Edge Node Integration
=====================================================
This module integrates the vision engine with the edge sync daemon for end-to-end
parking detection and event synchronization.

Architecture:
[ RTSP Camera ] -> [ Vision Engine ] -> [ Edge Sync Daemon ] -> [ MQTT Broker ]
                                                                |
                                                                v
                                                        [ Central Database ]
                                                        [ WebSocket Gateway ]
"""

import sys
import os
import time
import cv2
import argparse
import logging
from typing import Optional, Dict, Any
from datetime import datetime
import json

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vision_engine.pipeline import SlotsVisionPipeline
from edge.sync_daemon import EdgeSyncDaemon

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class EdgeNodeRunner:
    """
    Main runner class for edge node integration.
    
    Coordinates between the vision engine and edge sync daemon to provide
    end-to-end parking detection and event synchronization.
    """
    
    def __init__(self, 
                 site_id: str,
                 camera_source: str,
                 bay_id: str = "default",
                 sync_interval: int = 5,
                 mqtt_broker: str = "localhost",
                 mqtt_port: int = 1883,
                 yolo_model: str = "yolov8n.pt",
                 roi_config: str = "vision_engine/roi_config.json"):
        """
        Initialize the edge node runner.
        
        Args:
            site_id: Site identifier for MQTT topics and database
            camera_source: RTSP URL, video file path, or camera index
            bay_id: Parking bay identifier for ROI lookup
            sync_interval: Sync interval in seconds
            mqtt_broker: MQTT broker address
            mqtt_port: MQTT broker port
            yolo_model: Path to YOLO model weights
            roi_config: Path to ROI configuration file
        """
        self.site_id = site_id
        self.camera_source = camera_source
        self.bay_id = bay_id
        self.running = False
        
        # Initialize components
        logger.info(f"Initializing edge node for site {site_id}, bay {bay_id}")
        
        # Initialize edge sync daemon
        self.sync_daemon = EdgeSyncDaemon(
            db_path=f"edge_storage_{site_id}.db",
            mqtt_broker=mqtt_broker,
            mqtt_port=mqtt_port,
            site_id=site_id,
            sync_interval=sync_interval
        )
        
        # Initialize vision pipeline
        self.vision_pipeline = SlotsVisionPipeline(
            yolo_model_path=yolo_model,
            roi_config_path=roi_config,
            ocr_enabled=True,
            vlm_enabled=True
        )
        
        # State tracking for plate change detection
        self.last_status = None
        self.last_plate = None
        self.last_detection_time = None
        
        # Performance metrics
        self.frame_count = 0
        self.start_time = None
        self.detection_count = 0
        self.vlm_fallback_count = 0
        
    def _update_metrics(self, detection: Dict[str, Any]):
        """Update performance metrics based on detection results."""
        self.frame_count += 1
        
        if detection.get("status") == "OCCUPIED":
            self.detection_count += 1
            
        if detection.get("vlm_fallback_triggered"):
            self.vlm_fallback_count += 1
    
    def _print_metrics(self):
        """Print current performance metrics."""
        if self.start_time is None:
            return
            
        elapsed = time.time() - self.start_time
        if elapsed > 0:
            fps = self.frame_count / elapsed
            logger.info(f"Metrics: {self.frame_count} frames | {fps:.1f} FPS | "
                       f"{self.detection_count} detections | {self.vlm_fallback_count} VLM fallbacks")
    
    def _process_frame(self, frame: Any) -> Optional[Dict[str, Any]]:
        """
        Process a single frame through the complete pipeline.
        
        Args:
            frame: Input frame from camera
            
        Returns:
            Detection result or None if processing failed
        """
        try:
            # Run vision pipeline with previous status for change detection
            detection = self.vision_pipeline.process_frame(frame, self.bay_id, self.last_status)
            
            # Update metrics
            self._update_metrics(detection)
            
            # Queue event if status changed (detected by pipeline or plate change)
            status_changed = detection.get("status_changed", False)
            plate_changed = (detection.get("status") == "OCCUPIED" and 
                           detection.get("plate_number") != self.last_plate)
            
            if status_changed or plate_changed:
                logger.info(f"Event queued: {detection['status']} - Plate: {detection.get('plate_number')}")
                
                # Queue event to edge sync daemon
                self.sync_daemon.queue_event(
                    bay_id=detection["bay_id"],
                    status=detection["status"],
                    plate_number=detection.get("plate_number"),
                    confidence=detection.get("confidence", 0.0)
                )
            
            # Update state tracking
            self.last_status = detection["status"]
            self.last_plate = detection.get("plate_number")
            
            return detection
            
        except Exception as e:
            logger.error(f"Frame processing failed: {e}")
            return None
    
    def run(self, fps_limit: int = 20, max_frames: int = -1):
        """
        Run the edge node main loop.
        
        Args:
            fps_limit: Maximum FPS to process (limits CPU usage)
            max_frames: Maximum number of frames to process (-1 for infinite)
        """
        logger.info("Starting edge node runner")
        
        # Start sync daemon
        self.sync_daemon.start()
        
        # Initialize camera
        logger.info(f"Opening camera source: {self.camera_source}")
        
        # Handle different camera source types
        if self.camera_source.isdigit():
            cap = cv2.VideoCapture(int(self.camera_source))
        else:
            cap = cv2.VideoCapture(self.camera_source)
        
        if not cap.isOpened():
            logger.error(f"Failed to open camera source: {self.camera_source}")
            self.sync_daemon.stop()
            return
        
        # Set camera properties for RTSP streams
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency
        cap.set(cv2.CAP_PROP_FPS, fps_limit)
        
        self.running = True
        self.start_time = time.time()
        frame_interval = 1.0 / fps_limit
        last_frame_time = time.time()
        
        logger.info(f"Processing at {fps_limit} FPS limit")
        
        try:
            while self.running and cap.isOpened():
                if max_frames > 0 and self.frame_count >= max_frames:
                    logger.info(f"Reached max frames limit: {max_frames}")
                    break
                
                # Read frame
                ret, frame = cap.read()
                
                if not ret:
                    logger.warning("Failed to read frame, reconnecting...")
                    time.sleep(0.1)
                    continue
                
                # Process frame
                detection = self._process_frame(frame)
                
                # FPS limiting
                current_time = time.time()
                elapsed = current_time - last_frame_time
                if elapsed < frame_interval:
                    time.sleep(frame_interval - elapsed)
                last_frame_time = current_time
                
                # Print metrics every 100 frames
                if self.frame_count % 100 == 0:
                    self._print_metrics()
                    # Print queue status
                    queue_status = self.sync_daemon.get_queue_status()
                    logger.info(f"Queue status: {json.dumps(queue_status, indent=2)}")
                
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
        finally:
            self.running = False
            cap.release()
            self.sync_daemon.stop()
            
            # Print final metrics
            self._print_metrics()
            logger.info("Edge node runner stopped")


def main():
    """Main function for CLI execution."""
    parser = argparse.ArgumentParser(
        description="SLOTS Edge Node Runner - Vision Engine + Edge Sync Integration"
    )
    
    parser.add_argument("--site-id", type=str, required=True, help="Site identifier")
    parser.add_argument("--camera", type=str, required=True, help="Camera source (RTSP URL, video file, or camera index)")
    parser.add_argument("--bay-id", type=str, default="default", help="Parking bay identifier")
    parser.add_argument("--fps", type=int, default=20, help="FPS limit for processing")
    parser.add_argument("--max-frames", type=int, default=-1, help="Max frames to process (-1 for infinite)")
    parser.add_argument("--mqtt-broker", type=str, default="localhost", help="MQTT broker address")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--sync-interval", type=int, default=5, help="Sync interval in seconds")
    parser.add_argument("--yolo-model", type=str, default="yolov8n.pt", help="YOLO model path")
    parser.add_argument("--roi-config", type=str, default="vision_engine/roi_config.json", help="ROI config path")
    
    args = parser.parse_args()
    
    # Create and run edge node
    runner = EdgeNodeRunner(
        site_id=args.site_id,
        camera_source=args.camera,
        bay_id=args.bay_id,
        sync_interval=args.sync_interval,
        mqtt_broker=args.mqtt_broker,
        mqtt_port=args.mqtt_port,
        yolo_model=args.yolo_model,
        roi_config=args.roi_config
    )
    
    runner.run(fps_limit=args.fps, max_frames=args.max_frames)


if __name__ == "__main__":
    main()