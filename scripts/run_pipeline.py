#!/usr/bin/env python3
"""
Master Pipeline Script
Orchestrates the complete dataset preprocessing, stratification, training, and export pipeline.
"""

import argparse
import subprocess
import sys
from pathlib import Path

def run_command(cmd: list, description: str):
    """Run a command and handle errors."""
    print(f"\n{'='*60}")
    print(f"STEP: {description}")
    print(f"{'='*60}")
    print(f"Command: {' '.join(cmd)}")
    print()
    
    result = subprocess.run(cmd, capture_output=False)
    
    if result.returncode != 0:
        print(f"\nError: {description} failed with exit code {result.returncode}")
        sys.exit(1)
    
    print(f"\n✓ {description} completed successfully")

def main():
    parser = argparse.ArgumentParser(description="Master pipeline for Indian mixed-vehicle parking dataset")
    parser.add_argument("--raw-frames-dir", default="data/raw_frames", help="Directory containing raw frames")
    parser.add_argument("--processed-dir", default="data/processed", help="Output directory for processed data")
    parser.add_argument("--dataset-dir", default="data/yolo_dataset", help="Output directory for YOLO dataset")
    parser.add_argument("--results-dir", default="results/benchmarks", help="Output directory for benchmark results")
    parser.add_argument("--thesis-dir", default="results/thesis", help="Output directory for thesis materials")
    parser.add_argument("--epochs", type=int, default=100, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size for training")
    parser.add_argument("--device", default="0", help="Device to use")
    parser.add_argument("--skip-training", action="store_true", help="Skip training step")
    parser.add_argument("--skip-export", action="store_true", help="Skip thesis export step")
    parser.add_argument("--variants", nargs="+", default=["yolov8n", "yolov8s", "yolov8m"], 
                        help="Model variants to benchmark")
    
    args = parser.parse_args()
    
    print("="*60)
    print("SLOTS YOLOv8 Benchmark Suite - Master Pipeline")
    print("="*60)
    print(f"Raw frames: {args.raw_frames_dir}")
    print(f"Processed data: {args.processed_dir}")
    print(f"YOLO dataset: {args.dataset_dir}")
    print(f"Results: {args.results_dir}")
    print(f"Thesis: {args.thesis_dir}")
    print(f"Epochs: {args.epochs}")
    print(f"Batch size: {args.batch_size}")
    print(f"Device: {args.device}")
    print(f"Variants: {args.variants}")
    print()
    
    # Step 1: Preprocessing & Auto-Labeling
    run_command([
        "python", "scripts/dataset/preprocess_and_label.py",
        "--raw-frames-dir", args.raw_frames_dir,
        "--output-dir", args.processed_dir
    ], "Dataset Preprocessing & Auto-Labeling")
    
    # Step 2: Dataset Stratification & Split
    run_command([
        "python", "scripts/dataset/split_dataset.py",
        "--processed-dir", args.processed_dir,
        "--output-dir", args.dataset_dir
    ], "Dataset Stratification & Split")
    
    # Step 3: Baseline Training (optional)
    if not args.skip_training:
        run_command([
            "python", "scripts/benchmarks/train_yolo_baselines.py",
            "--dataset-dir", args.dataset_dir,
            "--output-dir", args.results_dir,
            "--epochs", str(args.epochs),
            "--batch-size", str(args.batch_size),
            "--device", args.device
        ] + ["--variants"] + args.variants, "Baseline Training & Benchmarking")
    else:
        print("\nSkipping training step (--skip-training flag set)")
    
    # Step 4: Thesis Export (optional)
    if not args.skip_export:
        run_command([
            "python", "scripts/benchmarks/export_thesis_metrics.py",
            "--benchmark-results", f"{args.results_dir}/combined_benchmark_results.json",
            "--output-dir", args.thesis_dir
        ], "Thesis Metrics Export")
    else:
        print("\nSkipping thesis export step (--skip-export flag set)")
    
    print("\n" + "="*60)
    print("✓ PIPELINE COMPLETED SUCCESSFULLY")
    print("="*60)
    print(f"\nOutput locations:")
    print(f"  Processed data: {args.processed_dir}")
    print(f"  YOLO dataset: {args.dataset_dir}")
    print(f"  Benchmark results: {args.results_dir}")
    print(f"  Thesis materials: {args.thesis_dir}")

if __name__ == "__main__":
    main()