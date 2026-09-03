"""Quantize YOLOv8 ONNX model for faster CPU inference and benchmark."""
import os
import numpy as np
import cv2
import time
import onnxruntime as ort

os.chdir(r"d:\Projects\SLOTS\SLOTS")

# ─── 1. Dynamic INT8 Quantization ──────────────────────────────────────
from onnxruntime.quantization import quantize_dynamic, QuantType

print("Quantizing ONNX model (dynamic INT8)...")
quantize_dynamic(
    "yolov8n.onnx",
    "yolov8n_int8.onnx",
    weight_type=QuantType.QUInt8,
)
orig_size = os.path.getsize("yolov8n.onnx") / 1e6
quant_size = os.path.getsize("yolov8n_int8.onnx") / 1e6
print(f"  Original: {orig_size:.1f}MB → Quantized: {quant_size:.1f}MB ({quant_size/orig_size*100:.0f}% of original)")

# ─── 2. Compare inference speed ────────────────────────────────────────
frame = np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)
resized = cv2.resize(frame, (640, 640))
rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
normalized = rgb.astype(np.float32) / 255.0
tensor = np.transpose(normalized, (2, 0, 1))[np.newaxis, :]

for model_name in ["yolov8n.onnx", "yolov8n_int8.onnx"]:
    sess = ort.InferenceSession(model_name, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name

    # Warmup
    for _ in range(5):
        _ = sess.run(None, {input_name: tensor})

    times = []
    for _ in range(100):
        t0 = time.perf_counter()
        _ = sess.run(None, {input_name: tensor})
        t1 = time.perf_counter()
        times.append((t1 - t0) * 1000)

    avg = np.mean(times)
    p99 = np.percentile(times, 99)
    print(f"\n  {model_name}:")
    print(f"    Avg latency: {avg:.2f}ms")
    print(f"    P99 latency: {p99:.2f}ms")

print("\nDone!")
