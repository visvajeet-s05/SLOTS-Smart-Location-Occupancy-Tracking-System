#!/usr/bin/env python3
"""
Baseline Training & Benchmark Harness
Automated script to train and evaluate YOLOv8n, YOLOv8s, and YOLOv8m on the Indian mixed-vehicle parking dataset.
"""

import os
import json
import yaml
import time
import psutil
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
from datetime import datetime

try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False
    print("Error: ultralytics package not installed. Install with: pip install ultralytics")

# Class definitions
CLASS_NAMES = {
    0: "car",
    1: "two_wheeler",
    2: "auto_rickshaw",
    3: "LCV"
}

MODEL_VARIANTS = {
    "yolov8n": "yolov8n.pt",
    "yolov8s": "yolov8s.pt",
    "yolov8m": "yolov8m.pt"
}

@dataclass
class BenchmarkMetrics:
    model_name: str
    variant: str
    epoch: int
    train_time_seconds: float
    train_loss: float
    precision: float
    recall: float
    mAP50: float
    mAP50_95: float
    inference_latency_ms: float
    memory_footprint_mb: float
    class_metrics: Dict[str, Dict[str, float]]
    timestamp: str

class YOLOBenchmarkHarness:
    def __init__(
        self,
        dataset_dir: str = "data/yolo_dataset",
        output_dir: str = "results/benchmarks",
        epochs: int = 100,
        image_size: int = 640,
        batch_size: int = 16,
        device: str = "0",
        use_amp: bool = True
    ):
        if not ULTRALYTICS_AVAILABLE:
            raise RuntimeError("ultralytics package not available")
        
        self.dataset_dir = Path(dataset_dir)
        self.output_dir = Path(output_dir)
        self.epochs = epochs
        self.image_size = image_size
        self.batch_size = batch_size
        self.device = device
        self.use_amp = use_amp
        
        # Create output directory
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Load data.yaml
        self.data_yaml_path = self.dataset_dir / "data.yaml"
        if not self.data_yaml_path.exists():
            raise FileNotFoundError(f"data.yaml not found at {self.data_yaml_path}")
        
        with open(self.data_yaml_path, 'r') as f:
            self.data_config = yaml.safe_load(f)
        
        print(f"Dataset configuration loaded from {self.data_yaml_path}")
        print(f"  Classes: {self.data_config['names']}")
        print(f"  Train: {self.data_config['train']}")
        print(f"  Val: {self.data_config['val']}")
        print(f"  Test: {self.data_config['test']}")
        
        # Results storage
        self.benchmark_results: List[BenchmarkMetrics] = []
    
    def get_memory_usage(self) -> float:
        """Get current memory usage in MB."""
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / 1024 / 1024
    
    def measure_inference_latency(self, model: YOLO, num_samples: int = 100) -> float:
        """Measure average inference latency per frame."""
        print(f"Measuring inference latency with {num_samples} samples...")
        
        # Get a few test images
        test_images_dir = self.dataset_dir / "test" / "images"
        test_images = list(test_images_dir.glob("*.jpg"))[:num_samples]
        
        if not test_images:
            print("Warning: No test images found for latency measurement")
            return 0.0
        
        latencies = []
        for img_path in test_images:
            start_time = time.perf_counter()
            model(str(img_path), verbose=False)
            end_time = time.perf_counter()
            latencies.append((end_time - start_time) * 1000)  # Convert to ms
        
        avg_latency = sum(latencies) / len(latencies)
        print(f"Average inference latency: {avg_latency:.2f} ms")
        return avg_latency
    
    def extract_class_metrics(self, results_dict: Dict) -> Dict[str, Dict[str, float]]:
        """Extract per-class metrics from training results."""
        class_metrics = {}
        
        # YOLOv8 stores class metrics in results_dict
        # This is a simplified extraction - actual structure may vary
        if "metrics" in results_dict:
            metrics = results_dict["metrics"]
            for class_id, class_name in CLASS_NAMES.items():
                class_metrics[class_name] = {
                    "precision": metrics.get(f"metrics/precision({class_id})", 0.0),
                    "recall": metrics.get(f"metrics/recall({class_id})", 0.0),
                    "mAP50": metrics.get(f"metrics/mAP50({class_id})", 0.0),
                    "mAP50_95": metrics.get(f"metrics/mAP50-95({class_id})", 0.0)
                }
        
        return class_metrics
    
    def train_model(self, variant: str) -> BenchmarkMetrics:
        """Train a YOLO model variant and return benchmark metrics."""
        print(f"\n{'='*60}")
        print(f"Training {variant.upper()}")
        print(f"{'='*60}")
        
        # Load pretrained model
        model_path = MODEL_VARIANTS[variant]
        print(f"Loading pretrained model: {model_path}")
        model = YOLO(model_path)
        
        # Configure training
        results_dir = self.output_dir / variant
        results_dir.mkdir(exist_ok=True)
        
        training_args = {
            "data": str(self.data_yaml_path),
            "epochs": self.epochs,
            "imgsz": self.image_size,
            "batch": self.batch_size,
            "device": self.device,
            "amp": self.use_amp,
            "project": str(self.output_dir),
            "name": variant,
            "exist_ok": True,
            "verbose": True,
            "save": True,
            "plots": True,
            "patience": 20  # Early stopping
        }
        
        print(f"Training configuration:")
        for key, value in training_args.items():
            print(f"  {key}: {value}")
        
        # Measure memory before training
        memory_before = self.get_memory_usage()
        
        # Train the model
        start_time = time.time()
        results = model.train(**training_args)
        train_time = time.time() - start_time
        
        # Measure memory after training
        memory_after = self.get_memory_usage()
        memory_footprint = memory_after - memory_before
        
        print(f"\nTraining completed in {train_time:.2f} seconds")
        print(f"Memory footprint: {memory_footprint:.2f} MB")
        
        # Load best model for evaluation
        best_model_path = results_dir / "weights" / "best.pt"
        if best_model_path.exists():
            model = YOLO(str(best_model_path))
        else:
            print("Warning: best.pt not found, using last.pt")
            best_model_path = results_dir / "weights" / "last.pt"
            if best_model_path.exists():
                model = YOLO(str(best_model_path))
        
        # Evaluate on validation set
        print("\nEvaluating on validation set...")
        val_results = model.val(
            data=str(self.data_yaml_path),
            split="val",
            device=self.device
        )
        
        # Extract metrics
        metrics_dict = val_results.results_dict if hasattr(val_results, 'results_dict') else {}
        
        precision = float(metrics_dict.get("metrics/precision(B)", 0.0))
        recall = float(metrics_dict.get("metrics/recall(B)", 0.0))
        mAP50 = float(metrics_dict.get("metrics/mAP50(B)", 0.0))
        mAP50_95 = float(metrics_dict.get("metrics/mAP50-95(B)", 0.0))
        train_loss = float(metrics_dict.get("train/loss", 0.0))
        
        print(f"\nValidation Metrics:")
        print(f"  Precision: {precision:.4f}")
        print(f"  Recall: {recall:.4f}")
        print(f"  mAP@0.5: {mAP50:.4f}")
        print(f"  mAP@0.5:0.95: {mAP50_95:.4f}")
        
        # Measure inference latency
        inference_latency = self.measure_inference_latency(model)
        
        # Extract per-class metrics
        class_metrics = self.extract_class_metrics(metrics_dict)
        
        # Create benchmark metrics object
        benchmark = BenchmarkMetrics(
            model_name=f"{variant}_custom",
            variant=variant,
            epoch=self.epochs,
            train_time_seconds=train_time,
            train_loss=train_loss,
            precision=precision,
            recall=recall,
            mAP50=mAP50,
            mAP50_95=mAP50_95,
            inference_latency_ms=inference_latency,
            memory_footprint_mb=memory_footprint,
            class_metrics=class_metrics,
            timestamp=datetime.now().isoformat()
        )
        
        # Save individual benchmark results
        benchmark_path = results_dir / "benchmark_results.json"
        with open(benchmark_path, 'w') as f:
            json.dump(asdict(benchmark), f, indent=2)
        
        print(f"Benchmark results saved to {benchmark_path}")
        
        return benchmark
    
    def run_all_benchmarks(self, variants: Optional[List[str]] = None):
        """Run benchmarks for all specified model variants."""
        if variants is None:
            variants = list(MODEL_VARIANTS.keys())
        
        print("=== YOLO Baseline Training & Benchmark Harness ===")
        print(f"Dataset: {self.dataset_dir}")
        print(f"Output: {self.output_dir}")
        print(f"Epochs: {self.epochs}")
        print(f"Image size: {self.image_size}")
        print(f"Batch size: {self.batch_size}")
        print(f"Device: {self.device}")
        print(f"AMP: {self.use_amp}")
        print(f"\nModel variants to benchmark: {variants}")
        
        for variant in variants:
            try:
                benchmark = self.train_model(variant)
                self.benchmark_results.append(benchmark)
            except Exception as e:
                print(f"Error training {variant}: {e}")
                import traceback
                traceback.print_exc()
        
        # Save combined results
        self.save_combined_results()
        self.print_summary()
    
    def save_combined_results(self):
        """Save all benchmark results to a single JSON file."""
        combined_path = self.output_dir / "combined_benchmark_results.json"
        
        results_data = [asdict(b) for b in self.benchmark_results]
        
        with open(combined_path, 'w') as f:
            json.dump(results_data, f, indent=2)
        
        print(f"\nCombined benchmark results saved to {combined_path}")
    
    def print_summary(self):
        """Print a summary of all benchmark results."""
        print("\n" + "="*80)
        print("BENCHMARK SUMMARY")
        print("="*80)
        
        for benchmark in self.benchmark_results:
            print(f"\n{benchmark.variant.upper()}:")
            print(f"  Training time: {benchmark.train_time_seconds:.2f}s")
            print(f"  Memory footprint: {benchmark.memory_footprint_mb:.2f} MB")
            print(f"  Inference latency: {benchmark.inference_latency_ms:.2f} ms")
            print(f"  Precision: {benchmark.precision:.4f}")
            print(f"  Recall: {benchmark.recall:.4f}")
            print(f"  mAP@0.5: {benchmark.mAP50:.4f}")
            print(f"  mAP@0.5:0.95: {benchmark.mAP50_95:.4f}")
            
            print(f"\n  Per-class metrics:")
            for class_name, metrics in benchmark.class_metrics.items():
                print(f"    {class_name}:")
                print(f"      Precision: {metrics.get('precision', 0):.4f}")
                print(f"      Recall: {metrics.get('recall', 0):.4f}")
                print(f"      mAP@0.5: {metrics.get('mAP50', 0):.4f}")
                print(f"      mAP@0.5:0.95: {metrics.get('mAP50_95', 0):.4f}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="YOLO baseline training and benchmark harness")
    parser.add_argument("--dataset-dir", default="data/yolo_dataset", help="Directory containing YOLO dataset")
    parser.add_argument("--output-dir", default="results/benchmarks", help="Output directory for benchmark results")
    parser.add_argument("--epochs", type=int, default=100, help="Number of training epochs")
    parser.add_argument("--image-size", type=int, default=640, help="Input image size")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size for training")
    parser.add_argument("--device", default="0", help="Device to use (e.g., '0' for GPU, 'cpu' for CPU)")
    parser.add_argument("--no-amp", action="store_true", help="Disable automatic mixed precision")
    parser.add_argument("--variants", nargs="+", choices=list(MODEL_VARIANTS.keys()), 
                        default=list(MODEL_VARIANTS.keys()), help="Model variants to benchmark")
    
    args = parser.parse_args()
    
    harness = YOLOBenchmarkHarness(
        dataset_dir=args.dataset_dir,
        output_dir=args.output_dir,
        epochs=args.epochs,
        image_size=args.image_size,
        batch_size=args.batch_size,
        device=args.device,
        use_amp=not args.no_amp
    )
    
    harness.run_all_benchmarks(args.variants)


if __name__ == "__main__":
    main()