"""
SLOTS Stream Simulator - Testing & Validation Tool
==================================================
This module simulates video streams to evaluate the pipeline under various conditions:
- RTSP stream simulation
- Video file looping
- Image folder processing
- Performance metrics collection
- Network failover testing
- VLM fallback trigger testing

Usage:
    python stream_simulator.py --video test.mp4 --bay-id BAY-A-101 --site-id test-site
    python stream_simulator.py --rtsp rtsp://camera_url --bay-id BAY-A-102 --site-id test-site
    python stream_simulator.py --images ./test_images/ --bay-id BAY-A-103 --site-id test-site
"""

import sys
import os
import cv2
import time
import argparse
import logging
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from pathlib import Path
import numpy as np
from collections import deque

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


class StreamSimulator:
    """
    Stream simulator for testing the SLOTS vision pipeline.
    
    Supports various input sources:
    - Video files (with looping)
    - RTSP streams
    - Image folders
    - Webcam devices
    """
    
    def __init__(self,
                 bay_id: str = "default",
                 site_id: str = "test-site",
                 yolo_model: str = "yolov8n.pt",
                 roi_config: str = "vision_engine/roi_config.json",
                 fps_limit: int = 25,
                 enable_sync: bool = False,
                 mqtt_broker: str = "localhost",
                 mqtt_port: int = 1883):
        """
        Initialize the stream simulator.
        
        Args:
            bay_id: Parking bay identifier
            site_id: Site identifier
            yolo_model: Path to YOLO model
            roi_config: Path to ROI configuration
            fps_limit: FPS limit for processing
            enable_sync: Enable edge sync daemon
            mqtt_broker: MQTT broker address
            mqtt_port: MQTT broker port
        """
        self.bay_id = bay_id
        self.site_id = site_id
        self.fps_limit = fps_limit
        self.enable_sync = enable_sync
        
        # Initialize vision pipeline
        logger.info(f"Initializing vision pipeline for bay {bay_id}")
        self.vision_pipeline = SlotsVisionPipeline(
            yolo_model_path=yolo_model,
            roi_config_path=roi_config,
            ocr_enabled=True,
            vlm_enabled=True
        )
        
        # Initialize sync daemon if enabled
        self.sync_daemon = None
        if enable_sync:
            logger.info(f"Initializing edge sync daemon for site {site_id}")
            self.sync_daemon = EdgeSyncDaemon(
                db_path=f"edge_storage_{site_id}.db",
                mqtt_broker=mqtt_broker,
                mqtt_port=mqtt_port,
                site_id=site_id
            )
            self.sync_daemon.start()
        
        # Performance metrics
        self.metrics = {
            'frame_count': 0,
            'inference_times': deque(maxlen=100),
            'ocr_confidences': deque(maxlen=100),
            'vlm_fallback_count': 0,
            'detection_count': 0,
            'status_changes': 0,
            'start_time': None,
            'last_status': None
        }
        
        # Frame buffer for RTSP reconnection
        self.frame_buffer = deque(maxlen=10)
        
    def _update_metrics(self, detection: Dict[str, Any], inference_time: float):
        """Update performance metrics."""
        self.metrics['frame_count'] += 1
        self.metrics['inference_times'].append(inference_time)
        
        if detection.get('status') == 'OCCUPIED':
            self.metrics['detection_count'] += 1
            
        if detection.get('vlm_fallback_triggered'):
            self.metrics['vlm_fallback_count'] += 1
            
        if detection.get('plate_number'):
            self.metrics['ocr_confidences'].append(detection.get('confidence', 0.0))
            
        # Track status changes
        current_status = detection.get('status')
        if current_status != self.metrics['last_status']:
            self.metrics['status_changes'] += 1
            self.metrics['last_status'] = current_status
    
    def _get_metrics_summary(self) -> Dict[str, Any]:
        """Get current metrics summary."""
        if not self.metrics['start_time']:
            return {}
            
        elapsed = time.time() - self.metrics['start_time']
        avg_inference_time = np.mean(self.metrics['inference_times']) if self.metrics['inference_times'] else 0
        avg_ocr_confidence = np.mean(self.metrics['ocr_confidences']) if self.metrics['ocr_confidences'] else 0
        fps = self.metrics['frame_count'] / elapsed if elapsed > 0 else 0
        
        return {
            'frames_processed': self.metrics['frame_count'],
            'fps': fps,
            'avg_inference_time_ms': avg_inference_time * 1000,
            'avg_ocr_confidence': avg_ocr_confidence * 100,
            'vlm_fallback_count': self.metrics['vlm_fallback_count'],
            'detection_count': self.metrics['detection_count'],
            'status_changes': self.metrics['status_changes'],
            'elapsed_time_s': elapsed
        }
    
    def _print_metrics(self):
        """Print current metrics."""
        summary = self._get_metrics_summary()
        if summary:
            logger.info(f"📊 Metrics: {summary['frames_processed']} frames | "
                       f"{summary['fps']:.1f} FPS | "
                       f"{summary['avg_inference_time_ms']:.1f}ms avg inference | "
                       f"{summary['avg_ocr_confidence']:.1f}% avg OCR | "
                       f"{summary['vlm_fallback_count']} VLM fallbacks | "
                       f"{summary['status_changes']} status changes")
    
    def _process_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Process a single frame through the pipeline.
        
        Args:
            frame: Input frame
            
        Returns:
            Detection result
        """
        start_time = time.time()
        
        # Run vision pipeline
        detection = self.vision_pipeline.process_frame(frame, self.bay_id, self.metrics['last_status'])
        
        inference_time = time.time() - start_time
        
        # Update metrics
        self._update_metrics(detection, inference_time)
        
        # Queue event if sync enabled and status changed
        if self.sync_daemon and detection.get('status_changed'):
            self.sync_daemon.queue_event(
                bay_id=detection['bay_id'],
                status=detection['status'],
                plate_number=detection.get('plate_number'),
                confidence=detection.get('confidence', 0.0)
            )
        
        return detection
    
    def simulate_video(self, video_path: str, max_frames: int = -1):
        """
        Simulate video stream from file.
        
        Args:
            video_path: Path to video file
            max_frames: Maximum frames to process (-1 for infinite)
        """
        logger.info(f"🎬 Starting video simulation from {video_path}")
        
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Failed to open video file: {video_path}")
            return
        
        # Get video properties
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        logger.info(f"Video info: {fps} FPS, {total_frames} total frames")
        
        self.metrics['start_time'] = time.time()
        frame_interval = 1.0 / self.fps_limit
        last_frame_time = time.time()
        
        try:
            while True:
                if max_frames > 0 and self.metrics['frame_count'] >= max_frames:
                    logger.info(f"Reached max frames limit: {max_frames}")
                    break
                
                ret, frame = cap.read()
                if not ret:
                    # Loop video
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    logger.info("🔄 Video loop - restarting from beginning")
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
                if self.metrics['frame_count'] % 100 == 0:
                    self._print_metrics()
                    
                # Print queue status if sync enabled
                if self.sync_daemon and self.metrics['frame_count'] % 100 == 0:
                    queue_status = self.sync_daemon.get_queue_status()
                    logger.info(f"📦 Queue status: {json.dumps(queue_status, indent=2)}")
                
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            cap.release()
            if self.sync_daemon:
                self.sync_daemon.stop()
            self._print_metrics()
            logger.info("Video simulation completed")
    
    def simulate_rtsp(self, rtsp_url: str, max_frames: int = -1):
        """
        Simulate RTSP stream.
        
        Args:
            rtsp_url: RTSP stream URL
            max_frames: Maximum frames to process (-1 for infinite)
        """
        logger.info(f"📡 Starting RTSP simulation from {rtsp_url}")
        
        cap = cv2.VideoCapture(rtsp_url)
        if not cap.isOpened():
            logger.error(f"Failed to open RTSP stream: {rtsp_url}")
            return
        
        # Set RTSP-specific properties
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency
        
        self.metrics['start_time'] = time.time()
        frame_interval = 1.0 / self.fps_limit
        last_frame_time = time.time()
        reconnect_attempts = 0
        max_reconnect_attempts = 5
        
        try:
            while True:
                if max_frames > 0 and self.metrics['frame_count'] >= max_frames:
                    logger.info(f"Reached max frames limit: {max_frames}")
                    break
                
                ret, frame = cap.read()
                if not ret:
                    reconnect_attempts += 1
                    if reconnect_attempts < max_reconnect_attempts:
                        logger.warning(f"Frame read failed, reconnecting... (attempt {reconnect_attempts})")
                        time.sleep(2)
                        cap.release()
                        cap = cv2.VideoCapture(rtsp_url)
                        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                        continue
                    else:
                        logger.error("Max reconnection attempts reached")
                        break
                
                # Reset reconnect counter on successful frame
                reconnect_attempts = 0
                
                # Process frame
                detection = self._process_frame(frame)
                
                # FPS limiting
                current_time = time.time()
                elapsed = current_time - last_frame_time
                if elapsed < frame_interval:
                    time.sleep(frame_interval - elapsed)
                last_frame_time = current_time
                
                # Print metrics every 100 frames
                if self.metrics['frame_count'] % 100 == 0:
                    self._print_metrics()
                    
                # Print queue status if sync enabled
                if self.sync_daemon and self.metrics['frame_count'] % 100 == 0:
                    queue_status = self.sync_daemon.get_queue_status()
                    logger.info(f"📦 Queue status: {json.dumps(queue_status, indent=2)}")
                
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            cap.release()
            if self.sync_daemon:
                self.sync_daemon.stop()
            self._print_metrics()
            logger.info("RTSP simulation completed")
    
    def simulate_images(self, image_folder: str, max_frames: int = -1):
        """
        Simulate stream from image folder.
        
        Args:
            image_folder: Path to folder containing images
            max_frames: Maximum frames to process (-1 for infinite)
        """
        logger.info(f"🖼️ Starting image simulation from {image_folder}")
        
        # Get all image files
        image_extensions = ['.jpg', '.jpeg', '.png', '.bmp']
        image_files = []
        
        for ext in image_extensions:
            image_files.extend(Path(image_folder).glob(f"*{ext}"))
            image_files.extend(Path(image_folder).glob(f"*{ext.upper()}"))
        
        if not image_files:
            logger.error(f"No image files found in {image_folder}")
            return
        
        image_files = sorted(image_files)
        logger.info(f"Found {len(image_files)} images")
        
        self.metrics['start_time'] = time.time()
        frame_interval = 1.0 / self.fps_limit
        last_frame_time = time.time()
        image_index = 0
        
        try:
            while True:
                if max_frames > 0 and self.metrics['frame_count'] >= max_frames:
                    logger.info(f"Reached max frames limit: {max_frames}")
                    break
                
                # Load image
                image_path = image_files[image_index]
                frame = cv2.imread(str(image_path))
                
                if frame is None:
                    logger.warning(f"Failed to load image: {image_path}")
                    image_index = (image_index + 1) % len(image_files)
                    continue
                
                # Process frame
                detection = self._process_frame(frame)
                
                # Move to next image
                image_index = (image_index + 1) % len(image_files)
                
                # FPS limiting
                current_time = time.time()
                elapsed = current_time - last_frame_time
                if elapsed < frame_interval:
                    time.sleep(frame_interval - elapsed)
                last_frame_time = current_time
                
                # Print metrics every 100 frames
                if self.metrics['frame_count'] % 100 == 0:
                    self._print_metrics()
                    
                # Print queue status if sync enabled
                if self.sync_daemon and self.metrics['frame_count'] % 100 == 0:
                    queue_status = self.sync_daemon.get_queue_status()
                    logger.info(f"📦 Queue status: {json.dumps(queue_status, indent=2)}")
                
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            if self.sync_daemon:
                self.sync_daemon.stop()
            self._print_metrics()
            logger.info("Image simulation completed")


def main():
    """Main function for CLI execution."""
    parser = argparse.ArgumentParser(
        description="SLOTS Stream Simulator - Testing & Validation Tool"
    )
    
    # Input source (one required)
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--video", type=str, help="Video file path")
    input_group.add_argument("--rtsp", type=str, help="RTSP stream URL")
    input_group.add_argument("--images", type=str, help="Image folder path")
    
    # Configuration
    parser.add_argument("--bay-id", type=str, default="default", help="Parking bay identifier")
    parser.add_argument("--site-id", type=str, default="test-site", help="Site identifier")
    parser.add_argument("--fps", type=int, default=25, help="FPS limit for processing")
    parser.add_argument("--max-frames", type=int, default=-1, help="Max frames to process (-1 for infinite)")
    
    # Vision pipeline
    parser.add_argument("--yolo-model", type=str, default="yolov8n.pt", help="YOLO model path")
    parser.add_argument("--roi-config", type=str, default="vision_engine/roi_config.json", help="ROI config path")
    
    # Sync daemon
    parser.add_argument("--enable-sync", action="store_true", help="Enable edge sync daemon")
    parser.add_argument("--mqtt-broker", type=str, default="localhost", help="MQTT broker address")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="MQTT broker port")
    
    args = parser.parse_args()
    
    # Create simulator
    simulator = StreamSimulator(
        bay_id=args.bay_id,
        site_id=args.site_id,
        yolo_model=args.yolo_model,
        roi_config=args.roi_config,
        fps_limit=args.fps,
        enable_sync=args.enable_sync,
        mqtt_broker=args.mqtt_broker,
        mqtt_port=args.mqtt_port
    )
    
    # Run appropriate simulation
    if args.video:
        simulator.simulate_video(args.video, args.max_frames)
    elif args.rtsp:
        simulator.simulate_rtsp(args.rtsp, args.max_frames)
    elif args.images:
        simulator.simulate_images(args.images, args.max_frames)


if __name__ == "__main__":
    main()