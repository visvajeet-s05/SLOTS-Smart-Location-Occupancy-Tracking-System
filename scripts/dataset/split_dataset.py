#!/usr/bin/env python3
"""
Dataset Stratification & Split Engine
Splits the dataset into 70% Train, 15% Validation, and 15% Test with stratified sampling
across environmental categories and class distribution.
"""

import os
import json
import shutil
from pathlib import Path
from typing import Dict, List, Tuple
from collections import defaultdict
import random
import yaml

# Class definitions
CLASS_NAMES = {
    0: "car",
    1: "two_wheeler",
    2: "auto_rickshaw",
    3: "LCV"
}

ENVIRONMENTAL_CONDITIONS = [
    "daylight_clear",
    "night_low_light",
    "monsoon_glare"
]

class DatasetSplitter:
    def __init__(
        self,
        processed_dir: str = "data/processed",
        output_dir: str = "data/yolo_dataset",
        train_ratio: float = 0.70,
        val_ratio: float = 0.15,
        test_ratio: float = 0.15,
        random_seed: int = 42
    ):
        self.processed_dir = Path(processed_dir)
        self.output_dir = Path(output_dir)
        self.train_ratio = train_ratio
        self.val_ratio = val_ratio
        self.test_ratio = test_ratio
        self.random_seed = random_seed
        
        # Validate ratios
        if abs(train_ratio + val_ratio + test_ratio - 1.0) > 0.01:
            raise ValueError("Train, validation, and test ratios must sum to 1.0")
        
        # Set random seed for reproducibility
        random.seed(self.random_seed)
        
        # Create output directory structure
        self.train_dir = self.output_dir / "train"
        self.val_dir = self.output_dir / "val"
        self.test_dir = self.output_dir / "test"
        
        for split_dir in [self.train_dir, self.val_dir, self.test_dir]:
            (split_dir / "images").mkdir(parents=True, exist_ok=True)
            (split_dir / "labels").mkdir(parents=True, exist_ok=True)
        
        # Load processing statistics if available
        self.stats_path = self.processed_dir / "processing_stats.json"
        self.processing_stats = {}
        if self.stats_path.exists():
            with open(self.stats_path, 'r') as f:
                self.processing_stats = json.load(f)
    
    def load_image_metadata(self) -> Dict[str, Dict]:
        """Load metadata for all images including environmental condition."""
        metadata = {}
        
        # Try to load from stats file if available
        if self.processing_stats:
            # In a real implementation, you'd store per-image metadata
            # For now, we'll infer from directory structure or use a simple heuristic
            pass
        
        # Scan images directory
        images_dir = self.processed_dir / "images"
        labels_dir = self.processed_dir / "labels"
        
        if not images_dir.exists():
            raise FileNotFoundError(f"Images directory not found: {images_dir}")
        
        # Get all image files
        image_files = list(images_dir.glob("*.jpg")) + list(images_dir.glob("*.png")) + list(images_dir.glob("*.jpeg"))
        
        print(f"Found {len(image_files)} images in processed directory")
        
        # For each image, try to infer environmental condition
        # In production, this would be stored in a metadata file
        for img_path in image_files:
            # Simple heuristic: infer from filename or use default
            # In production, this would be stored during preprocessing
            img_name = img_path.stem
            
            # Check if label exists
            label_path = labels_dir / f"{img_name}.txt"
            if not label_path.exists():
                continue
            
            # Parse label to get class distribution
            classes_in_image = set()
            with open(label_path, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        class_id = int(parts[0])
                        classes_in_image.add(class_id)
            
            # Infer environmental condition from filename (simple heuristic)
            # In production, this would be stored during preprocessing
            if "night" in img_name.lower():
                env_condition = "night_low_light"
            elif "monsoon" in img_name.lower() or "glare" in img_name.lower():
                env_condition = "monsoon_glare"
            else:
                env_condition = "daylight_clear"
            
            metadata[img_name] = {
                "image_path": str(img_path),
                "label_path": str(label_path),
                "environmental_condition": env_condition,
                "classes": list(classes_in_image)
            }
        
        return metadata
    
    def stratified_split(self, metadata: Dict[str, Dict]) -> Tuple[List[str], List[str], List[str]]:
        """Perform stratified split across environmental conditions."""
        
        # Group images by environmental condition
        env_groups = defaultdict(list)
        for img_name, data in metadata.items():
            env_groups[data["environmental_condition"]].append(img_name)
        
        print("\n=== Environmental Condition Distribution ===")
        for env, images in env_groups.items():
            print(f"{env}: {len(images)} images")
        
        # Perform stratified split
        train_images = []
        val_images = []
        test_images = []
        
        for env, images in env_groups.items():
            random.shuffle(images)
            
            n_total = len(images)
            n_train = int(n_total * self.train_ratio)
            n_val = int(n_total * self.val_ratio)
            n_test = n_total - n_train - n_val
            
            train_images.extend(images[:n_train])
            val_images.extend(images[n_train:n_train + n_val])
            test_images.extend(images[n_train + n_val:])
            
            print(f"{env} split: Train={n_train}, Val={n_val}, Test={n_test}")
        
        return train_images, val_images, test_images
    
    def copy_files(self, image_names: List[str], split_dir: Path, metadata: Dict[str, Dict]):
        """Copy images and labels to split directory."""
        print(f"\nCopying {len(image_names)} files to {split_dir.name}...")
        
        for img_name in image_names:
            data = metadata[img_name]
            
            # Copy image
            src_img = Path(data["image_path"])
            dst_img = split_dir / "images" / src_img.name
            shutil.copy2(src_img, dst_img)
            
            # Copy label
            src_label = Path(data["label_path"])
            dst_label = split_dir / "labels" / src_label.name
            shutil.copy2(src_label, dst_label)
    
    def analyze_class_distribution(self, split_dir: Path) -> Dict[int, int]:
        """Analyze class distribution in a split."""
        labels_dir = split_dir / "labels"
        class_counts = defaultdict(int)
        
        for label_file in labels_dir.glob("*.txt"):
            with open(label_file, 'r') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        class_id = int(parts[0])
                        class_counts[class_id] += 1
        
        return dict(class_counts)
    
    def generate_data_yaml(self):
        """Generate data.yaml for YOLO training."""
        data_yaml = {
            "path": str(self.output_dir.absolute()),
            "train": "train/images",
            "val": "val/images",
            "test": "test/images",
            "nc": len(CLASS_NAMES),
            "names": list(CLASS_NAMES.values())
        }
        
        yaml_path = self.output_dir / "data.yaml"
        with open(yaml_path, 'w') as f:
            yaml.dump(data_yaml, f, default_flow_style=False, sort_keys=False)
        
        print(f"\nGenerated data.yaml at {yaml_path}")
    
    def generate_split_report(self, metadata: Dict[str, Dict], train_images: List[str], val_images: List[str], test_images: List[str]):
        """Generate a detailed split report."""
        report = {
            "total_images": len(metadata),
            "train": {
                "count": len(train_images),
                "ratio": self.train_ratio,
                "class_distribution": self.analyze_class_distribution(self.train_dir)
            },
            "val": {
                "count": len(val_images),
                "ratio": self.val_ratio,
                "class_distribution": self.analyze_class_distribution(self.val_dir)
            },
            "test": {
                "count": len(test_images),
                "ratio": self.test_ratio,
                "class_distribution": self.analyze_class_distribution(self.test_dir)
            },
            "environmental_distribution": {
                env: {
                    "train": len([img for img in train_images if metadata[img]["environmental_condition"] == env]),
                    "val": len([img for img in val_images if metadata[img]["environmental_condition"] == env]),
                    "test": len([img for img in test_images if metadata[img]["environmental_condition"] == env])
                }
                for env in ENVIRONMENTAL_CONDITIONS
            }
        }
        
        report_path = self.output_dir / "split_report.json"
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"\n=== Split Report ===")
        print(f"Total images: {report['total_images']}")
        print(f"\nTrain: {report['train']['count']} ({report['train']['ratio']*100:.1f}%)")
        print(f"  Class distribution:")
        for class_id, count in report['train']['class_distribution'].items():
            class_name = CLASS_NAMES.get(class_id, f"class_{class_id}")
            print(f"    {class_name}: {count}")
        
        print(f"\nValidation: {report['val']['count']} ({report['val']['ratio']*100:.1f}%)")
        print(f"  Class distribution:")
        for class_id, count in report['val']['class_distribution'].items():
            class_name = CLASS_NAMES.get(class_id, f"class_{class_id}")
            print(f"    {class_name}: {count}")
        
        print(f"\nTest: {report['test']['count']} ({report['test']['ratio']*100:.1f}%)")
        print(f"  Class distribution:")
        for class_id, count in report['test']['class_distribution'].items():
            class_name = CLASS_NAMES.get(class_id, f"class_{class_id}")
            print(f"    {class_name}: {count}")
        
        print(f"\nEnvironmental distribution:")
        for env, dist in report['environmental_distribution'].items():
            print(f"  {env}:")
            print(f"    Train: {dist['train']}")
            print(f"    Val: {dist['val']}")
            print(f"    Test: {dist['test']}")
        
        print(f"\nSplit report saved to {report_path}")
    
    def split_dataset(self):
        """Execute the complete dataset split pipeline."""
        print("=== Dataset Stratification & Split Engine ===")
        print(f"Input directory: {self.processed_dir}")
        print(f"Output directory: {self.output_dir}")
        print(f"Split ratios: Train={self.train_ratio}, Val={self.val_ratio}, Test={self.test_ratio}")
        
        # Load metadata
        metadata = self.load_image_metadata()
        
        if not metadata:
            print("No images found. Ensure preprocessing has been run first.")
            return
        
        # Perform stratified split
        train_images, val_images, test_images = self.stratified_split(metadata)
        
        # Copy files to respective directories
        self.copy_files(train_images, self.train_dir, metadata)
        self.copy_files(val_images, self.val_dir, metadata)
        self.copy_files(test_images, self.test_dir, metadata)
        
        # Generate data.yaml
        self.generate_data_yaml()
        
        # Generate split report
        self.generate_split_report(metadata, train_images, val_images, test_images)
        
        print(f"\n=== Dataset split complete ===")
        print(f"Output directory: {self.output_dir}")
        print(f"Directory structure:")
        print(f"  {self.output_dir}/")
        print(f"    data.yaml")
        print(f"    train/")
        print(f"      images/")
        print(f"      labels/")
        print(f"    val/")
        print(f"      images/")
        print(f"      labels/")
        print(f"    test/")
        print(f"      images/")
        print(f"      labels/")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Stratified dataset split for YOLO training")
    parser.add_argument("--processed-dir", default="data/processed", help="Directory containing processed images and labels")
    parser.add_argument("--output-dir", default="data/yolo_dataset", help="Output directory for YOLO dataset")
    parser.add_argument("--train-ratio", type=float, default=0.70, help="Training set ratio")
    parser.add_argument("--val-ratio", type=float, default=0.15, help="Validation set ratio")
    parser.add_argument("--test-ratio", type=float, default=0.15, help="Test set ratio")
    parser.add_argument("--random-seed", type=int, default=42, help="Random seed for reproducibility")
    
    args = parser.parse_args()
    
    splitter = DatasetSplitter(
        processed_dir=args.processed_dir,
        output_dir=args.output_dir,
        train_ratio=args.train_ratio,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        random_seed=args.random_seed
    )
    
    splitter.split_dataset()


if __name__ == "__main__":
    main()