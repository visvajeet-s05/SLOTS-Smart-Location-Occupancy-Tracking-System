"""Vision pipeline modules for SLOTS edge AI."""

from edge_service.vision.enhanced_detector import (
    EnhancedVehicleDetector,
    CLAHEPreprocessor,
    TemporalFrameBuffer,
    VLMConfidenceBuffer,
    MultiModalPipeline,
    ONNXInferenceEngine,
    YOLOPyTorchFallback,
    Detection,
    SlotOccupancy,
    ExecutionProvider,
    PipelineMode,
    compute_iou,
    slot_bbox_from_dict,
    resolve_model_path,
)

# Module 2: OBB & 3D Homography Projection
from edge_service.vision.obb_3d_projector import OBB3DProjector

# Module 6: Two-Wheeler Spatial Density Tracker
from edge_service.vision.two_wheeler_tracker import TwoWheelerSpatialTracker

__all__ = [
    "EnhancedVehicleDetector",
    "CLAHEPreprocessor",
    "TemporalFrameBuffer",
    "VLMConfidenceBuffer",
    "MultiModalPipeline",
    "ONNXInferenceEngine",
    "YOLOPyTorchFallback",
    "Detection",
    "SlotOccupancy",
    "ExecutionProvider",
    "PipelineMode",
    "compute_iou",
    "slot_bbox_from_dict",
    "resolve_model_path",
    "OBB3DProjector",
    "TwoWheelerSpatialTracker",
]
