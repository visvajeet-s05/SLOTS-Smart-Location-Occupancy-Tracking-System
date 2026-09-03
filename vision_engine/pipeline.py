"""
SLOTS Vision Engine - Two-Stage ALPR & VLM Pipeline
=====================================================
This module implements a two-stage computer vision pipeline for smart parking:
1. YOLOv8 for vehicle detection with confidence-based classification
2. PaddleOCR for license plate recognition on high-confidence detections
3. VLM fallback for ambiguous detections (15-40% confidence range)

Requirements:
- OpenCV for image processing
- Ultralytics YOLOv8 for vehicle detection
- PaddleOCR for license plate recognition
- VLM API integration for ambiguous case resolution
"""

import cv2
import numpy as np
import json
import logging
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    """Data class for vehicle detection results."""
    bay_id: str
    status: str  # OCCUPIED, AVAILABLE, RESERVED
    confidence: float
    plate_number: Optional[str]
    vlm_fallback_triggered: bool
    timestamp: str
    bbox: Optional[Tuple[int, int, int, int]] = None  # x1, y1, x2, y2
    status_changed: bool = False  # Track if status changed from previous


class SlotsVisionPipeline:
    """
    Main inference engine for SLOTS parking vision pipeline.
    
    This class implements:
    - YOLOv8 vehicle detection within ROI polygons
    - Confidence-based classification (>=40%: OCCUPIED, <15%: AVAILABLE)
    - PaddleOCR license plate recognition for occupied bays
    - VLM fallback for ambiguous detections (15-40% confidence)
    """
    
    def __init__(self, 
                 yolo_model_path: str = "yolov8n.pt",
                 roi_config_path: str = "vision_engine/roi_config.json",
                 ocr_enabled: bool = True,
                 vlm_enabled: bool = True):
        """
        Initialize the vision pipeline.
        
        Args:
            yolo_model_path: Path to YOLOv8 model weights
            roi_config_path: Path to ROI configuration JSON file
            ocr_enabled: Enable PaddleOCR for plate recognition
            vlm_enabled: Enable VLM fallback for ambiguous detections
        """
        self.yolo_model_path = yolo_model_path
        self.roi_config_path = roi_config_path
        self.ocr_enabled = ocr_enabled
        self.vlm_enabled = vlm_enabled
        
        # Confidence thresholds
        self.HIGH_CONFIDENCE_THRESHOLD = 0.40
        self.AMBIGUOUS_MIN_THRESHOLD = 0.15
        self.AMBIGUOUS_MAX_THRESHOLD = 0.40
        
        # Load models and configuration
        self.model = None
        self.roi_polygons = {}
        self.ocr_engine = None
        
        self._initialize_models()
        self._load_roi_config()
        
    def _initialize_models(self):
        """Initialize YOLOv8 and OCR models."""
        try:
            from ultralytics import YOLO
            logger.info(f"Loading YOLOv8 model from {self.yolo_model_path}")
            self.model = YOLO(self.yolo_model_path)
            logger.info("YOLOv8 model loaded successfully")
        except ImportError:
            logger.error("Ultralytics YOLO not installed. Run: pip install ultralytics")
            raise
        except Exception as e:
            logger.error(f"Failed to load YOLOv8 model: {e}")
            raise
            
        # Initialize PaddleOCR if enabled
        if self.ocr_enabled:
            try:
                from paddleocr import PaddleOCR
                logger.info("Initializing PaddleOCR")
                self.ocr_engine = PaddleOCR(use_angle_cls=True, lang='en')
                logger.info("PaddleOCR initialized successfully")
            except ImportError:
                logger.warning("PaddleOCR not installed. OCR features disabled.")
                self.ocr_enabled = False
            except Exception as e:
                logger.warning(f"Failed to initialize PaddleOCR: {e}. OCR features disabled.")
                self.ocr_enabled = False
    
    def _load_roi_config(self):
        """Load ROI polygon configuration from JSON file."""
        try:
            config_path = Path(self.roi_config_path)
            if config_path.exists():
                with open(config_path, 'r') as f:
                    config = json.load(f)
                    self.roi_polygons = config.get("roi_polygons", {})
                logger.info(f"Loaded {len(self.roi_polygons)} ROI polygons from config")
            else:
                logger.warning(f"ROI config file not found at {self.roi_config_path}. Using default full-frame ROI.")
                # Default to full-frame ROI
                self.roi_polygons = {
                    "default": [[0, 0], [1920, 0], [1920, 1080], [0, 1080]]
                }
        except Exception as e:
            logger.error(f"Failed to load ROI config: {e}. Using default full-frame ROI.")
            self.roi_polygons = {
                "default": [[0, 0], [1920, 0], [1920, 1080], [0, 1080]]
            }
    
    def _point_in_polygon(self, point: Tuple[float, float], polygon: List[Tuple[float, float]]) -> bool:
        """
        Check if a point is inside a polygon using ray casting algorithm.
        
        Args:
            point: (x, y) coordinates to check
            polygon: List of (x, y) polygon vertices
            
        Returns:
            True if point is inside polygon, False otherwise
        """
        x, y = point
        n = len(polygon)
        inside = False
        
        p1x, p1y = polygon[0]
        for i in range(n + 1):
            p2x, p2y = polygon[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
            
        return inside
    
    def _calculate_iou(self, box1: Tuple[int, int, int, int], box2: Tuple[int, int, int, int]) -> float:
        """
        Calculate Intersection over Union (IoU) between two bounding boxes.
        
        Args:
            box1: (x1, y1, x2, y2) first bounding box
            box2: (x1, y1, x2, y2) second bounding box
            
        Returns:
            IoU score between 0 and 1
        """
        x1_1, y1_1, x2_1, y2_1 = box1
        x1_2, y1_2, x2_2, y2_2 = box2
        
        # Calculate intersection coordinates
        x1_i = max(x1_1, x1_2)
        y1_i = max(y1_1, y1_2)
        x2_i = min(x2_1, x2_2)
        y2_i = min(y2_1, y2_2)
        
        # Calculate intersection area
        intersection_area = max(0, x2_i - x1_i) * max(0, y2_i - y1_i)
        
        # Calculate union area
        box1_area = (x2_1 - x1_1) * (y2_1 - y1_1)
        box2_area = (x2_2 - x1_2) * (y2_2 - y1_2)
        union_area = box1_area + box2_area - intersection_area
        
        # Calculate IoU
        iou = intersection_area / union_area if union_area > 0 else 0.0
        
        return iou
    
    def _detect_vehicles_in_roi(self, frame: np.ndarray, roi_polygon: List[Tuple[float, float]]) -> List[Dict]:
        """
        Detect vehicles within a specific ROI polygon.
        
        Args:
            frame: Input image frame
            roi_polygon: ROI polygon coordinates
            
        Returns:
            List of detection dictionaries with bbox, confidence, and class
        """
        if self.model is None:
            logger.error("YOLO model not initialized")
            return []
        
        # Run YOLO inference
        results = self.model(frame, verbose=False)
        
        detections = []
        
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
                
            for box in boxes:
                # Get box coordinates and confidence
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                confidence = float(box.conf[0].cpu().numpy())
                class_id = int(box.cls[0].cpu().numpy())
                
                # Check if detection is a vehicle (COCO classes: car=2, motorcycle=3, bus=5, truck=7)
                vehicle_classes = [2, 3, 5, 7]
                if class_id not in vehicle_classes:
                    continue
                
                # Calculate box center
                center_x = (x1 + x2) / 2
                center_y = (y1 + y2) / 2
                
                # Check if vehicle center is within ROI polygon
                if self._point_in_polygon((center_x, center_y), roi_polygon):
                    detections.append({
                        'bbox': (int(x1), int(y1), int(x2), int(y2)),
                        'confidence': confidence,
                        'class_id': class_id,
                        'center': (center_x, center_y)
                    })
        
        return detections
    
    def _extract_plate_number(self, vehicle_crop: np.ndarray) -> Optional[str]:
        """
        Extract license plate number from vehicle image using PaddleOCR.
        
        Args:
            vehicle_crop: Cropped image containing the vehicle
            
        Returns:
            Detected license plate number or None if not found
        """
        if not self.ocr_enabled or self.ocr_engine is None:
            logger.debug("OCR disabled or not initialized")
            return None
        
        try:
            # Run PaddleOCR on the vehicle crop
            result = self.ocr_engine.ocr(vehicle_crop, cls=True)
            
            if result and result[0]:
                # Extract text from OCR results
                plate_texts = []
                for line in result[0]:
                    text = line[1][0]
                    confidence = line[1][1]
                    
                    # Filter for license plate-like patterns (alphanumeric with dashes)
                    if confidence > 0.6 and any(c.isalnum() for c in text):
                        plate_texts.append(text)
                
                if plate_texts:
                    # Return the most confident plate text
                    return plate_texts[0].upper()
                    
        except Exception as e:
            logger.warning(f"OCR extraction failed: {e}")
        
        return None
    
    def _resolve_with_vlm(self, frame: np.ndarray, bay_id: str) -> bool:
        """
        Resolve ambiguous detection using Vision-Language Model.
        
        Integrates with OpenAI GPT-4o-mini or Ollama for vision analysis.
        
        Args:
            frame: Input image frame
            bay_id: Parking bay identifier
            
        Returns:
            True if vehicle is present, False otherwise
        """
        if not self.vlm_enabled:
            logger.debug("VLM fallback disabled")
            return False
        
        try:
            import os
            import base64
            import requests
            from io import BytesIO
            from PIL import Image
            
            # Convert numpy array to PIL Image
            pil_image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            
            # Convert to base64
            buffered = BytesIO()
            pil_image.save(buffered, format="JPEG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            
            # Try OpenAI API first if key is available
            openai_key = os.getenv("OPENAI_API_KEY")
            if openai_key:
                logger.info(f"Using OpenAI GPT-4o-mini for VLM analysis of bay {bay_id}")
                return self._call_openai_vlm(img_str, bay_id)
            
            # Fall back to Ollama if configured
            ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
            if ollama_url:
                logger.info(f"Using Ollama for VLM analysis of bay {bay_id}")
                return self._call_ollama_vlm(pil_image, bay_id, ollama_url)
            
            # No VLM service configured, use fallback
            logger.warning("No VLM service configured (OPENAI_API_KEY or OLLAMA_URL not set)")
            logger.info(f"VLM fallback triggered for bay {bay_id} - Using fallback logic")
            
            # Fallback: use heuristics based on image properties
            return self._vlm_fallback_heuristics(frame, bay_id)
            
        except Exception as e:
            logger.error(f"VLM resolution failed: {e}")
            return False
    
    def _call_openai_vlm(self, img_base64: str, bay_id: str) -> bool:
        """Call OpenAI GPT-4o-mini for vision analysis."""
        try:
            import os
            import requests
            
            openai_key = os.getenv("OPENAI_API_KEY")
            if not openai_key:
                raise ValueError("OPENAI_API_KEY not set")
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {openai_key}"
            }
            
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Is there a vehicle parked in this parking slot? Answer strictly YES or NO with no additional text."
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{img_base64}"
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": 10
            }
            
            response = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result["choices"][0]["message"]["content"].strip().upper()
                logger.info(f"OpenAI VLM response for bay {bay_id}: {content}")
                return "YES" in content
            else:
                logger.error(f"OpenAI API error: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"OpenAI VLM call failed: {e}")
            return False
    
    def _call_ollama_vlm(self, pil_image, bay_id: str, ollama_url: str) -> bool:
        """Call Ollama for vision analysis."""
        try:
            import os
            import requests
            from io import BytesIO
            
            # Convert PIL image to bytes
            buffered = BytesIO()
            pil_image.save(buffered, format="JPEG")
            image_bytes = buffered.getvalue()
            
            # Call Ollama API
            response = requests.post(
                f"{ollama_url}/api/generate",
                json={
                    "model": os.getenv("OLLAMA_MODEL", "llava"),
                    "prompt": "Is there a vehicle parked in this parking slot? Answer strictly YES or NO.",
                    "images": [image_bytes.hex()],
                    "stream": False
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result.get("response", "").strip().upper()
                logger.info(f"Ollama VLM response for bay {bay_id}: {content}")
                return "YES" in content
            else:
                logger.error(f"Ollama API error: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Ollama VLM call failed: {e}")
            return False
    
    def _vlm_fallback_heuristics(self, frame: np.ndarray, bay_id: str) -> bool:
        """
        Fallback heuristics when VLM API is not available.
        Uses basic image analysis to make an educated guess.
        """
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Apply edge detection
            edges = cv2.Canny(gray, 50, 150)
            
            # Count edge pixels
            edge_count = cv2.countNonZero(edges)
            total_pixels = frame.shape[0] * frame.shape[1]
            edge_ratio = edge_count / total_pixels
            
            # Calculate variance as a measure of complexity
            variance = cv2.Laplacian(gray, cv2.CV_64F).var()
            
            # Heuristic: if edge ratio and variance are above thresholds, likely occupied
            edge_threshold = 0.02  # 2% of pixels should be edges
            variance_threshold = 100  # Minimum variance threshold
            
            logger.info(f"VLM fallback heuristics for bay {bay_id}: edge_ratio={edge_ratio:.4f}, variance={variance:.2f}")
            
            if edge_ratio > edge_threshold and variance > variance_threshold:
                logger.info(f"VLM fallback: bay {bay_id} classified as OCCUPIED")
                return True
            else:
                logger.info(f"VLM fallback: bay {bay_id} classified as AVAILABLE")
                return False
                
        except Exception as e:
            logger.error(f"VLM fallback heuristics failed: {e}")
            return False
    
    def process_frame(self, frame: np.ndarray, bay_id: str = "default", previous_status: str = None) -> Dict[str, Any]:
        """
        Process a single frame through the complete vision pipeline.
        
        Args:
            frame: Input image frame (numpy array)
            bay_id: Parking bay identifier for ROI lookup
            previous_status: Previous status for change detection
            
        Returns:
            DetectionResult dictionary with all analysis results
        """
        if frame is None or frame.size == 0:
            logger.error("Invalid frame provided")
            return self._create_error_result(bay_id, "Invalid frame")
        
        try:
            # Get ROI polygon for this bay
            roi_polygon = self.roi_polygons.get(bay_id, self.roi_polygons.get("default"))
            
            if not roi_polygon:
                logger.warning(f"No ROI found for bay {bay_id}, using default")
                roi_polygon = self.roi_polygons.get("default", [[0, 0], [1920, 0], [1920, 1080], [0, 1080]])
            
            # Detect vehicles in ROI
            detections = self._detect_vehicles_in_roi(frame, roi_polygon)
            
            # Determine status based on detection confidence
            if not detections:
                # No vehicles detected
                current_status = "AVAILABLE"
                result = DetectionResult(
                    bay_id=bay_id,
                    status=current_status,
                    confidence=0.0,
                    plate_number=None,
                    vlm_fallback_triggered=False,
                    timestamp=datetime.now().isoformat(),
                    status_changed=(previous_status != current_status)
                )
            else:
                # Get the highest confidence detection
                best_detection = max(detections, key=lambda x: x['confidence'])
                confidence = best_detection['confidence']
                bbox = best_detection['bbox']
                
                if confidence >= self.HIGH_CONFIDENCE_THRESHOLD:
                    # High confidence - classify as OCCUPIED
                    logger.info(f"High confidence detection ({confidence:.2f}) for bay {bay_id}")
                    
                    # Extract license plate
                    vehicle_crop = frame[bbox[1]:bbox[3], bbox[0]:bbox[2]]
                    plate_number = self._extract_plate_number(vehicle_crop)
                    
                    current_status = "OCCUPIED"
                    result = DetectionResult(
                        bay_id=bay_id,
                        status=current_status,
                        confidence=confidence,
                        plate_number=plate_number,
                        vlm_fallback_triggered=False,
                        timestamp=datetime.now().isoformat(),
                        bbox=bbox,
                        status_changed=(previous_status != current_status)
                    )
                    
                elif self.AMBIGUOUS_MIN_THRESHOLD <= confidence < self.AMBIGUOUS_MAX_THRESHOLD:
                    # Ambiguous detection - trigger VLM fallback
                    logger.info(f"Ambiguous detection ({confidence:.2f}) for bay {bay_id} - triggering VLM fallback")
                    
                    # Run VLM analysis
                    vlm_result = self._resolve_with_vlm(frame, bay_id)
                    
                    if vlm_result:
                        # VLM confirmed vehicle presence
                        vehicle_crop = frame[bbox[1]:bbox[3], bbox[0]:bbox[2]]
                        plate_number = self._extract_plate_number(vehicle_crop)
                        
                        current_status = "OCCUPIED"
                        result = DetectionResult(
                            bay_id=bay_id,
                            status=current_status,
                            confidence=confidence,
                            plate_number=plate_number,
                            vlm_fallback_triggered=True,
                            timestamp=datetime.now().isoformat(),
                            bbox=bbox,
                            status_changed=(previous_status != current_status)
                        )
                    else:
                        # VLM confirmed no vehicle
                        current_status = "AVAILABLE"
                        result = DetectionResult(
                            bay_id=bay_id,
                            status=current_status,
                            confidence=confidence,
                            plate_number=None,
                            vlm_fallback_triggered=True,
                            timestamp=datetime.now().isoformat(),
                            bbox=bbox,
                            status_changed=(previous_status != current_status)
                        )
                else:
                    # Low confidence - classify as AVAILABLE
                    logger.info(f"Low confidence detection ({confidence:.2f}) for bay {bay_id}")
                    current_status = "AVAILABLE"
                    result = DetectionResult(
                        bay_id=bay_id,
                        status=current_status,
                        confidence=confidence,
                        plate_number=None,
                        vlm_fallback_triggered=False,
                        timestamp=datetime.now().isoformat(),
                        bbox=bbox,
                        status_changed=(previous_status != current_status)
                    )
            
            return asdict(result)
            
        except Exception as e:
            logger.error(f"Frame processing failed for bay {bay_id}: {e}")
            return self._create_error_result(bay_id, str(e))
    
    def _create_error_result(self, bay_id: str, error_message: str) -> Dict[str, Any]:
        """Create an error result when processing fails."""
        return {
            "bay_id": bay_id,
            "status": "ERROR",
            "confidence": 0.0,
            "plate_number": None,
            "vlm_fallback_triggered": False,
            "timestamp": datetime.now().isoformat(),
            "error": error_message
        }
    
    def process_rtsp_stream(self, rtsp_url: str, bay_id: str = "default", 
                           frame_callback=None, max_frames: int = -1):
        """
        Process RTSP stream frame by frame.
        
        Args:
            rtsp_url: RTSP stream URL
            bay_id: Parking bay identifier
            frame_callback: Optional callback function for each processed frame
            max_frames: Maximum number of frames to process (-1 for infinite)
        """
        logger.info(f"Starting RTSP stream processing for bay {bay_id}")
        
        cap = cv2.VideoCapture(rtsp_url)
        frame_count = 0
        
        try:
            while cap.isOpened() and (max_frames == -1 or frame_count < max_frames):
                ret, frame = cap.read()
                
                if not ret:
                    logger.warning("Failed to read frame from RTSP stream")
                    break
                
                # Process frame
                result = self.process_frame(frame, bay_id)
                
                # Call callback if provided
                if frame_callback:
                    frame_callback(result, frame)
                
                frame_count += 1
                
                # Small delay to prevent CPU overload
                cv2.waitKey(1)
                
        except KeyboardInterrupt:
            logger.info("Stream processing interrupted by user")
        except Exception as e:
            logger.error(f"Stream processing error: {e}")
        finally:
            cap.release()
            logger.info(f"RTSP stream processing completed. Processed {frame_count} frames")


def main():
    """Main function for testing the vision pipeline."""
    import argparse
    
    parser = argparse.ArgumentParser(description="SLOTS Vision Pipeline")
    parser.add_argument("--image", type=str, help="Path to test image")
    parser.add_argument("--video", type=str, help="Path to test video")
    parser.add_argument("--rtsp", type=str, help="RTSP stream URL")
    parser.add_argument("--bay-id", type=str, default="default", help="Parking bay ID")
    parser.add_argument("--yolo-model", type=str, default="yolov8n.pt", help="YOLO model path")
    parser.add_argument("--roi-config", type=str, default="vision_engine/roi_config.json", help="ROI config path")
    
    args = parser.parse_args()
    
    # Initialize pipeline
    pipeline = SlotsVisionPipeline(
        yolo_model_path=args.yolo_model,
        roi_config_path=args.roi_config
    )
    
    # Process based on input type
    if args.image:
        logger.info(f"Processing image: {args.image}")
        frame = cv2.imread(args.image)
        result = pipeline.process_frame(frame, args.bay_id)
        print(json.dumps(result, indent=2))
        
    elif args.video:
        logger.info(f"Processing video: {args.video}")
        pipeline.process_rtsp_stream(args.video, args.bay_id, max_frames=100)
        
    elif args.rtsp:
        logger.info(f"Processing RTSP stream: {args.rtsp}")
        pipeline.process_rtsp_stream(args.rtsp, args.bay_id)
        
    else:
        logger.error("No input provided. Use --image, --video, or --rtsp")


if __name__ == "__main__":
    main()