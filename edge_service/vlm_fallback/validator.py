"""VLM fallback bridge — canonical code in edge-service/vlm_fallback/."""
import importlib.util
import os
import sys

_SRC = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "edge-service", "vlm_fallback", "validator.py")
)

if not os.path.isfile(_SRC):
    raise ImportError(f"validator source not found: {_SRC}")

_spec = importlib.util.spec_from_file_location("edge_service.vlm_fallback.validator", _SRC)
_mod = importlib.util.module_from_spec(_spec)
sys.modules[__name__] = _mod
_spec.loader.exec_module(_mod)

for _name in dir(_mod):
    if not _name.startswith("_"):
        globals()[_name] = getattr(_mod, _name)
