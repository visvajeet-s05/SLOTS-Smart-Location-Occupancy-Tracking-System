# Indian Mixed-Vehicle Parking Dataset Pipeline

Complete dataset management, auto-annotation, stratification, and baseline benchmarking pipeline for Indian mixed-vehicle parking dataset to support Tier 1 novelty paper for SLOTS.

## Overview

This pipeline provides:
1. **Dataset Preprocessing & Auto-Labeling** - CLAHE preprocessing, YOLOv8-based auto-annotation, SAM refinement
2. **Dataset Stratification** - Stratified splits across environmental conditions (daylight, night, monsoon)
3. **Baseline Training** - Automated YOLOv8n/s/m training with comprehensive metrics
4. **Thesis Export** - Publication-ready LaTeX/Markdown tables and figures for IEEE papers

## Dataset Structure

### Classes
- `0: car` - Standard passenger vehicles
- `1: two_wheeler` - Motorcycles and scooters
- `2: auto_rickshaw` - Indian three-wheeled vehicles
- `3: LCV` - Light Commercial Vehicles / mini-trucks

### Environmental Conditions
- `daylight_clear` - Normal daylight conditions
- `night_low_light` - Low-light nighttime scenarios
- `monsoon_glare` - Rainy conditions with glare/reflections

## Installation

```bash
# Install Python dependencies
pip install -r scripts/dataset/requirements.txt

# Optional: Install SAM for bounding box refinement
pip install git+https://github.com/facebookresearch/segment-anything.git
```

## Usage

### 1. Dataset Preprocessing & Auto-Labeling

```bash
python scripts/dataset/preprocess_and_label.py \
    --raw-frames-dir data/raw_frames \
    --output-dir data/processed \
    --yolo-model yolov8x.pt \
    --use-sam \
    --clahe-clip-limit 2.0 \
    --clahe-tile-size 8
```

**Arguments:**
- `--raw-frames-dir`: Directory containing raw frames/videos
- `--output-dir`: Output directory for processed data
- `--yolo-model`: YOLO model path (default: yolov8x.pt)
- `--use-sam`: Enable SAM refinement (optional)
- `--clahe-clip-limit`: CLAHE clip limit (default: 2.0)
- `--clahe-tile-size`: CLAHE tile grid size (default: 8)

**Output:**
- `data/processed/images/` - Processed images with CLAHE
- `data/processed/labels/` - YOLO-format annotations
- `data/processed/ambiguous/` - Frames with low confidence (0.15-0.40) for manual review
- `data/processed/processing_stats.json` - Processing statistics
- `data/processed/ambiguous_frames.txt` - List of ambiguous frames

### 2. Dataset Stratification & Split

```bash
python scripts/dataset/split_dataset.py \
    --processed-dir data/processed \
    --output-dir data/yolo_dataset \
    --train-ratio 0.70 \
    --val-ratio 0.15 \
    --test-ratio 0.15 \
    --random-seed 42
```

**Arguments:**
- `--processed-dir`: Directory containing processed images and labels
- `--output-dir`: Output directory for YOLO dataset
- `--train-ratio`: Training set ratio (default: 0.70)
- `--val-ratio`: Validation set ratio (default: 0.15)
- `--test-ratio`: Test set ratio (default: 0.15)
- `--random-seed`: Random seed for reproducibility (default: 42)

**Output:**
```
data/yolo_dataset/
├── data.yaml
├── train/
│   ├── images/
│   └── labels/
├── val/
│   ├── images/
│   └── labels/
└── test/
    ├── images/
    └── labels/
```

### 3. Baseline Training & Benchmarking

```bash
python scripts/benchmarks/train_yolo_baselines.py \
    --dataset-dir data/yolo_dataset \
    --output-dir results/benchmarks \
    --epochs 100 \
    --image-size 640 \
    --batch-size 16 \
    --device 0 \
    --variants yolov8n yolov8s yolov8m
```

**Arguments:**
- `--dataset-dir`: Directory containing YOLO dataset
- `--output-dir`: Output directory for benchmark results
- `--epochs`: Number of training epochs (default: 100)
- `--image-size`: Input image size (default: 640)
- `--batch-size`: Batch size for training (default: 16)
- `--device`: Device to use (e.g., '0' for GPU, 'cpu' for CPU)
- `--no-amp`: Disable automatic mixed precision
- `--variants`: Model variants to benchmark (default: all)

**Output:**
- `results/benchmarks/yolov8n/` - YOLOv8n training results
- `results/benchmarks/yolov8s/` - YOLOv8s training results
- `results/benchmarks/yolov8m/` - YOLOv8m training results
- `results/benchmarks/combined_benchmark_results.json` - Combined metrics

### 4. Thesis Metrics Export

```bash
python scripts/benchmarks/export_thesis_metrics.py \
    --benchmark-results results/benchmarks/combined_benchmark_results.json \
    --output-dir results/thesis
```

**Arguments:**
- `--benchmark-results`: Path to combined benchmark results JSON
- `--output-dir`: Output directory for thesis materials

**Output:**
- `results/thesis/comparison_table.md` - Markdown comparison table
- `results/thesis/comparison_table.tex` - LaTeX comparison table
- `results/thesis/per_class_table.md` - Per-class metrics (Markdown)
- `results/thesis/per_class_table.tex` - Per-class metrics (LaTeX)
- `results/thesis/environmental_table.md` - Environmental breakdown (Markdown)
- `results/thesis/environmental_table.tex` - Environmental breakdown (LaTeX)
- `results/thesis/precision_recall_curves.png` - PR curves
- `results/thesis/confusion_matrix_*.png` - Confusion matrices
- `results/thesis/model_comparison.png` - Model comparison plots
- `results/thesis/thesis_document.tex` - Complete LaTeX thesis document

## Complete Pipeline Example

```bash
# Step 1: Preprocess and auto-label
python scripts/dataset/preprocess_and_label.py \
    --raw-frames-dir data/raw_frames \
    --output-dir data/processed

# Step 2: Stratify and split dataset
python scripts/dataset/split_dataset.py \
    --processed-dir data/processed \
    --output-dir data/yolo_dataset

# Step 3: Train baseline models
python scripts/benchmarks/train_yolo_baselines.py \
    --dataset-dir data/yolo_dataset \
    --output-dir results/benchmarks

# Step 4: Export thesis materials
python scripts/benchmarks/export_thesis_metrics.py \
    --benchmark-results results/benchmarks/combined_benchmark_results.json \
    --output-dir results/thesis
```

## Acceptance Criteria

✅ Script processes raw image files, normalizes annotations into standard YOLO format, and builds a valid `data.yaml`
✅ Class stratification accurately isolates `auto_rickshaw` and `two_wheeler` bounding boxes
✅ Automated training script successfully executes YOLOv8n, YOLOv8s, and YOLOv8m benchmarks, generating CSV/JSON summary metrics
✅ Output includes publication-ready LaTeX tables detailing mAP@0.5 and mAP@0.5:0.95 across all vehicle classes and environmental split conditions

## Features

### Preprocessing Pipeline
- **CLAHE Enhancement**: Contrast Limited Adaptive Histogram Equalization for low-light/monsoon frames
- **Auto-Annotation**: YOLOv8x baseline labeling with confidence scoring
- **SAM Refinement**: Optional Segment Anything Model for precise bounding box refinement
- **Quality Filtering**: Automatic flagging of ambiguous frames (confidence 0.15-0.40)

### Stratification Engine
- **Environmental Stratification**: Balanced splits across daylight, night, and monsoon conditions
- **Class Stratification**: Ensures representative distribution of all vehicle classes
- **Reproducible Splits**: Fixed random seed for consistent results
- **Detailed Reporting**: JSON report with split statistics

### Benchmark Harness
- **Multi-Model Training**: Automated training of YOLOv8n, YOLOv8s, YOLOv8m
- **Comprehensive Metrics**: Precision, recall, mAP@0.5, mAP@0.5:0.95, latency, memory
- **Per-Class Analysis**: Detailed metrics for each vehicle class
- **Resource Monitoring**: Training time, memory footprint, inference latency

### Thesis Export
- **IEEE Format**: LaTeX tables optimized for double-column papers
- **Markdown Export**: Alternative format for web/presentations
- **Visualization**: Precision-Recall curves, confusion matrices, comparison plots
- **Complete Document**: Auto-generated LaTeX thesis document

## Notes

- Ensure sufficient GPU memory for training YOLOv8m (recommended: 8GB+)
- For SAM refinement, download the SAM ViT-H checkpoint from the official repository
- The pipeline assumes images are in JPG/PNG format
- Environmental condition detection uses simple heuristics - for production, use explicit metadata

## Citation

If you use this pipeline in your research, please cite:

```bibtex
@article{slots2024,
  title={SLOTS: Smart Parking System with Advanced Computer Vision},
  author={SLOTS Research Team},
  journal={arXiv preprint},
  year={2024}
}
```