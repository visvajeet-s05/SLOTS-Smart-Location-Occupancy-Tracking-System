"""
SLOTS Data Collection Pipeline - Research Dataset Creation
===========================================================
This tool collects vehicle detection data for academic research.

Features:
- Automatic frame capture based on detection criteria
- Environmental condition logging
- Vehicle type classification
- Research-ready dataset organization

Usage:
    python data_collector.py --site-id CHENNAI-PILOT-01 --output-dataset ./dataset
"""

import sys
import os
import cv2
import json
import logging
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any
import shutil

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from vision_engine.pipeline import SlotsVisionPipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ResearchDataCollector:
    """
    Data collector for research dataset creation.
    
    Collects frames based on specific criteria:
    - Ambiguous detections (15-40% confidence)
    - Environmental variations (weather, lighting)
    - Non-standard vehicles (auto-rickshaws, modified two-wheelers)
    """
    
    def __init__(self, 
                 site_id: str,
                 output_dir: str,
                 yolo_model: str = "yolov8n.pt",
                 roi_config: str = "vision_engine/roi_config.json"):
        """
        Initialize the data collector.
        
        Args:
            site_id: Site identifier
            output_dir: Output directory for dataset
            yolo_model: Path to YOLO model
            roi_config: Path to ROI configuration
        """
        self.site_id = site_id
        self.output_dir = Path(output_dir)
        self.yolo_model = yolo_model
        self.roi_config = roi_config
        
        # Create output directory structure
        self._create_output_structure()
        
        # Initialize vision pipeline
        self.pipeline = SlotsVisionPipeline(
            yolo_model_path=yolo_model,
            roi_config_path=roi_config,
            ocr_enabled=True,
            vlm_enabled=True
        )
        
        # Collection statistics
        self.stats = {
            'total_frames': 0,
            'ambiguous_frames': 0,
            'weather_frames': 0,
            'non_standard_frames': 0,
            'collected_frames': 0
        }
        
        # Environmental conditions
        self.current_conditions = {
            'lighting': 'unknown',
            'weather': 'unknown',
            'time_of_day': 'unknown'
        }
    
    def _create_output_structure(self):
        """Create dataset directory structure."""
        dirs = [
            self.output_dir / 'raw' / 'cars',
            self.output_dir / 'raw' / 'two_wheelers',
            self.output_dir / 'raw' / 'auto_rickshaws',
            self.output_dir / 'raw' / 'empty',
            self.output_dir / 'annotations',
            self.output_dir / 'metadata'
        ]
        
        for dir_path in dirs:
            dir_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Created dataset structure at: {self.output_dir}")
    
    def _should_collect_frame(self, detection: Dict[str, Any]) -> bool:
        """
        Determine if frame should be collected based on research criteria.
        
        Args:
            detection: Detection result from vision pipeline
            
        Returns:
            True if frame meets collection criteria
        """
        confidence = detection.get('confidence', 0.0)
        vlm_triggered = detection.get('vlm_fallback_triggered', False)
        status = detection.get('status', 'AVAILABLE')
        
        # Collect ambiguous detections (15-40% confidence)
        if 0.15 <= confidence < 0.40:
            self.stats['ambiguous_frames'] += 1
            return True
        
        # Collect VLM-triggered frames
        if vlm_triggered:
            return True
        
        # Collect during adverse environmental conditions
        if self.current_conditions['lighting'] in ['dusk', 'dawn', 'glare']:
            self.stats['weather_frames'] += 1
            return True
        
        if self.current_conditions['weather'] in ['rain', 'fog', 'dust']:
            self.stats['weather_frames'] += 1
            return True
        
        # Collect non-standard vehicles (would need additional detection)
        # This is a placeholder - would need specific detection logic
        if detection.get('plate_number') and 'AUTO' in detection.get('plate_number', ''):
            self.stats['non_standard_frames'] += 1
            return True
        
        return False
    
    def _save_frame(self, frame: Any, detection: Dict[str, Any], bay_id: str):
        """
        Save frame to appropriate directory with metadata.
        
        Args:
            frame: Image frame
            detection: Detection result
            bay_id: Parking bay identifier
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        status = detection.get('status', 'UNKNOWN')
        
        # Determine output directory based on status
        if status == 'OCCUPIED':
            # Simple classification based on plate pattern (would need actual detection)
            plate = detection.get('plate_number', '')
            if 'AUTO' in plate:
                subdir = 'auto_rickshaws'
            elif len(plate) <= 8:  # Likely two-wheeler
                subdir = 'two_wheelers'
            else:
                subdir = 'cars'
        else:
            subdir = 'empty'
        
        # Save frame
        filename = f"{self.site_id}_{bay_id}_{timestamp}.jpg"
        output_path = self.output_dir / 'raw' / subdir / filename
        cv2.imwrite(str(output_path), frame)
        
        # Save metadata
        metadata = {
            'filename': filename,
            'site_id': self.site_id,
            'bay_id': bay_id,
            'timestamp': timestamp,
            'status': status,
            'confidence': detection.get('confidence', 0.0),
            'plate_number': detection.get('plate_number'),
            'vlm_triggered': detection.get('vlm_fallback_triggered', False),
            'environmental_conditions': self.current_conditions.copy(),
            'bbox': detection.get('bbox')
        }
        
        metadata_filename = f"{self.site_id}_{bay_id}_{timestamp}.json"
        metadata_path = self.output_dir / 'metadata' / metadata_filename
        
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        self.stats['collected_frames'] += 1
        logger.info(f"Saved frame: {filename} ({subdir})")
    
    def _detect_environmental_conditions(self, frame: Any) -> Dict[str, str]:
        """
        Detect environmental conditions from frame.
        
        Args:
            frame: Input frame
            
        Returns:
            Dictionary with lighting, weather, time of day
        """
        # Simple heuristic-based detection
        # In production, use actual sensors or more sophisticated analysis
        
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = gray.mean()
        
        conditions = {
            'lighting': 'normal',
            'weather': 'clear',
            'time_of_day': 'unknown'
        }
        
        # Detect lighting conditions
        if brightness < 50:
            conditions['lighting'] = 'night'
        elif brightness < 100:
            conditions['lighting'] = 'dusk'
        elif brightness > 200:
            conditions['lighting'] = 'glare'
        else:
            conditions['lighting'] = 'normal'
        
        # Detect time of day from timestamp
        hour = datetime.now().hour
        if 5 <= hour < 7:
            conditions['time_of_day'] = 'dawn'
        elif 7 <= hour < 17:
            conditions['time_of_day'] = 'day'
        elif 17 <= hour < 19:
            conditions['time_of_day'] = 'dusk'
        else:
            conditions['time_of_day'] = 'night'
        
        # Weather would need external sensors or advanced image analysis
        # For now, assume clear unless manually set
        conditions['weather'] = 'clear'
        
        return conditions
    
    def collect_from_camera(self, camera_source: str, bay_id: str, max_frames: int = 100):
        """
        Collect data from camera source.
        
        Args:
            camera_source: Camera source (RTSP URL or device ID)
            bay_id: Parking bay identifier
            max_frames: Maximum frames to collect
        """
        logger.info(f"Starting data collection from {camera_source}")
        
        cap = cv2.VideoCapture(camera_source)
        if not cap.isOpened():
            logger.error(f"Failed to open camera: {camera_source}")
            return
        
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        collected_count = 0
        
        try:
            while collected_count < max_frames:
                ret, frame = cap.read()
                if not ret:
                    logger.warning("Failed to read frame, retrying...")
                    time.sleep(0.1)
                    continue
                
                # Detect environmental conditions
                self.current_conditions = self._detect_environmental_conditions(frame)
                
                # Run vision pipeline
                detection = self.pipeline.process_frame(frame, bay_id)
                
                self.stats['total_frames'] += 1
                
                # Check if frame should be collected
                if self._should_collect_frame(detection):
                    self._save_frame(frame, detection, bay_id)
                    collected_count += 1
                
                # Small delay to prevent overwhelming storage
                time.sleep(0.1)
                
        except KeyboardInterrupt:
            logger.info("Data collection interrupted by user")
        finally:
            cap.release()
        
        logger.info(f"Data collection completed. Collected {collected_count}/{max_frames} frames")
        self._save_collection_stats()
    
    def _save_collection_stats(self):
        """Save collection statistics."""
        stats_path = self.output_dir / 'collection_stats.json'
        
        stats_data = {
            'site_id': self.site_id,
            'collection_date': datetime.now().isoformat(),
            'statistics': self.stats,
            'environmental_conditions': self.current_conditions
        }
        
        with open(stats_path, 'w') as f:
            json.dump(stats_data, f, indent=2)
        
        logger.info(f"Collection statistics saved to: {stats_path}")


def main():
    parser = argparse.ArgumentParser(description="SLOTS Research Data Collector")
    
    parser.add_argument("--site-id", type=str, required=True, help="Site identifier")
    parser.add_argument("--camera", type=str, required=True, help="Camera source (RTSP URL or device ID)")
    parser.add_argument("--bay-id", type=str, default="BAY-A-101", help="Parking bay identifier")
    parser.add_argument("--output-dataset", type=str, default="./dataset", help="Output dataset directory")
    parser.add_argument("--max-frames", type=int, default=100, help="Maximum frames to collect")
    parser.add_argument("--yolo-model", type=str, default="yolov8n.pt", help="YOLO model path")
    parser.add_argument("--roi-config", type=str, default="vision_engine/roi_config.json", help="ROI config path")
    
    args = parser.parse_args()
    
    # Create data collector
    collector = ResearchDataCollector(
        site_id=args.site_id,
        output_dir=args.output_dataset,
        yolo_model=args.yolo_model,
        roi_config=args.roi_config
    )
    
    # Start collection
    collector.collect_from_camera(args.camera, args.bay_id, args.max_frames)


if __name__ == "__main__":
    main()