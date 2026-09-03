"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTS Enhanced Edge AI Vision Engine  v1.0                            ║
║   ┌─────────────────────────────────────────────────────────────────┐   ║
║   │ 1. CLAHE & Contrast Pre-Processing (LAB L-channel)              │   ║
║   │ 2. Hardware Acceleration Switch (ONNX/TensorRT/HailoRT/CPU)     │   ║
║   │ 3. YOLOv8 Inference + Bounding Box Mapping (Car/Bus/Truck/Bike) │   ║
║   │ 4. Temporal Frame Buffer Smoothing (sub-50ms EMA)               │   ║
║   │ 5. Multi-Modal RGB/Thermal Pipeline (lux/solar switching)       │   ║
║   │ 6. VLM Confidence Escalation Buffer (0.15 < conf < 0.40)        │   ║
║   └─────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import cv2
import numpy as np
import time
import logging
import threading
import os
from typing import List, Dict, Any, Tuple, Optional, Callable
from dataclasses import dataclass, field
from collections import deque
from enum import Enum

# Module 2: OBB & 3D Homography Projection
from edge_service.vision.obb_3d_projector import OBB3DProjector

# Logging setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("EnhancedDetector")


# ══════════════════════════════════════════════════════════════════════════
#   CONSTANTS & CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════

# COCO class IDs relevant to parking
VEHICLE_CLASS_MAP = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}
TARGET_VEHICLE_CLASSES = {2, 3, 5, 7}

# Default inference dimensions
DEFAULT_INPUT_WIDTH = 640
DEFAULT_INPUT_HEIGHT = 640

# Confidence thresholds
HIGH_CONF_THRESHOLD = 0.40
LOW_CONF_THRESHOLD = 0.15
UNCERTAIN_LOWER = 0.15
UNCERTAIN_UPPER = 0.40

# Temporal smoothing
DEFAULT_SMOOTHING_ALPHA = 0.15   # EMA decay factor (sub-50ms response)
DEFAULT_OCCUPANCY_THRESHOLD = 0.35  # Threshold for binary occupancy decision

# CLAHE defaults
CLAHE_CLIP_LIMIT = 2.0
CLAHE_TILE_GRID_SIZE = (8, 8)

# Lux thresholds for multi-modal switching
LUX_NIGHT_THRESHOLD = 50       # Below this → use thermal if available
LUX_DAY_THRESHOLD = 200        # Above this → use RGB

# Solar schedule (hour in 24h format, 0-23)
SOLAR_NIGHT_START = 19  # 7 PM
SOLAR_DAY_START = 6     # 6 AM


# ══════════════════════════════════════════════════════════════════════════
#   ENUMS & DATA CLASSES
# ══════════════════════════════════════════════════════════════════════════

class ExecutionProvider(Enum):
    """Supported hardware acceleration providers."""
    AUTO = "auto"                     # Auto-detect best available
    CUDA = "CUDAExecutionProvider"    # NVIDIA GPU
    TENSORRT = "TensorrtExecutionProvider"  # NVIDIA TensorRT
    CPU = "CPUExecutionProvider"      # CPU fallback
    OPENVINO = "OpenVINOExecutionProvider"  # Intel
    COREML = "CoreMLExecutionProvider"      # Apple Silicon
    HAILO = "hailo"                   # Hailo-15H NPU (via HailoRT)


class PipelineMode(Enum):
    """Multi-modal pipeline selection."""
    RGB = "rgb"
    THERMAL = "thermal"
    AUTO = "auto"  # Switch based on lux/solar schedule


@dataclass
class Detection:
    """Single vehicle detection result."""
    bbox: List[int]          # [x1, y1, x2, y2] in pixel coordinates
    confidence: float        # 0.0 to 1.0
    class_id: int            # COCO class ID
    timestamp: float         # Detection timestamp (seconds since epoch)
    class_name: str = ""     # Human-readable class name (auto-filled)
    source: str = "rgb"      # "rgb" or "thermal"
    angle: float = 0.0       # OBB rotation angle in radians (0 = axis-aligned)

    def __post_init__(self):
        if not self.class_name:
            self.class_name = VEHICLE_CLASS_MAP.get(self.class_id, f"class_{self.class_id}")


@dataclass
class SlotOccupancy:
    """Smoothed occupancy state for a single parking slot."""
    slot_id: str
    raw_occupancy: float = 0.0       # Raw detection overlap ratio
    smoothed_occupancy: float = 0.0   # EMA-smoothed occupancy
    is_occupied: bool = False
    confidence: float = 0.0
    last_update: float = 0.0


@dataclass
class VLMQueueItem:
    """Item queued for VLM escalation verification."""
    detection: Detection
    slot_id: str
    cropped_frame: np.ndarray
    timestamp: float
    retry_count: int = 0
    max_retries: int = 3


# ══════════════════════════════════════════════════════════════════════════
#   1. CLAHE & CONTRAST PRE-PROCESSING
# ══════════════════════════════════════════════════════════════════════════

class CLAHEPreprocessor:
    """
    Adaptive histogram equalization for night, rain, and shadow enhancement.
    
    Applies CLAHE on the L channel in LAB color space with:
      - clipLimit = 2.0  (limits contrast amplification to reduce noise)
      - tileGridSize = (8, 8) (local region size for equalization)
    
    Includes optional denoising via fast Non-Local Means or Gaussian blur
    for low-light scenarios.
    """

    def __init__(
        self,
        clip_limit: float = CLAHE_CLIP_LIMIT,
        tile_grid_size: Tuple[int, int] = CLAHE_TILE_GRID_SIZE,
        enable_denoising: bool = False,
        denoise_strength: float = 5.0,
    ):
        self.clip_limit = clip_limit
        self.tile_grid_size = tile_grid_size
        self.enable_denoising = enable_denoising
        self.denoise_strength = denoise_strength

        # Create CLAHE object
        self.clahe = cv2.createCLAHE(
            clipLimit=self.clip_limit,
            tileGridSize=self.tile_grid_size,
        )

        # Pre-compute look-up table for gamma correction
        self._gamma_lut = None
        self._last_gamma = None

        logger.info(
            f"CLAHE initialized: clipLimit={clip_limit}, "
            f"tileGridSize={tile_grid_size}, denoise={enable_denoising}"
        )

    def apply(self, frame: np.ndarray, gamma: Optional[float] = None) -> np.ndarray:
        """
        Apply CLAHE enhancement on the input BGR frame.
        
        Args:
            frame: Input BGR image (H, W, 3)
            gamma: Optional gamma correction value (None = auto)
        
        Returns:
            Enhanced BGR image
        """
        if frame is None or frame.size == 0:
            return frame

        # Step 1: Optional fast denoising for low-light (Gaussian — sub-5ms vs NLM ~1.6s @ 1080p)
        if self.enable_denoising:
            ksize = max(3, int(self.denoise_strength) | 1)
            frame = cv2.GaussianBlur(frame, (ksize, ksize), 0)

        # Step 2: Convert BGR → LAB
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)

        # Step 3: Apply CLAHE on L channel
        l_enhanced = self.clahe.apply(l_channel)

        # Step 4: Optional gamma correction for very dark frames
        if gamma is not None and gamma != 1.0:
            if self._last_gamma != gamma:
                self._gamma_lut = np.array(
                    [((i / 255.0) ** (1.0 / gamma)) * 255 for i in range(256)],
                    dtype=np.uint8,
                )
                self._last_gamma = gamma
            l_enhanced = cv2.LUT(l_enhanced, self._gamma_lut)

        # Step 5: Merge and convert back to BGR
        enhanced_lab = cv2.merge((l_enhanced, a_channel, b_channel))
        enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

        return enhanced_bgr

    def auto_gamma(self, frame: np.ndarray) -> float:
        """
        Automatically estimate gamma correction based on frame luminance.
        
        Returns:
            Gamma value (> 1 brightens, < 1 darkens)
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_luminance = np.mean(gray)

        if mean_luminance < 50:
            return 1.8  # Very dark → brighten significantly
        elif mean_luminance < 80:
            return 1.4
        elif mean_luminance < 120:
            return 1.2
        else:
            return 1.0  # Already bright enough


# ══════════════════════════════════════════════════════════════════════════
#   2. HARDWARE ACCELERATION SWITCH — ONNX RUNTIME INFERENCE
# ══════════════════════════════════════════════════════════════════════════

class ONNXInferenceEngine:
    """
    ONNX Runtime inference engine with support for multiple execution providers.
    
    Provider priority (auto mode):
      1. TensorrtExecutionProvider  (NVIDIA Jetson / dGPU)
      2. CUDAExecutionProvider       (NVIDIA GPU)
      3. OpenVINOExecutionProvider   (Intel)
      4. CPUExecutionProvider        (Fallback)
    
    Also supports HailoRT via separate initialization path.
    """

    def __init__(
        self,
        model_path: str,
        provider: ExecutionProvider = ExecutionProvider.AUTO,
        input_width: int = DEFAULT_INPUT_WIDTH,
        input_height: int = DEFAULT_INPUT_HEIGHT,
        conf_threshold: float = HIGH_CONF_THRESHOLD,
        iou_threshold: float = 0.45,
        target_classes: set = TARGET_VEHICLE_CLASSES,
    ):
        self.model_path = model_path
        self.provider = provider
        self.input_width = input_width
        self.input_height = input_height
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes

        self.session = None
        self.input_name = None
        self.output_names = None
        self.is_hailo = False
        self._load_model()

    def _resolve_providers(self) -> List[str]:
        """Resolve the list of ONNX Runtime providers based on configuration."""
        if self.provider == ExecutionProvider.AUTO:
            # Try providers in order of performance
            return [
                "TensorrtExecutionProvider",
                "CUDAExecutionProvider",
                "OpenVINOExecutionProvider",
                "CoreMLExecutionProvider",
                "CPUExecutionProvider",
            ]
        elif self.provider == ExecutionProvider.TENSORRT:
            return ["TensorrtExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"]
        elif self.provider == ExecutionProvider.CUDA:
            return ["CUDAExecutionProvider", "CPUExecutionProvider"]
        elif self.provider == ExecutionProvider.OPENVINO:
            return ["OpenVINOExecutionProvider", "CPUExecutionProvider"]
        elif self.provider == ExecutionProvider.COREML:
            return ["CoreMLExecutionProvider", "CPUExecutionProvider"]
        else:
            return ["CPUExecutionProvider"]

    def _load_model(self):
        """Load the ONNX model with the selected execution providers."""
        try:
            import onnxruntime as ort

            providers = self._resolve_providers()

            # Filter to available providers only
            available_providers = ort.get_available_providers()
            valid_providers = [p for p in providers if p in available_providers]

            if not valid_providers:
                valid_providers = ["CPUExecutionProvider"]
                logger.warning("No hardware accelerator found — falling back to CPU")

            # Create inference session
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            sess_options.intra_op_num_threads = max(1, (os.cpu_count() or 4) // 2)
            sess_options.inter_op_num_threads = 1

            self.session = ort.InferenceSession(
                self.model_path,
                sess_options=sess_options,
                providers=valid_providers,
            )

            # Get input/output details
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [output.name for output in self.session.get_outputs()]

            # Determine input shape
            input_shape = self.session.get_inputs()[0].shape
            if input_shape:
                self.input_width = input_shape[3] if len(input_shape) == 4 else self.input_width
                self.input_height = input_shape[2] if len(input_shape) == 4 else self.input_height

            provider_used = self.session.get_providers()[0]
            logger.info(
                f"ONNX model loaded: {self.model_path} "
                f"→ provider: {provider_used} "
                f"| input: {self.input_width}x{self.input_height}"
            )

        except ImportError:
            logger.error("onnxruntime not installed. Install with: pip install onnxruntime-gpu")
            raise
        except Exception as e:
            logger.error(f"ONNX model load failed: {e}")
            raise

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """
        Preprocess a BGR frame into ONNX input tensor.
        
        Args:
            frame: BGR image (H, W, 3)
        
        Returns:
            Normalized input tensor (1, 3, H, W) in RGB order
        """
        # Resize to model input dimensions
        resized = cv2.resize(frame, (self.input_width, self.input_height))

        # Convert BGR → RGB
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

        # Normalize to [0, 1]
        normalized = rgb.astype(np.float32) / 255.0

        # Transpose HWC → CHW and add batch dimension
        tensor = np.transpose(normalized, (2, 0, 1))[np.newaxis, :]

        return tensor

    def infer(self, tensor: np.ndarray) -> np.ndarray:
        """
        Run ONNX inference.
        
        Args:
            tensor: Preprocessed input tensor (1, 3, H, W)
        
        Returns:
            Raw model output
        """
        outputs = self.session.run(self.output_names, {self.input_name: tensor})
        return outputs[0]

    def postprocess(
        self,
        raw_output: np.ndarray,
        original_shape: Tuple[int, int],
    ) -> Tuple[List[np.ndarray], List[float], List[int]]:
        """
        Post-process YOLOv8 ONNX output into bounding boxes.
        
        Args:
            raw_output: Raw ONNX output tensor
            original_shape: (orig_h, orig_w) of the input frame
        
        Returns:
            Tuple of (boxes, confidences, class_ids)
            boxes: List of [x1, y1, w, h] in original image coordinates
            confidences: List of confidence scores
            class_ids: List of class IDs
        """
        orig_h, orig_w = original_shape

        # YOLOv8 ONNX output shape: (84, 8400) for 640 input
        # 84 = 4 (bbox) + 80 (COCO classes)
        output_data = np.squeeze(raw_output)

        # If output is (8400, 84), transpose to (84, 8400)
        if output_data.shape[0] != 84 and output_data.shape[1] == 84:
            output_data = output_data.T

        boxes, confidences, class_ids = [], [], []

        if output_data.shape[0] < 84:
            logger.warning(f"Unexpected output shape: {output_data.shape}")
            return boxes, confidences, class_ids

        # ── Vectorized post-processing (replaces 8400-iteration Python loop) ──
        # Extract all class scores at once: shape (80, N_anchors)
        class_scores = output_data[4:, :]
        # Best class and confidence per anchor
        all_class_ids = np.argmax(class_scores, axis=0)  # (N,)
        all_confidences = np.max(class_scores, axis=0)    # (N,)

        # Filter by target classes and confidence (vectorized boolean mask)
        target_list = sorted(self.target_classes)
        class_mask = np.isin(all_class_ids, target_list)
        conf_mask = all_confidences >= LOW_CONF_THRESHOLD
        valid_mask = class_mask & conf_mask

        # Get indices of surviving detections
        valid_indices = np.where(valid_mask)[0]

        if len(valid_indices) > 0:
            # Decode bboxes for filtered detections (vectorized)
            bboxes_raw = output_data[0:4, valid_indices]  # (4, N_valid)
            cxs, cys, bws, bhs = bboxes_raw[0], bboxes_raw[1], bboxes_raw[2], bboxes_raw[3]

            # Scale to original image dimensions
            scale_x = orig_w / self.input_width
            scale_y = orig_h / self.input_height
            x1s = (cxs - bws / 2) * scale_x
            y1s = (cys - bhs / 2) * scale_y
            box_ws = bws * scale_x
            box_hs = bhs * scale_y

            # Clamp to image boundaries (vectorized)
            x1s = np.clip(x1s, 0, orig_w - 1).astype(int)
            y1s = np.clip(y1s, 0, orig_h - 1).astype(int)
            box_ws = np.maximum(1, np.minimum(box_ws, orig_w - x1s)).astype(int)
            box_hs = np.maximum(1, np.minimum(box_hs, orig_h - y1s)).astype(int)

            # Build output lists
            for x1, y1, bw, bh in zip(x1s, y1s, box_ws, box_hs):
                boxes.append(np.array([x1, y1, bw, bh]))
            confidences = all_confidences[valid_indices].tolist()
            class_ids = all_class_ids[valid_indices].tolist()

        # Apply NMS (Non-Maximum Suppression) using LOW_CONF_THRESHOLD
        # so uncertain detections (0.15 ≤ conf < 0.40) survive for VLM escalation
        if len(boxes) > 0:
            indices = cv2.dnn.NMSBoxes(
                [b.tolist() for b in boxes], confidences,
                LOW_CONF_THRESHOLD, self.iou_threshold
            )
            if indices is not None and len(indices) > 0:
                indices = np.array(indices).flatten()
                boxes = [boxes[i] for i in indices]
                confidences = [confidences[i] for i in indices]
                class_ids = [class_ids[i] for i in indices]
            else:
                boxes, confidences, class_ids = [], [], []

        return boxes, confidences, class_ids

    def detect(self, frame: np.ndarray) -> Tuple[List[np.ndarray], List[float], List[int]]:
        """
        Full inference pipeline: preprocess → infer → postprocess.
        
        Args:
            frame: Input BGR image
        
        Returns:
            Tuple of (boxes, confidences, class_ids)
        """
        tensor = self.preprocess(frame)
        raw_output = self.infer(tensor)
        return self.postprocess(raw_output, frame.shape[:2])


# ══════════════════════════════════════════════════════════════════════════
#   2a. HAILO RT INFERENCE (Hailo-15H / Raspberry Pi NPU)
# ══════════════════════════════════════════════════════════════════════════

class HailoInferenceEngine:
    """
    HailoRT inference engine for Hailo-15H and compatible NPUs.

    Expects a compiled HEF model exported from YOLOv8 via the Hailo Model Zoo
    toolchain. Falls back gracefully when hailo_platform is not installed.
    """

    def __init__(
        self,
        hef_path: str,
        conf_threshold: float = HIGH_CONF_THRESHOLD,
        iou_threshold: float = 0.45,
        target_classes: set = TARGET_VEHICLE_CLASSES,
    ):
        self.hef_path = hef_path
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes
        self._device = None
        self._network_group = None
        self._input_vstreams = None
        self._output_vstreams = None
        self._load_model()

    def _load_model(self):
        try:
            from hailo_platform import (
                HEF,
                VDevice,
                ConfigureParams,
                InputVStreamParams,
                OutputVStreamParams,
                FormatType,
            )

            hef = HEF(self.hef_path)
            params = ConfigureParams.create_from_hef(hef, interface=HEF.NMS)
            self._device = VDevice()
            network_groups = self._device.configure(hef, params)
            self._network_group = network_groups[0]
            self._network_group_params = self._network_group.create_params()

            in_params = InputVStreamParams.make(self._network_group, format_type=FormatType.UINT8)
            out_params = OutputVStreamParams.make(self._network_group, format_type=FormatType.FLOAT32)
            self._input_vstreams = self._network_group.create_input_vstreams(in_params)
            self._output_vstreams = self._network_group.create_output_vstreams(out_params)

            logger.info(f"HailoRT model loaded: {self.hef_path}")
        except ImportError:
            raise ImportError(
                "hailo_platform not installed. Install HailoRT SDK for NPU acceleration."
            )
        except Exception as e:
            logger.error(f"HailoRT model load failed: {e}")
            raise

    def detect(self, frame: np.ndarray) -> Tuple[List[np.ndarray], List[float], List[int]]:
        """Run HailoRT inference on a BGR frame."""
        resized = cv2.resize(frame, (DEFAULT_INPUT_WIDTH, DEFAULT_INPUT_HEIGHT))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

        with self._network_group.activate(self._network_group_params):
            for vs in self._input_vstreams:
                vs.send(rgb)
            raw_outputs = [vs.recv() for vs in self._output_vstreams]

        # Post-process using same YOLOv8 ONNX decoder (Hailo exports compatible tensors)
        engine = ONNXInferenceEngine.__new__(ONNXInferenceEngine)
        engine.input_width = DEFAULT_INPUT_WIDTH
        engine.input_height = DEFAULT_INPUT_HEIGHT
        engine.conf_threshold = self.conf_threshold
        engine.iou_threshold = self.iou_threshold
        engine.target_classes = self.target_classes

        return engine.postprocess(raw_outputs[0], frame.shape[:2])


def resolve_model_path(model_path: str, extensions: Tuple[str, ...] = (".onnx", ".pt", ".hef")) -> str:
    """
    Resolve model path across common locations (cwd, opencv-service, pilot).
    """
    if os.path.isfile(model_path):
        return model_path

    candidates = [
        model_path,
        os.path.join("opencv-service", model_path),
        os.path.join("pilot", model_path),
        os.path.join("edge-service", model_path),
    ]
    for ext in extensions:
        base = model_path.replace(".onnx", "").replace(".pt", "").replace(".hef", "")
        candidates.extend([
            f"{base}{ext}",
            os.path.join("opencv-service", f"{base}{ext}"),
            os.path.join("pilot", f"{base}{ext}"),
        ])

    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate

    return model_path


# ══════════════════════════════════════════════════════════════════════════
#   2b. YOLOv8 PYTORCH FALLBACK
# ══════════════════════════════════════════════════════════════════════════

class YOLOPyTorchFallback:
    """
    Fallback inference engine using Ultralytics YOLOv8 PyTorch.
    
    Used when:
      - ONNX model is not available
      - ONNX Runtime fails to load
      - Running on unsupported hardware
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        conf_threshold: float = HIGH_CONF_THRESHOLD,
        iou_threshold: float = 0.45,
        target_classes: set = TARGET_VEHICLE_CLASSES,
        device: str = "cpu",
    ):
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes

        try:
            from ultralytics import YOLO

            # Determine device
            import torch
            if device == "auto":
                device = "cuda:0" if torch.cuda.is_available() else "cpu"

            self.device = device
            self.model = YOLO(model_path)

            # Warm-up inference
            dummy = np.zeros((320, 320, 3), dtype=np.uint8)
            self.model.predict(dummy, verbose=False, device=self.device)

            logger.info(f"YOLOv8 PyTorch fallback loaded: {model_path} on {self.device}")

        except ImportError:
            logger.error("ultralytics not installed. Install with: pip install ultralytics")
            raise
        except Exception as e:
            logger.error(f"YOLOv8 model load failed: {e}")
            raise

    def detect(self, frame: np.ndarray) -> Tuple[List[np.ndarray], List[float], List[int]]:
        """
        Run PyTorch inference.
        
        Args:
            frame: Input BGR image
        
        Returns:
            Tuple of (boxes, confidences, class_ids)
        """
        results = self.model.predict(
            frame, verbose=False, device=self.device, imgsz=640
        )[0]

        boxes, confidences, class_ids = [], [], []

        for box in results.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])

            if cls_id not in self.target_classes:
                continue
            if conf < LOW_CONF_THRESHOLD:
                continue

            xyxy = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = map(int, xyxy.tolist())

            # Convert to [x1, y1, w, h]
            w = max(1, x2 - x1)
            h = max(1, y2 - y1)

            boxes.append(np.array([x1, y1, w, h]))
            confidences.append(float(conf))
            class_ids.append(cls_id)

        # Apply NMS using LOW_CONF_THRESHOLD so uncertain detections survive
        if len(boxes) > 0:
            indices = cv2.dnn.NMSBoxes(
                [b.tolist() for b in boxes], confidences,
                LOW_CONF_THRESHOLD, self.iou_threshold
            )
            if indices is not None and len(indices) > 0:
                indices = np.array(indices).flatten()
                boxes = [boxes[i] for i in indices]
                confidences = [confidences[i] for i in indices]
                class_ids = [class_ids[i] for i in indices]
            else:
                boxes, confidences, class_ids = [], [], []

        return boxes, confidences, class_ids


# ══════════════════════════════════════════════════════════════════════════
#   3. MULTI-MODAL PIPELINE SWITCHING
# ══════════════════════════════════════════════════════════════════════════

class MultiModalPipeline:
    """
    Manages RGB/Thermal dual-modal pipeline switching.
    
    Switching strategies:
      1. Lux sensor threshold (if lux value provided)
      2. Solar schedule (time-of-day based)
      3. Manual override
    
    Thermal pipeline uses a separate model path and is activated when
    lighting conditions are poor.
    """

    def __init__(
        self,
        rgb_model_path: str = "yolov8n.onnx",
        thermal_model_path: Optional[str] = None,
        mode: PipelineMode = PipelineMode.AUTO,
        lux_night_threshold: float = LUX_NIGHT_THRESHOLD,
        lux_day_threshold: float = LUX_DAY_THRESHOLD,
        solar_night_start: int = SOLAR_NIGHT_START,
        solar_day_start: int = SOLAR_DAY_START,
        use_clahe: bool = True,
        execution_provider: ExecutionProvider = ExecutionProvider.AUTO,
        conf_threshold: float = HIGH_CONF_THRESHOLD,
        iou_threshold: float = 0.45,
        target_classes: set = TARGET_VEHICLE_CLASSES,
        max_inference_dim: int = 640,
    ):
        self.mode = mode
        self.lux_night_threshold = lux_night_threshold
        self.lux_day_threshold = lux_day_threshold
        self.solar_night_start = solar_night_start
        self.solar_day_start = solar_day_start
        self.current_pipeline = "rgb"
        self._last_switch_time = 0
        self._switch_cooldown = 5.0  # seconds between switches
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes
        self.execution_provider = execution_provider
        self.max_inference_dim = max_inference_dim

        # Initialize CLAHE preprocessor
        self.clahe = CLAHEPreprocessor() if use_clahe else None

        # Initialize inference engines
        self._rgb_engine = self._create_engine(rgb_model_path)
        
        if thermal_model_path:
            self._thermal_engine = self._create_engine(thermal_model_path)
            logger.info(f"Thermal model loaded: {thermal_model_path}")
        else:
            self._thermal_engine = None
            logger.info("No thermal model provided — RGB-only mode")

    def _create_engine(self, model_path: str):
        """Create inference engine with fallback chain: Hailo → ONNX → PyTorch."""
        resolved = resolve_model_path(model_path)

        # Hailo HEF model
        if resolved.endswith(".hef") or self.execution_provider == ExecutionProvider.HAILO:
            hef_path = resolved if resolved.endswith(".hef") else resolved.replace(".onnx", ".hef")
            try:
                return HailoInferenceEngine(
                    hef_path,
                    conf_threshold=self.conf_threshold,
                    iou_threshold=self.iou_threshold,
                    target_classes=self.target_classes,
                )
            except Exception as e:
                logger.warning(f"HailoRT load failed ({e}), trying ONNX fallback")

        # ONNX model
        if resolved.endswith(".onnx") or not resolved.endswith(".pt"):
            onnx_path = resolved if resolved.endswith(".onnx") else resolved.replace(".pt", ".onnx")
            if os.path.isfile(onnx_path):
                try:
                    return ONNXInferenceEngine(
                        onnx_path,
                        provider=self.execution_provider,
                        conf_threshold=self.conf_threshold,
                        iou_threshold=self.iou_threshold,
                        target_classes=self.target_classes,
                    )
                except Exception as e:
                    logger.warning(f"ONNX load failed ({e}), trying PyTorch fallback")

        # Fallback to PyTorch
        pt_path = resolved.replace(".onnx", ".pt").replace(".hef", ".pt")
        pt_path = resolve_model_path(pt_path, extensions=(".pt",))
        try:
            return YOLOPyTorchFallback(
                pt_path,
                conf_threshold=self.conf_threshold,
                iou_threshold=self.iou_threshold,
                target_classes=self.target_classes,
            )
        except Exception as e:
            logger.error(f"All inference engines failed for {model_path}: {e}")
            raise

    def get_current_pipeline(self) -> str:
        """Returns 'rgb' or 'thermal' — the currently active pipeline."""
        return self.current_pipeline

    def select_pipeline(
        self,
        lux_value: Optional[float] = None,
        current_hour: Optional[int] = None,
    ) -> str:
        """
        Select the active pipeline based on lighting conditions.
        
        Args:
            lux_value: Current lux sensor reading (optional)
            current_hour: Current hour in 24h format (optional, auto if None)
        
        Returns:
            'rgb' or 'thermal'
        """
        if self.mode == PipelineMode.RGB:
            self.current_pipeline = "rgb"
            return "rgb"

        if self.mode == PipelineMode.THERMAL:
            self.current_pipeline = "thermal"
            return "thermal"

        # AUTO mode — determine best pipeline
        use_thermal = False

        # Strategy 1: Lux sensor
        if lux_value is not None:
            if lux_value < self.lux_night_threshold:
                use_thermal = True
            elif lux_value > self.lux_day_threshold:
                use_thermal = False
            # In between — maintain current to avoid flickering

        # Strategy 2: Solar schedule (fallback if no lux)
        elif current_hour is not None or True:
            if current_hour is None:
                current_hour = time.localtime().tm_hour

            if current_hour >= self.solar_night_start or current_hour < self.solar_day_start:
                use_thermal = True
            else:
                use_thermal = False

        # Apply cooldown to prevent rapid switching
        now = time.time()
        if (now - self._last_switch_time) < self._switch_cooldown:
            return self.current_pipeline

        # If thermal engine not available, stay RGB
        if use_thermal and self._thermal_engine is None:
            use_thermal = False

        selected = "thermal" if use_thermal else "rgb"
        if selected != self.current_pipeline:
            logger.info(f"Pipeline switched: {self.current_pipeline} → {selected}")
            self.current_pipeline = selected
            self._last_switch_time = now

        return selected

    def process_frame(
        self,
        frame: np.ndarray,
        thermal_frame: Optional[np.ndarray] = None,
        lux_value: Optional[float] = None,
    ) -> Tuple[np.ndarray, List[np.ndarray], List[float], List[int]]:
        """
        Process a frame through the active pipeline.
        
        Args:
            frame: RGB BGR image
            thermal_frame: Optional thermal image (if thermal pipeline active)
            lux_value: Optional lux sensor reading
        
        Returns:
            Tuple of (processed_frame, boxes, confidences, class_ids)
        """
        # Select pipeline
        pipeline = self.select_pipeline(lux_value)

        # Get the appropriate frame and engine
        if pipeline == "thermal" and thermal_frame is not None:
            input_frame = thermal_frame
            engine = self._thermal_engine
        else:
            input_frame = frame
            engine = self._rgb_engine

        # Downscale large frames for sub-50ms edge latency
        orig_h, orig_w = input_frame.shape[:2]
        scale = 1.0
        work_frame = input_frame
        if max(orig_h, orig_w) > self.max_inference_dim:
            scale = self.max_inference_dim / max(orig_h, orig_w)
            work_frame = cv2.resize(
                input_frame,
                (int(orig_w * scale), int(orig_h * scale)),
                interpolation=cv2.INTER_AREA,
            )

        # Apply CLAHE preprocessing
        if self.clahe:
            if pipeline == "thermal":
                gamma = self.clahe.auto_gamma(frame)
                processed = self.clahe.apply(work_frame, gamma=gamma)
            else:
                processed = self.clahe.apply(work_frame)
        else:
            processed = work_frame

        # Run detection
        boxes, confidences, class_ids = engine.detect(processed)

        # Scale boxes back to original resolution
        if scale != 1.0 and boxes:
            inv = 1.0 / scale
            scaled_boxes = []
            for box in boxes:
                x, y, w, h = box
                scaled_boxes.append(
                    np.array([int(x * inv), int(y * inv), int(w * inv), int(h * inv)])
                )
            boxes = scaled_boxes

        return processed, boxes, confidences, class_ids


# ══════════════════════════════════════════════════════════════════════════
#   4. TEMPORAL FRAME BUFFER SMOOTHING
# ══════════════════════════════════════════════════════════════════════════

class TemporalFrameBuffer:
    """
    Sub-50ms temporal frame buffer using Exponential Moving Average (EMA)
    to eliminate false occupancy toggles during transient vehicle passes.
    
    Features:
      - EMA smoothing with configurable alpha (0.05-0.30)
      - Per-slot occupancy tracking
      - Configurable binary decision threshold
      - Timestamp tracking for hysteresis
      - Burst detection for fast-moving vehicles
    
    The buffer ensures that brief occlusion (e.g., a pedestrian walking past)
    does not trigger false AVAILABLE→OCCUPIED→AVAILABLE toggles.
    """

    def __init__(
        self,
        alpha: float = DEFAULT_SMOOTHING_ALPHA,
        occupancy_threshold: float = DEFAULT_OCCUPANCY_THRESHOLD,
        hold_frames: int = 3,          # Frames to hold state before switching
        debounce_clear_frames: int = 5, # Frames of sustained clear before AVAILABLE
    ):
        self.alpha = max(0.05, min(0.50, alpha))  # Clamp between 0.05 and 0.50
        self.occupancy_threshold = occupancy_threshold
        self.hold_frames = hold_frames
        self.debounce_clear_frames = debounce_clear_frames

        # Per-slot state: slot_id → SlotOccupancy
        self._slots: Dict[str, SlotOccupancy] = {}

        # Transient hold counters
        self._occupy_counters: Dict[str, int] = {}  # Frames above threshold
        self._clear_counters: Dict[str, int] = {}    # Frames below threshold

        logger.info(
            f"TemporalFrameBuffer initialized: alpha={alpha}, "
            f"threshold={occupancy_threshold}, hold={hold_frames}"
        )

    def register_slot(self, slot_id: str):
        """Register a new slot for tracking."""
        if slot_id not in self._slots:
            self._slots[slot_id] = SlotOccupancy(slot_id=slot_id)
            self._occupy_counters[slot_id] = 0
            self._clear_counters[slot_id] = 0

    def update(
        self,
        slot_id: str,
        raw_overlap_ratio: float,
        detection_confidence: float,
    ) -> SlotOccupancy:
        """
        Update the smoothed occupancy for a slot.
        
        Args:
            slot_id: Slot identifier
            raw_overlap_ratio: Raw IoU overlap ratio from detection (0.0-1.0)
            detection_confidence: Confidence of the detection (0.0-1.0)
        
        Returns:
            Updated SlotOccupancy with smoothed state
        """
        self.register_slot(slot_id)
        slot = self._slots[slot_id]

        # Step 1: Apply EMA smoothing
        smoothed = (self.alpha * raw_overlap_ratio) + ((1.0 - self.alpha) * slot.smoothed_occupancy)

        # Step 2: Combine with confidence weight
        weighted_occupancy = smoothed * detection_confidence

        # Step 3: Apply hysteresis with hold counters
        if weighted_occupancy >= self.occupancy_threshold:
            self._occupy_counters[slot_id] += 1
            self._clear_counters[slot_id] = 0

            # Require sustained detection before marking occupied
            if self._occupy_counters[slot_id] >= self.hold_frames:
                slot.is_occupied = True
        else:
            self._clear_counters[slot_id] += 1
            self._occupy_counters[slot_id] = 0

            # Require sustained absence before marking available
            if self._clear_counters[slot_id] >= self.debounce_clear_frames:
                slot.is_occupied = False

        # Step 4: Update state
        slot.raw_occupancy = raw_overlap_ratio
        slot.smoothed_occupancy = smoothed
        slot.confidence = detection_confidence
        slot.last_update = time.time()

        return slot

    def get_occupancy(self, slot_id: str) -> Optional[SlotOccupancy]:
        """Get the current occupancy state for a slot."""
        return self._slots.get(slot_id)

    def get_all_occupancies(self) -> Dict[str, SlotOccupancy]:
        """Get all slot occupancies."""
        return dict(self._slots)

    def reset(self, slot_id: Optional[str] = None):
        """Reset buffer state for a specific slot or all slots."""
        if slot_id:
            if slot_id in self._slots:
                self._slots[slot_id] = SlotOccupancy(slot_id=slot_id)
                self._occupy_counters[slot_id] = 0
                self._clear_counters[slot_id] = 0
        else:
            for sid in list(self._slots.keys()):
                self._slots[sid] = SlotOccupancy(slot_id=sid)
                self._occupy_counters[sid] = 0
                self._clear_counters[sid] = 0

    @property
    def stats(self) -> Dict[str, Any]:
        """Get buffer statistics."""
        total = len(self._slots)
        occupied = sum(1 for s in self._slots.values() if s.is_occupied)
        return {
            "total_slots": total,
            "occupied": occupied,
            "available": total - occupied,
            "alpha": self.alpha,
            "threshold": self.occupancy_threshold,
        }


# ══════════════════════════════════════════════════════════════════════════
#   5. VLM CONFIDENCE ESCALATION BUFFER
# ══════════════════════════════════════════════════════════════════════════

class VLMConfidenceBuffer:
    """
    Manages uncertain detections (0.15 ≤ conf < 0.40) for VLM escalation.
    
    When a detection falls in the uncertain range:
      - Detection is queued for VLM (Vision-Language Model) verification
      - VLM callback is invoked with the cropped image region
      - If VLM confirms vehicle → detection is upgraded to high confidence
      - If VLM rejects → detection is discarded
      - If VLM times out → detection retries (max 3) or falls back to raw
    """

    def __init__(
        self,
        vlm_callback: Optional[Callable] = None,
        uncertain_lower: float = UNCERTAIN_LOWER,
        uncertain_upper: float = UNCERTAIN_UPPER,
        max_queue_size: int = 32,
        max_retries: int = 3,
        callback_timeout: float = 1.0,  # seconds
    ):
        self.vlm_callback = vlm_callback
        self.uncertain_lower = uncertain_lower
        self.uncertain_upper = uncertain_upper
        self.max_queue_size = max_queue_size
        self.max_retries = max_retries
        self.callback_timeout = callback_timeout

        self._queue: deque = deque(maxlen=max_queue_size)
        self._confirmed: Dict[str, bool] = {}  # slot_id → VLM confirmed
        self._lock = threading.Lock()

        # Start background processing thread
        self._running = True
        self._thread = threading.Thread(target=self._process_queue, daemon=True)
        self._thread.start()

        logger.info(
            f"VLMConfidenceBuffer initialized: range=[{uncertain_lower}, {uncertain_upper})"
        )

    def is_in_uncertain_range(self, confidence: float) -> bool:
        """Check if confidence falls in the uncertain range requiring VLM check."""
        return self.uncertain_lower <= confidence < self.uncertain_upper

    def is_high_confidence(self, confidence: float) -> bool:
        """Check if confidence is high enough for instant processing."""
        return confidence >= self.uncertain_upper

    def is_low_confidence(self, confidence: float) -> bool:
        """Check if confidence is too low (reject as noise/shadow)."""
        return confidence < self.uncertain_lower

    def enqueue(
        self,
        detection: Detection,
        slot_id: str,
        frame: np.ndarray,
    ):
        """
        Queue a detection for VLM verification.
        
        Args:
            detection: The uncertain detection
            slot_id: Target slot ID
            frame: Full frame for cropping
        """
        if not self.vlm_callback:
            # No VLM available — accept uncertain detections as-is
            self._confirmed[slot_id] = True
            return

        # Crop the detection region from the frame
        x1, y1, x2, y2 = detection.bbox
        cropped = frame[y1:y2, x1:x2]

        if cropped.size == 0:
            return

        item = VLMQueueItem(
            detection=detection,
            slot_id=slot_id,
            cropped_frame=cropped,
            timestamp=time.time(),
            max_retries=self.max_retries,
        )

        with self._lock:
            if len(self._queue) < self.max_queue_size:
                self._queue.append(item)

    def is_confirmed(self, slot_id: str) -> Optional[bool]:
        """Check if a slot has been VLM-confirmed."""
        return self._confirmed.get(slot_id)

    def _process_queue(self):
        """Background thread to process VLM verification queue."""
        while self._running:
            item = None
            with self._lock:
                if self._queue:
                    item = self._queue.popleft()

            if item is None:
                time.sleep(0.01)
                continue

            try:
                # Invoke VLM callback
                result = self.vlm_callback(
                    item.cropped_frame,
                    item.detection.class_name,
                )

                # result should be True (vehicle confirmed) or False (noise)
                if result:
                    self._confirmed[item.slot_id] = True
                    logger.debug(f"VLM confirmed vehicle in slot {item.slot_id}")
                else:
                    self._confirmed[item.slot_id] = False
                    logger.debug(f"VLM rejected detection in slot {item.slot_id}")

            except Exception as e:
                logger.warning(f"VLM callback error: {e}")
                item.retry_count += 1

                if item.retry_count < item.max_retries:
                    # Re-queue for retry
                    with self._lock:
                        self._queue.append(item)
                else:
                    # Max retries reached — accept as confirmed (false positive > false negative)
                    self._confirmed[item.slot_id] = True
                    logger.debug(f"VLM max retries for slot {item.slot_id} — defaulting to occupied")

    def stop(self):
        """Stop the background processing thread."""
        self._running = False
        self._thread.join(timeout=2.0)

    def clear(self):
        """Clear all pending and confirmed states."""
        with self._lock:
            self._queue.clear()
        self._confirmed.clear()


# ══════════════════════════════════════════════════════════════════════════
#   6. ENHANCED VEHICLE DETECTOR — MAIN ORCHESTRATOR
# ══════════════════════════════════════════════════════════════════════════

class EnhancedVehicleDetector:
    """
    Upgraded Edge AI Vision Engine for SLOTS Smart Parking.
    
    Combines all enhancements into a unified detector:
      1. CLAHE preprocessing for poor lighting
      2. ONNX/TensorRT with PyTorch fallback
      3. Multi-modal RGB/Thermal pipeline
      4. Temporal frame buffer smoothing
      5. VLM confidence escalation
    
    This is the main entry point for replacing legacy calls in opencv-service/main.py.
    """

    def __init__(
        self,
        model_path: str = "yolov8n.onnx",
        thermal_model_path: Optional[str] = None,
        use_clahe: bool = True,
        conf_threshold: float = HIGH_CONF_THRESHOLD,
        iou_threshold: float = 0.45,
        execution_provider: ExecutionProvider = ExecutionProvider.AUTO,
        pipeline_mode: PipelineMode = PipelineMode.RGB,
        smoothing_alpha: float = DEFAULT_SMOOTHING_ALPHA,
        occupancy_threshold: float = DEFAULT_OCCUPANCY_THRESHOLD,
        vlm_callback: Optional[Callable] = None,
        target_classes: set = TARGET_VEHICLE_CLASSES,
        homography_matrix: Optional[np.ndarray] = None,
    ):
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.target_classes = target_classes

        # 1. Multi-modal pipeline (includes CLAHE + inference engines)
        self.pipeline = MultiModalPipeline(
            rgb_model_path=model_path,
            thermal_model_path=thermal_model_path,
            mode=pipeline_mode,
            use_clahe=use_clahe,
            execution_provider=execution_provider,
            conf_threshold=conf_threshold,
            iou_threshold=iou_threshold,
            target_classes=target_classes,
        )

        # 2. Temporal smoothing buffer
        self.temporal_buffer = TemporalFrameBuffer(
            alpha=smoothing_alpha,
            occupancy_threshold=occupancy_threshold,
        )

        # 3. VLM Confidence buffer
        self.vlm_buffer = VLMConfidenceBuffer(
            vlm_callback=vlm_callback,
        )

        # 4. OBB & 3D Homography Projector (Module 2)
        self.obb_projector = OBB3DProjector(homography_matrix=homography_matrix)

        # Performance tracking
        self._inference_times: List[float] = []
        self._max_samples = 100

        logger.info(
            f"EnhancedVehicleDetector initialized: "
            f"model={model_path}, "
            f"clahe={use_clahe}, "
            f"provider={execution_provider.value}, "
            f"smoothing_alpha={smoothing_alpha}, "
            f"obb_projector=active"
        )

    def preprocess_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Public preprocessing method for external use (e.g., streaming).
        Applies CLAHE enhancement only.
        
        Args:
            frame: Input BGR image
        
        Returns:
            Enhanced BGR image
        """
        if self.pipeline.clahe:
            return self.pipeline.clahe.apply(frame)
        return frame

    def detect_vehicles(
        self,
        frame: np.ndarray,
        thermal_frame: Optional[np.ndarray] = None,
        lux_value: Optional[float] = None,
    ) -> List[Detection]:
        """
        Run full detection pipeline on a single frame.
        
        Args:
            frame: Input BGR image
            thermal_frame: Optional thermal image
            lux_value: Optional lux sensor reading
        
        Returns:
            List of Detection objects
        """
        start_time = time.perf_counter()

        # Run through multi-modal pipeline
        processed, boxes, confidences, class_ids = self.pipeline.process_frame(
            frame, thermal_frame, lux_value
        )

        # Convert to Detection objects
        detections = []
        now = time.time()
        source = self.pipeline.get_current_pipeline()

        for box_arr, conf, cls_id in zip(boxes, confidences, class_ids):
            x1, y1, w, h = box_arr
            detection = Detection(
                bbox=[x1, y1, x1 + w, y1 + h],
                confidence=conf,
                class_id=cls_id,
                timestamp=now,
                source=source,
            )
            detections.append(detection)

        # Track performance
        elapsed = time.perf_counter() - start_time
        self._inference_times.append(elapsed)
        if len(self._inference_times) > self._max_samples:
            self._inference_times.pop(0)

        return detections

    def map_vehicles_to_slots(
        self,
        detections: List[Detection],
        slot_polygons: List[Dict[str, Any]],
        overlap_threshold: float = 0.30,
        use_smoothing: bool = True,
        frame: Optional[np.ndarray] = None,
    ) -> List[Dict[str, Any]]:
        """
        Map detections to parking slots with temporal smoothing.
        
        Args:
            detections: List of Detection objects
            slot_polygons: List of slot definitions, each with:
                - id: Slot identifier
                - coordinates: List of [x, y] corner points
                - slotNumber: Slot number (optional)
            overlap_threshold: Minimum IoU overlap to consider a slot occupied
            use_smoothing: Whether to apply temporal EMA smoothing
        
        Returns:
            List of slot status dicts:
                {
                    "slotId": str,
                    "status": "OCCUPIED" | "AVAILABLE",
                    "overlapRatio": float,
                    "confidence": float,
                    "smoothed": bool
                }
        """
        slot_status_list = []

        for slot in slot_polygons:
            slot_id = slot.get("id") or slot.get("slotId")
            if not slot_id:
                continue

            # Get slot polygon coordinates
            coords = slot.get("coordinates", [])
            if not coords:
                # Fallback: use x, y, w, h format
                sx = float(slot.get("x", 0))
                sy = float(slot.get("y", 0))
                sw = float(slot.get("width", 240))
                sh = float(slot.get("height", 140))
                slot_poly = np.array([[sx, sy], [sx + sw, sy], [sx + sw, sy + sh], [sx, sy + sh]], dtype=np.int32)
            else:
                slot_poly = np.array(coords, dtype=np.int32)

            # Compute slot area
            slot_area = max(cv2.contourArea(slot_poly), 1.0)

            # Find best overlapping detection
            best_overlap = 0.0
            best_confidence = 0.0
            best_detection = None

            for det in detections:
                x1, y1, x2, y2 = det.bbox
                det_poly = np.array(
                    [[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.int32
                )

                # Calculate intersection area using mask-based polygon intersection
                inter_area = _compute_polygon_intersection_area(slot_poly, det_poly)

                if inter_area > 0:
                    overlap_ratio = inter_area / max(slot_area, 1.0)

                    if overlap_ratio > best_overlap:
                        best_overlap = overlap_ratio
                        best_confidence = det.confidence
                        best_detection = det

            # Check VLM confirmation for uncertain detections
            vlm_confirmed = self.vlm_buffer.is_confirmed(slot_id)
            if vlm_confirmed is True:
                # VLM confirmed a vehicle
                best_overlap = max(best_overlap, overlap_threshold)
                best_confidence = max(best_confidence, 0.50)
            elif vlm_confirmed is False:
                # VLM rejected — treat as available
                best_overlap = 0.0
                best_confidence = 0.0

            if best_detection and self.vlm_buffer.is_in_uncertain_range(best_confidence):
                # Queue for VLM verification when frame is available
                if frame is not None:
                    self.vlm_buffer.enqueue(best_detection, slot_id, frame)

            if use_smoothing:
                # Apply temporal smoothing
                slot_state = self.temporal_buffer.update(
                    slot_id, best_overlap, best_confidence
                )
                is_occupied = slot_state.is_occupied
                display_overlap = slot_state.smoothed_occupancy
                display_confidence = slot_state.confidence
            else:
                # Direct decision without smoothing
                is_occupied = best_overlap >= overlap_threshold
                display_overlap = best_overlap
                display_confidence = best_confidence

            slot_status_list.append({
                "slotId": slot_id,
                "slotNumber": slot.get("slotNumber", ""),
                "status": "OCCUPIED" if is_occupied else "AVAILABLE",
                "overlapRatio": round(display_overlap, 3),
                "confidence": round(display_confidence, 3),
                "smoothed": use_smoothing,
            })

        return slot_status_list

    def detect_and_evaluate_obb(
        self,
        frame: np.ndarray,
        slot_polygons: List[Dict[str, Any]],
        use_smoothing: bool = True,
        min_overlap_ratio: float = 0.35,
        max_overhang_ratio: float = 0.20,
    ) -> List[Dict[str, Any]]:
        """
        Execute OBB detection and map true oriented ground footprints to slot polygons.

        This is the Module 2 enhanced method that uses Oriented Bounding Boxes (OBB)
        and overhang-aware polygon intersection to eliminate false neighbor-slot
        occupancy triggers from diagonally parked vehicles and overhanging SUVs/trucks.

        Pipeline:
          1. Preprocess frame (CLAHE)
          2. Run vehicle detection
          3. Convert axis-aligned bboxes to OBB format [cx, cy, w, h, θ]
          4. Evaluate ground occupancy using OBB3DProjector
          5. Apply temporal smoothing (optional)

        Args:
            frame: Input BGR image
            slot_polygons: List of slot definitions with 'id' and 'coordinates'
            use_smoothing: Whether to apply temporal EMA smoothing
            min_overlap_ratio: Minimum floor contact area (default: 0.35)
            max_overhang_ratio: Maximum vehicle overhang allowed (default: 0.20)

        Returns:
            List of slot status dicts with OBB-specific fields:
                {
                    "slotId": str,
                    "status": "OCCUPIED" | "AVAILABLE",
                    "groundOverlapRatio": float,
                    "overhangRatio": float,
                    "headingAngleDeg": float | None,
                    "confidence": float,
                    "smoothed": bool
                }
        """
        # 1. Preprocess frame
        preprocessed = self.preprocess_frame(frame)

        # 2. Run vehicle detection
        raw_detections = self.detect_vehicles(preprocessed)

        # 3. Convert detections to OBB format
        obb_detections = []
        for det in raw_detections:
            x1, y1, x2, y2 = det.bbox
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            w = float(x2 - x1)
            h = float(y2 - y1)
            angle = det.angle  # 0.0 for axis-aligned, non-zero for OBB models

            obb_detections.append({
                "obb": [cx, cy, w, h, angle],
                "confidence": det.confidence,
                "class_name": det.class_name,
            })

        # 4. Evaluate ground occupancy using OBB Projector
        results = self.obb_projector.evaluate_slot_occupancy_obb(
            obb_detections=obb_detections,
            slot_polygons=slot_polygons,
            min_overlap_ratio=min_overlap_ratio,
            max_overhang_ratio=max_overhang_ratio,
        )

        # 5. Apply temporal smoothing (optional)
        if use_smoothing:
            for result in results:
                slot_id = result["slotId"]
                overlap = result["groundOverlapRatio"]
                conf = result.get("confidence", 0.5)

                slot_state = self.temporal_buffer.update(slot_id, overlap, conf)
                result["status"] = "OCCUPIED" if slot_state.is_occupied else "AVAILABLE"
                result["smoothed"] = True
        else:
            for result in results:
                result["smoothed"] = False

        return results

    def get_smoothed_status(self, slot_id: str) -> Optional[Dict[str, Any]]:
        """Get the current smoothed status for a specific slot."""
        occ = self.temporal_buffer.get_occupancy(slot_id)
        if occ is None:
            return None
        return {
            "slotId": occ.slot_id,
            "status": "OCCUPIED" if occ.is_occupied else "AVAILABLE",
            "overlapRatio": round(occ.smoothed_occupancy, 3),
            "confidence": round(occ.confidence, 3),
        }

    def get_performance_stats(self) -> Dict[str, Any]:
        """Get inference performance statistics."""
        if not self._inference_times:
            return {"avg_latency_ms": 0, "fps": 0, "samples": 0}

        times = self._inference_times[-50:]  # Last 50 samples
        avg_latency = np.mean(times) * 1000  # Convert to ms
        p99_latency = np.percentile(times, 99) * 1000
        fps = 1.0 / max(np.mean(times), 0.001)

        return {
            "avg_latency_ms": round(avg_latency, 2),
            "p99_latency_ms": round(p99_latency, 2),
            "fps": round(fps, 1),
            "samples": len(self._inference_times),
            "pipeline": self.pipeline.get_current_pipeline(),
        }

    def reset_smoothing(self, slot_id: Optional[str] = None):
        """Reset temporal smoothing for a slot or all slots."""
        self.temporal_buffer.reset(slot_id)

    def cleanup(self):
        """Clean up resources."""
        self.vlm_buffer.stop()
        logger.info("EnhancedVehicleDetector cleaned up")


# ══════════════════════════════════════════════════════════════════════════
#   CONVENIENCE: BBox ↔ Slot Overlap Utilities
# ══════════════════════════════════════════════════════════════════════════

def compute_iou(box1: np.ndarray, box2: np.ndarray) -> float:
    """
    Compute Intersection over Union between two bounding boxes.
    
    Args:
        box1: [x1, y1, x2, y2]
        box2: [x1, y1, x2, y2]
    
    Returns:
        IoU score (0.0 to 1.0)
    """
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - intersection

    return intersection / max(union, 1e-6)


def slot_bbox_from_dict(slot: Dict[str, Any]) -> np.ndarray:
    """
    Convert a slot dict to a bounding box array.
    
    Supports both 'coordinates' format (list of points)
    and 'x/y/width/height' format.
    
    Args:
        slot: Slot dictionary
    
    Returns:
        [x1, y1, x2, y2] bounding box
    """
    if "coordinates" in slot and len(slot["coordinates"]) >= 2:
        pts = np.array(slot["coordinates"])
        x1, y1 = pts.min(axis=0)
        x2, y2 = pts.max(axis=0)
        return np.array([x1, y1, x2, y2])

    x = float(slot.get("x", 0))
    y = float(slot.get("y", 0))
    w = float(slot.get("width", 240))
    h = float(slot.get("height", 140))
    return np.array([x, y, x + w, y + h])


def _compute_polygon_intersection_area(poly1: np.ndarray, poly2: np.ndarray) -> float:
    """
    Compute the intersection area of two polygons using a mask-based approach.

    This is a robust replacement for the unavailable cv2.intersectConvexPolygons
    in OpenCV 5.x. Works with any polygon shape (convex or non-convex).

    Args:
        poly1: First polygon as np.ndarray of shape (N, 2) or (N, 1, 2)
        poly2: Second polygon as np.ndarray of shape (N, 2) or (N, 1, 2)

    Returns:
        Intersection area in pixels (0.0 if no intersection)
    """
    # Reshape to (N, 2)
    p1 = poly1.reshape(-1, 2)
    p2 = poly2.reshape(-1, 2)

    # Find bounding box of both polygons
    all_pts = np.vstack([p1, p2])
    x_min, y_min = np.min(all_pts, axis=0).astype(int)
    x_max, y_max = np.max(all_pts, axis=0).astype(int)

    # Add padding and ensure positive dimensions
    x_min = max(0, x_min - 1)
    y_min = max(0, y_min - 1)
    x_max = max(x_max + 2, x_min + 2)
    y_max = max(y_max + 2, y_min + 2)

    w = int(x_max - x_min)
    h = int(y_max - y_min)

    # Create masks in the bounding box region
    mask1 = np.zeros((h, w), dtype=np.uint8)
    mask2 = np.zeros((h, w), dtype=np.uint8)

    # Offset polygons to the bounding box origin
    offset = np.array([x_min, y_min], dtype=np.int32)
    p1_roi = (p1 - offset).astype(np.int32)
    p2_roi = (p2 - offset).astype(np.int32)

    # Fill polygons
    cv2.fillPoly(mask1, [p1_roi.reshape(-1, 1, 2)], 255)
    cv2.fillPoly(mask2, [p2_roi.reshape(-1, 1, 2)], 255)

    # Compute intersection
    intersection = cv2.bitwise_and(mask1, mask2)
    return float(cv2.countNonZero(intersection))

