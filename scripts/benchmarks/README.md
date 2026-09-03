# SLOTS YOLOv8 Benchmark Suite

Complete benchmarking pipeline for Indian mixed-vehicle parking dataset to support Tier 1 novelty paper publication.

## Quick Start

```bash
# Install dependencies
pip install -r scripts/dataset/requirements.txt

# Run complete pipeline
python scripts/dataset/preprocess_and_label.py --raw-frames-dir data/raw_frames
python scripts/dataset/split_dataset.py
python scripts/benchmarks/train_yolo_baselines.py
python scripts/benchmarks/export_thesis_metrics.py
```

## Pipeline Components

### 1. Dataset Preprocessing & Auto-Labeling
**File:** `scripts/dataset/preprocess_and_label.py`

- CLAHE preprocessing for low-light/monsoon conditions
- YOLOv8x auto-annotation with confidence scoring
- Optional SAM refinement for precise bounding boxes
- Quality filtering for ambiguous frames (0.15-0.40 confidence)

### 2. Dataset Stratification & Split
**File:** `scripts/dataset/split_dataset.py`

- 70% Train / 15% Validation / 15% Test split
- Stratified sampling across environmental conditions
- YOLO-compatible directory structure
- Detailed split reporting

### 3. Baseline Training & Benchmarking
**File:** `scripts/benchmarks/train_yolo_baselines.py`

- Automated YOLOv8n, YOLOv8s, YOLOv8m training
- 100 epochs, 640x640 images, batch size 16
- AMP (Automatic Mixed Precision) enabled
- Comprehensive metrics logging

### 4. Thesis Metrics Export
**File:** `scripts/benchmarks/export_thesis_metrics.py`

- LaTeX tables for IEEE double-column format
- Markdown tables for web/presentations
- Precision-Recall curves
- Confusion matrices
- Model comparison plots
- Complete LaTeX thesis document

## Dataset Specifications

### Vehicle Classes
- `0: car` - Standard passenger vehicles
- `1: two_wheeler` - Motorcycles and scooters
- `2: auto_rickshaw` - Indian three-wheeled vehicles
- `3: LCV` - Light Commercial Vehicles / mini-trucks

### Environmental Conditions
- `daylight_clear` - Normal daylight
- `night_low_light` - Low-light nighttime
- `monsoon_glare` - Rainy with glare/reflections

## Expected Output Structure

```
data/
├── raw_frames/              # Input raw frames
├── processed/              # Preprocessed data
│   ├── images/
│   ├── labels/
│   ├── ambiguous/
│   ├── processing_stats.json
│   └── ambiguous_frames.txt
└── yolo_dataset/           # Final YOLO dataset
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

results/
├── benchmarks/
│   ├── yolov8n/
│   ├── yolov8s/
│   ├── yolov8m/
│   └── combined_benchmark_results.json
└── thesis/
    ├── comparison_table.md
    ├── comparison_table.tex
    ├── per_class_table.md
    ├── per_class_table.tex
    ├── environmental_table.md
    ├── environmental_table.tex
    ├── precision_recall_curves.png
    ├── confusion_matrix_*.png
    ├── model_comparison.png
    └── thesis_document.tex
```

## Hardware Requirements

### Minimum
- CPU: 4 cores
- RAM: 16GB
- GPU: NVIDIA GTX 1660 (6GB VRAM)
- Storage: 50GB

### Recommended
- CPU: 8+ cores
- RAM: 32GB
- GPU: NVIDIA RTX 3090 (24GB VRAM)
- Storage: 100GB SSD

## Software Requirements

- Python 3.8+
- CUDA 11.8+ (for GPU training)
- PyTorch 2.0+
- Ultralytics 8.0+

## Verification

Run the acceptance criteria test:

```bash
# Verify preprocessing
python scripts/dataset/preprocess_and_label.py --raw-frames-dir data/raw_frames --output-dir data/processed
# Check: data/processed/data.yaml exists, YOLO format annotations valid

# Verify stratification
python scripts/dataset/split_dataset.py
# Check: 70/15/15 split, class distribution balanced

# Verify training
python scripts/benchmarks/train_yolo_baselines.py --variants yolov8n
# Check: training completes, JSON metrics generated

# Verify export
python scripts/benchmarks/export_thesis_metrics.py
# Check: LaTeX tables, plots, thesis document generated
```

## Troubleshooting

### CUDA Out of Memory
- Reduce batch size: `--batch-size 8`
- Use smaller model: `--variants yolov8n`
- Reduce image size: `--image-size 512`

### SAM Not Available
- Install SAM: `pip install git+https://github.com/facebookresearch/segment-anything.git`
- Or disable: remove `--use-sam` flag

### Low Confidence Detections
- Check CLAHE parameters: `--clahe-clip-limit 3.0`
- Use larger YOLO model: `--yolo-model yolov8x.pt`
- Manual review of ambiguous frames in `data/processed/ambiguous/`

## License

MIT License - See LICENSE file for details

## Contact

For questions or issues, please open an issue on the repository.