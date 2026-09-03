"""
Import bridge — canonical implementation lives in edge-service/vision/enhanced_detector.py.
"""
import importlib.util
import os
import sys

_SRC = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "edge-service", "vision", "enhanced_detector.py")
)

if not os.path.isfile(_SRC):
    raise ImportError(f"enhanced_detector source not found: {_SRC}")

_spec = importlib.util.spec_from_file_location("edge_service.vision.enhanced_detector", _SRC)
_mod = importlib.util.module_from_spec(_spec)
sys.modules[__name__] = _mod
_spec.loader.exec_module(_mod)

# Re-export public API
for _name in dir(_mod):
    if not _name.startswith("_"):
        globals()[_name] = getattr(_mod, _name)
