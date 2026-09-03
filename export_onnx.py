"""Export YOLOv8n to ONNX and verify output format."""
import os
import sys
import numpy as np
import torch

os.chdir(r"d:\Projects\SLOTS\SLOTS")
sys.path.insert(0, ".")

from ultralytics import YOLO

print("Loading model...")
model = YOLO("yolov8n.pt")
model.model.fuse()
model.model.eval()

# Check output format
dummy = torch.randn(1, 3, 640, 640)
with torch.no_grad():
    out = model.model(dummy)
print(f"Output type: {type(out)}")
if isinstance(out, (list, tuple)):
    for i, o in enumerate(out):
        if hasattr(o, "shape"):
            print(f"  Output {i}: shape={o.shape}, dtype={o.dtype}")
        else:
            print(f"  Output {i}: type={type(o)}")
else:
    print(f"Output shape: {out.shape}")

# Export to ONNX
print("\nExporting to ONNX...")
success = model.export(format="onnx", imgsz=640, batch=1, simplify=True)
print(f"Export result: {success}")

# Verify with onnxruntime
if success and os.path.exists(success):
    import onnxruntime as ort
    sess = ort.InferenceSession(success, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    print(f"\nONNX Input: name={input_name}, shape={sess.get_inputs()[0].shape}")
    for out_meta in sess.get_outputs():
        print(f"ONNX Output: name={out_meta.name}, shape={out_meta.shape}")

    # Run inference
    test_input = np.random.randn(1, 3, 640, 640).astype(np.float32)
    results = sess.run(None, {input_name: test_input})
    print(f"\nInference output shape: {results[0].shape}")
    print(f"Output dtype: {results[0].dtype}")
    print(f"Min/max values: {results[0].min():.4f} / {results[0].max():.4f}")
    print("ONNX model verified successfully!")
else:
    print(f"Export failed or file not found at: {success}")
