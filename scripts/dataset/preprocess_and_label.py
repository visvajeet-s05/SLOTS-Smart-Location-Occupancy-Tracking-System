#!/usr/bin/env python3
"""
Dataset Preprocessing & Auto-Labeling Pipeline
Loads raw video frames/images, applies CLAHE preprocessing, and generates YOLO-format annotations
using pretrained models for Indian mixed-vehicle parking dataset.
"""

import os
import cv2
import numpy as np
import json
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from collections import defaultdict
import shutil

try:
    from ultralytics import YOLO
    from segment_anything import sam_model_registry, SamPredictor
    SAM_AVAILABLE = True
except ImportError:
    SAM_AVAILABLE = False
    print("Warning: SAM not available, using YOLO-only labeling")

# Class definitions for Indian mixed-vehicle parking
CLASS_NAMES = {
    0: "car",
    1: "two_wheeler",
    2: "auto_rickshaw",
    3: "LCV"
}

CLASS_MAPPING = {
    "car": 0,
    "motorcycle": 1,
    "scooter": 1,
    "two_wheeler": 1,
    "auto_rickshaw": 2,
    "autorickshaw": 2,
    "truck": 3,
    "LCV": 3,
    "light_commercial_vehicle": 3,
    "mini_truck": 3
}

@dataclass
class Detection:
    class_id: int
    x_center: float
    y_center: float
    width: float
    height: float
    confidence: float

@dataclass
class FrameAnnotation:
    image_path: str
    label_path: str
    detections: List[Detection]
    environmental_condition: str
    quality_score: float

class DatasetPreprocessor:
    def __init__(
        self,
        raw_frames_dir: str = "data/raw_frames",
        output_dir: str = "data/processed",
        yolo_model_path: str = "yolov8x.pt",
        use_sam: bool = False,
        clahe_clip_limit: float = 2.0,
        clahe_tile_size: int = 8
    ):
        self.raw_frames_dir = Path(raw_frames_dir)
        self.output_dir = Path(output_dir)
        self.yolo_model_path = yolo_model_path
        self.use_sam = use_sam and SAM_AVAILABLE
        self.clahe_clip_limit = clahe_clip_limit
        self.clahe_tile_size = clahe_tile_size
        
        # Create output directories
        self.images_dir = self.output_dir / "images"
        self.labels_dir = self.output_dir / "labels"
        self.ambiguous_dir = self.output_dir / "ambiguous"
        
        for dir_path in [self.images_dir, self.labels_dir, self.ambiguous_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
        
        # Load YOLO model
        print(f"Loading YOLO model: {yolo_model_path}")
        self.yolo_model = YOLO(yolo_model_path)
        
        # Load SAM if requested
        self.sam_predictor = None
        if self.use_sam:
            print("Loading SAM model...")
            sam_checkpoint = "sam_vit_h_4b8939.pth"
            sam = sam_model_registry["vit_h"](checkpoint=sam_checkpoint)
            self.sam_predictor = SamPredictor(sam)
        
        # Statistics
        self.stats = defaultdict(int)
        self.ambiguous_frames = []
    
    def apply_clahe(self, image: np.ndarray) -> np.ndarray:
        """Apply CLAHE preprocessing for low-light/monsoon/glare frames."""
        # Convert to LAB color space
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        # Apply CLAHE to L channel
        clahe = cv2.createCLAHE(clipLimit=self.clahe_clip_limit, tileGridSize=(self.clahe_tile_size, self.clahe_tile_size))
        l = clahe.apply(l)
        
        # Merge channels and convert back
        lab = cv2.merge([l, a, b])
        image_clahe = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        
        return image_clahe
    
    def detect_environmental_condition(self, image: np.ndarray) -> str:
        """Detect environmental condition from image brightness."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        brightness = np.mean(gray)
        
        if brightness < 50:
            return "night_low_light"
        elif brightness > 200:
            return "monsoon_glare"
        else:
            return "daylight_clear"
    
    def detect_with_yolo(self, image: np.ndarray) -> List[Detection]:
        """Run YOLO detection and map to our class schema."""
        results = self.yolo_model(image, verbose=False)
        detections = []
        
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            
            for box in boxes:
                # Get class name
                class_name = self.yolo_model.names[int(box.cls[0])]
                
                # Map to our class schema
                class_id = CLASS_MAPPING.get(class_name.lower())
                if class_id is None:
                    continue
                
                # Get bounding box coordinates (normalized)
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                confidence = float(box.conf[0])
                
                # Convert to YOLO format (x_center, y_center, width, height)
                img_h, img_w = image.shape[:2]
                x_center = (x1 + x2) / 2 / img_w
                y_center = (y1 + y2) / 2 / img_h
                width = (x2 - x1) / img_w
                height = (y2 - y1) / img_h
                
                detections.append(Detection(
                    class_id=class_id,
                    x_center=x_center,
                    y_center=y_center,
                    width=width,
                    height=height,
                    confidence=confidence
                ))
        
        return detections
    
    def refine_with_sam(self, image: np.ndarray, detections: List[Detection]) -> List[Detection]:
        """Refine detections using SAM for better bounding box accuracy."""
        if self.sam_predictor is None:
            return detections
        
        self.sam_predictor.set_image(image)
        refined_detections = []
        
        for det in detections:
            # Convert normalized coordinates to pixel coordinates
            img_h, img_w = image.shape[:2]
            x1 = int((det.x_center - det.width / 2) * img_w)
            y1 = int((det.y_center - det.height / 2) * img_h)
            x2 = int((det.x_center + det.width / 2) * img_w)
            y2 = int((det.y_center + det.height / 2) * img_h)
            
            # Run SAM refinement
            masks, _, _ = self.sam_predictor.predict(
                point_coords=np.array([[x1, y1], [x2, y2]]),
                point_labels=np.array([1, 1]),
                box=np.array([x1, y1, x2, y2]),
                multimask_output=False
            )
            
            if masks is not None and len(masks) > 0:
                mask = masks[0]
                # Find bounding box of mask
                rows = np.any(mask, axis=1)
                cols = np.any(mask, axis=0)
                y1_new, y2_new = np.where(rows)[0][[0, -1]]
                x1_new, x2_new = np.where(cols)[0][[0, -1]]
                
                # Update detection
                det.x_center = (x1_new + x2_new) / 2 / img_w
                det.y_center = (y1_new + y2_new) / 2 / img_h
                det.width = (x2_new - x1_new) / img_w
                det.height = (y2_new - y1_new) / img_h
            
            refined_detections.append(det)
        
        return refined_detections
    
    def calculate_quality_score(self, detections: List[Detection]) -> float:
        """Calculate overall quality score based on detection confidence."""
        if not detections:
            return 0.0
        
        avg_confidence = np.mean([d.confidence for d in detections])
        return avg_confidence
    
    def save_yolo_annotation(self, label_path: Path, detections: List[Detection]):
        """Save detections in YOLO format."""
        with open(label_path, 'w') as f:
            for det in detections:
                f.write(f"{det.class_id} {det.x_center:.6f} {det.y_center:.6f} {det.width:.6f} {det.height:.6f}\n")
    
    def process_frame(self, image_path: Path) -> Optional[FrameAnnotation]:
        """Process a single frame."""
        # Load image
        image = cv2.imread(str(image_path))
        if image is None:
            print(f"Warning: Could not load image {image_path}")
            return None
        
        # Apply CLAHE preprocessing
        image_processed = self.apply_clahe(image)
        
        # Detect environmental condition
        env_condition = self.detect_environmental_condition(image_processed)
        
        # Run YOLO detection
        detections = self.detect_with_yolo(image_processed)
        
        # Refine with SAM if enabled
        if self.use_sam:
            detections = self.refine_with_sam(image_processed, detections)
        
        # Calculate quality score
        quality_score = self.calculate_quality_score(detections)
        
        # Check for ambiguous frames (confidence between 0.15 and 0.40)
        low_conf_detections = [d for d in detections if 0.15 <= d.confidence <= 0.40]
        is_ambiguous = len(low_conf_detections) > 0
        
        # Determine output paths
        output_image_name = image_path.name
        output_image_path = self.images_dir / output_image_name
        output_label_path = self.labels_dir / output_image_name.replace(image_path.suffix, ".txt")
        
        # Save processed image
        cv2.imwrite(str(output_image_path), image_processed)
        
        # Save annotation
        self.save_yolo_annotation(output_label_path, detections)
        
        # Update statistics
        self.stats["total_frames"] += 1
        self.stats[env_condition] += 1
        for det in detections:
            self.stats[f"class_{det.class_id}"] += 1
        
        # Flag ambiguous frames
        if is_ambiguous:
            self.ambiguous_frames.append(str(image_path))
            # Copy to ambiguous directory for manual review
            shutil.copy(str(image_path), self.ambiguous_dir / output_image_name)
            shutil.copy(str(output_label_path), self.ambiguous_dir / output_label_path.replace(image_path.suffix, ".txt"))
        
        return FrameAnnotation(
            image_path=str(output_image_path),
            label_path=str(output_label_path),
            detections=detections,
            environmental_condition=env_condition,
            quality_score=quality_score
        )
    
    def process_dataset(self):
        """Process all frames in the raw frames directory."""
        print(f"Processing frames from {self.raw_frames_dir}")
        
        # Find all image files
        image_extensions = ['.jpg', '.jpeg', '.png', '.bmp']
        image_files = []
        for ext in image_extensions:
            image_files.extend(self.raw_frames_dir.glob(f"*{ext}"))
            image_files.extend(self.raw_frames_dir.glob(f"*{ext.upper()}"))
        
        if not image_files:
            print(f"No images found in {self.raw_frames_dir}")
            return
        
        print(f"Found {len(image_files)} images to process")
        
        # Process each frame
        for i, image_path in enumerate(image_files, 1):
            print(f"Processing {i}/{len(image_files)}: {image_path.name}")
            self.process_frame(image_path)
        
        # Print statistics
        print("\n=== Processing Statistics ===")
        print(f"Total frames processed: {self.stats['total_frames']}")
        print(f"Daylight clear: {self.stats['daylight_clear']}")
        print(f"Night low light: {self.stats['night_low_light']}")
        print(f"Monsoon glare: {self.stats['monsoon_glare']}")
        print(f"\nClass distribution:")
        for class_id, class_name in CLASS_NAMES.items():
            count = self.stats.get(f"class_{class_id}", 0)
            print(f"  {class_name}: {count}")
        print(f"\nAmbiguous frames for manual review: {len(self.ambiguous_frames)}")
        
        # Save statistics
        stats_path = self.output_dir / "processing_stats.json"
        with open(stats_path, 'w') as f:
            json.dump(dict(self.stats), f, indent=2)
        
        # Save ambiguous frames list
        ambiguous_path = self.output_dir / "ambiguous_frames.txt"
        with open(ambiguous_path, 'w') as f:
            f.write('\n'.join(self.ambiguous_frames))
        
        print(f"\nProcessing complete. Output saved to {self.output_dir}")
        print(f"Ambiguous frames saved to {self.ambiguous_dir}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Preprocess and auto-label Indian mixed-vehicle parking dataset")
    parser.add_argument("--raw-frames-dir", default="data/raw_frames", help="Directory containing raw frames")
    parser.add_argument("--output-dir", default="data/processed", help="Output directory for processed data")
    parser.add_argument("--yolo-model", default="yolov8x.pt", help="YOLO model path")
    parser.add_argument("--use-sam", action="store_true", help="Use SAM for refinement")
    parser.add_argument("--clahe-clip-limit", type=float, default=2.0, help="CLAHE clip limit")
    parser.add_argument("--clahe-tile-size", type=int, default=8, help="CLAHE tile grid size")
    
    args = parser.parse_args()
    
    preprocessor = DatasetPreprocessor(
        raw_frames_dir=args.raw_frames_dir,
        output_dir=args.output_dir,
        yolo_model_path=args.yolo_model,
        use_sam=args.use_sam,
        clahe_clip_limit=args.clahe_clip_limit,
        clahe_tile_size=args.clahe_tile_size
    )
    
    preprocessor.process_dataset()


if __name__ == "__main__":
    main()