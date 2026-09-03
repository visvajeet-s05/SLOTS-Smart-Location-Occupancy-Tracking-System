"""
╔══════════════════════════════════════════════════════════════════════════╗
║   SLOTIFY SMART PARKING AI SERVICE  v5.1  — EDGE AI UPGRADE             ║
║   EnhancedVision · CLAHE Preprocessing · ONNX/TensorRT · Temporal EMA   ║
║   Dual-Thread Pipeline · Direct MySQL · WebSocket · VLM Escalation      ║
╚══════════════════════════════════════════════════════════════════════════╝

ARCHITECTURE:
  [Camera Thread]      — reads frames, auto-reconnects on fail
  [Detect Thread]      — runs EnhancedVehicleDetector + temporal smoothing
  [Heartbeat Thread]   — sends pulse to central API every 30s
  [Config Sync Thread] — re-fetches camera URL + slot config every 5 min
  [Booking Sync Thread]— re-fetches active bookings every 10s
  [DDNS Thread]        — updates DuckDNS/Cloudflare with current IP
  [Flask Thread]       — serves MJPEG stream + REST API

DETECTION (Module 1 — Edge AI Upgrade):
  Engine    : EnhancedVehicleDetector (CLAHE + ONNX/TensorRT + Torch fallback)
  Model     : yolov8n.onnx (with yolov8n.pt PyTorch fallback)
  Target    : COCO Classes = car(2), motorcycle(3), bus(5), truck(7)
  Preprocess: CLAHE (LAB L-channel, clip=2.0, tile=8x8)
  Smoothing : Temporal EMA (alpha=0.15) — sub-50ms debounce
  Accel     : TensorRT → CUDA → OpenVINO → CPU (auto-detect)
  VLM       : Low-confidence escalation (0.15-0.40)

STATE ENGINE:
  AVAILABLE  — No booking, no car detected
  RESERVED   — Booking active, car not yet arrived
  OCCUPIED   — Car physically detected (highest priority)
"""

import sys
import io

# Force UTF-8 output on Windows consoles (cp1252 cannot encode box-drawing chars)
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import numpy as np
import threading
import time
import os
import socket
import queue
import requests
import mysql.connector
from dotenv import load_dotenv
import uuid
from typing import List, Dict, Any, Tuple, Optional

# Optional imports — degrade gracefully if not installed
try:
    from predict_demand import predict_occupancy, train_model
    HAS_ML = True
except ImportError:
    HAS_ML = False
    print("[WARN] predict_demand not available — ML features disabled", flush=True)

try:
    from scanner import CameraScanner
    HAS_SCANNER = True
except ImportError:
    HAS_SCANNER = False
    print("[WARN] scanner not available — auto-discovery disabled", flush=True)

# Enhanced Vision Engine (Module 1 — Edge AI Upgrade)
try:
    import sys
    # Add project root to path for edge-service imports
    _proj_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _proj_root not in sys.path:
        sys.path.insert(0, _proj_root)
    from edge_service.vision.enhanced_detector import (
        EnhancedVehicleDetector,
        Detection,
        ExecutionProvider,
        PipelineMode,
        CLAHEPreprocessor,
    )
    HAS_ENHANCED_VISION = True
    print("[ENHANCED] Enhanced vision engine loaded", flush=True)
except ImportError as e:
    HAS_ENHANCED_VISION = False
    print(f"[WARN] Enhanced vision engine not available: {e}", flush=True)
    print("[WARN] Falling back to legacy YOLOv8 PyTorch pipeline", flush=True)


# ── Load .env ──────────────────────────────────────────────────────────────
_base_dir = os.path.dirname(os.path.abspath(__file__))
# 1. Load root .env
load_dotenv(dotenv_path=os.path.join(_base_dir, '..', '.env'))
# 2. OVERRIDE with root .env.local (crucial for EDGE_NODE_ID assignments)
load_dotenv(dotenv_path=os.path.join(_base_dir, '..', '.env.local'), override=True)
# 3. OVERRIDE with local production if running remotely
if os.getenv("NODE_ENV") == "production":
    load_dotenv(dotenv_path=os.path.join(_base_dir, '.env.production'), override=True)

app = Flask(__name__)
CORS(app)

# ── Configuration ──────────────────────────────────────────────────────────
CENTRAL_API_URL      = os.getenv("CENTRAL_API_URL", "http://localhost:3000")
EDGE_NODE_ID         = os.getenv("EDGE_NODE_ID", "default-edge-node")
EDGE_TOKEN           = os.getenv("EDGE_TOKEN", "default-token")
PYTHON_SERVICE_PORT  = int(os.getenv("PYTHON_SERVICE_PORT", 5000))
PARKING_LOT_ID       = os.getenv("PARKING_LOT_ID", "CHENNAI_CENTRAL")
DATABASE_URL         = os.getenv("DATABASE_URL", "")
WS_SERVER_URL        = os.getenv("WS_SERVER_URL",
                          f"http://localhost:{os.getenv('WS_PORT', '4000')}")

# Camera fallback (used only if DB has no camera URL)
_env_ip = os.getenv("CAMERA_IP", "")
_env_url = os.getenv("CAMERA_STREAM_URL", "")

if _env_url:
    CAMERA_STREAM_URL = _env_url
elif _env_ip:
    if not _env_ip.startswith("http"):
        CAMERA_STREAM_URL = f"http://{_env_ip}/video"
    else:
        CAMERA_STREAM_URL = _env_ip
else:
    CAMERA_STREAM_URL = None

# DDNS settings
DDNS_DOMAIN          = os.getenv("DDNS_DOMAIN", "")
DDNS_TOKEN           = os.getenv("DDNS_TOKEN", "")

CONFIG_REFRESH_INTERVAL = int(os.getenv("CONFIG_REFRESH_INTERVAL", 300))  # 5 min

# STEP 3: Add Config
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL", 1)) # 1 second sync
# ══════════════════════════════════════════════════════════════════════════
#   DETECTION CONSTANTS  (YOLOv8) — CAR-ONLY MODE
# ══════════════════════════════════════════════════════════════════════════
# BALANCED MODE (COCO: 2: car, 5: bus, 7: truck)
VEHICLE_CLASS_IDS = [2, 5, 7]
CAR_ONLY_CLASS_ID = 2
CONFIDENCE_THRESHOLD = 0.30  # Low enough for toy cars, high enough for less noise
INFERENCE_MAX_DIM    = 1920
SYNC_INTERVAL        = 0.5   # 500ms — Sane update rate to prevent DB saturation during checkouts

# Enhanced Vision Engine config (Module 1)
ENHANCED_MODEL_PATH     = os.getenv("ENHANCED_MODEL_PATH", "yolov8n.onnx")
ENHANCED_THERMAL_MODEL  = os.getenv("ENHANCED_THERMAL_MODEL", "")
ENHANCED_USE_CLAE      = os.getenv("ENHANCED_USE_CLAE", "true").lower() == "true"
ENHANCED_SMOOTHING_ALPHA = float(os.getenv("ENHANCED_SMOOTHING_ALPHA", "0.15"))
ENHANCED_OCCUPANCY_THRESHOLD = float(os.getenv("ENHANCED_OCCUPANCY_THRESHOLD", "0.35"))
ENHANCED_PIPELINE_MODE  = os.getenv("ENHANCED_PIPELINE_MODE", "auto").lower()

# Slot-Matching Logic (Optimized for toy cars/manual placement)
REF_W, REF_H         = 1920, 1080
SLOT_OVERLAP_MIN     = 0.50    # Reduced for better reliability with toy car variations
CENTER_OVERLAP_MIN   = 0.20
CENTER_STRICT        = False   # Relaxed to allow cars that overlap 50%
BIG_CAR_FRACTION     = 0.95

# Debounce (TUNED FOR INSTANT TRIGGER per user request)
OCCUPY_THRESHOLD     = 1       # Instant detection (1 frame)
CLEAR_THRESHOLD      = 0       # Instant clear (1 frame)
BUFFER_INCREMENT     = 10      # Full buffer fill in 1 frame
BUFFER_DECREMENT     = 10      # Full buffer clear in 1 frame

# Global state
# Standard regions for 1920x1080 resolution
# CRITICAL: ROI must cover the FULL grid area for proper detection.
# A narrow strip causes massive aspect ratio distortion when resized.
ROI_MAP = {
    "virtual-cam-1": (0, 0, 9999, 9999), # Special value for FULL FRAME to avoid cropping issues
    "virtual-cam-2": (0, 0, 1920, 540),      # Top half
    "virtual-cam-3": (0, 540, 1920, 540),    # Bottom half
    "virtual-cam-4": (0, 0, 960, 1080),      # Left half
    "virtual-cam-5": (960, 0, 960, 1080),    # Right half
}

monitors: dict = {}


# ══════════════════════════════════════════════════════════════════════════
#   DATABASE LAYER — Direct MySQL (< 5ms writes)
# ══════════════════════════════════════════════════════════════════════════

def is_inside(inner: dict, outer: dict) -> bool:
    """Check if 'inner' box overlaps with 'outer' box with sufficient area."""
    try:
        # inner: detection box {x, y, w, h}
        # outer: slot box {x, y, w, h}
        ix, iy, iw, ih = inner["x"], inner["y"], inner["w"], inner["h"]
        ox, oy, ow, oh = outer["x"], outer["y"], outer["w"], outer["h"]

        # 1. CORE REQUIREMENT: Centroid Check
        # The center of the vehicle MUST be inside the slot bounds
        cx, cy = ix + iw / 2, iy + ih / 2
        if not (ox <= cx <= ox + ow and oy <= cy <= oy + oh):
            return False

        # 2. OVERLAP REQUIREMENT: Strict Fill
        # Calculate intersection area
        x1, y1 = max(ix, ox), max(iy, oy)
        x2, y2 = min(ix + iw, ox + ow), min(iy + ih, oy + oh)

        if x2 <= x1 or y2 <= y1:
            return False

        intersection_area = (x2 - x1) * (y2 - y1)
        inner_area = iw * ih
        outer_area = ow * oh

        # Perfect Inside logic:
        # If the car is significantly inside the slot (70%)
        # (inner_area - intersection_area) is the part of the car OUTSIDE the slot.
        overlap_fraction = intersection_area / inner_area
        
        if overlap_fraction >= SLOT_OVERLAP_MIN:
            return True
            
        return False
    except Exception:
        return False


def _parse_db_url(url: str) -> dict | None:
    """Parse mysql://user:pass@host:port/dbname → dict of kwargs."""
    try:
        url = url.strip().strip('"').strip("'")
        if not url.startswith("mysql://"):
            return None
        rest = url.replace("mysql://", "")
        auth, host_db = rest.split("@", 1)
        user, password = auth.split(":", 1)
        host_port, dbname = host_db.split("/", 1)
        host, port = (host_port.split(":", 1) if ":" in host_port
                      else (host_port, "3306"))
        return dict(host=host, port=int(port), user=user,
                    password=password, database=dbname)
    except Exception as e:
        print(f"[ERROR] DB URL parse error: {e}", flush=True)
        return None


class DatabaseWriter:
    """Thread-safe, connection-pooled MySQL writer."""

    def __init__(self):
        self._lock   = threading.Lock()
        self._conn   = None
        self._params = _parse_db_url(DATABASE_URL)
        self._connect()

    def _connect(self):
        if not self._params:
            print("[WARN] DB: No DATABASE_URL — HTTP fallback only.", flush=True)
            return
        try:
            self._conn = mysql.connector.connect(
                **self._params,
                connection_timeout=5,
                autocommit=False,
            )
            print("[OK] DB: Direct MySQL connected.", flush=True)
        except Exception as e:
            print(f"[WARN] DB connect failed: {e}", flush=True)
            self._conn = None

    def _ensure_connection(self) -> bool:
        if self._conn and self._conn.is_connected():
            return True
        self._connect()
        return self._conn is not None and self._conn.is_connected()

    def update_slots(self, lot_id: str, slot_updates: list[dict]) -> bool:
        if not slot_updates:
            return True
        with self._lock:
            if not self._ensure_connection():
                return False
            try:
                cursor = self._conn.cursor()
                now = time.strftime("%Y-%m-%d %H:%M:%S")
                for su in slot_updates:
                    if not su.get("slot_id"):
                        continue
                    cursor.execute(
                        """UPDATE Slot SET status=%s, updatedBy='AI',
                           aiConfidence=95.0, updatedAt=%s WHERE id=%s""",
                        (su["new_status"], now, su["slot_id"])
                    )
                    cursor.execute(
                        """INSERT INTO SlotStatusLog
                           (id, slotId, oldStatus, newStatus, updatedBy, aiConfidence, createdAt)
                           VALUES (%s,%s,%s,%s,'AI',95.0,%s)""",
                        (str(uuid.uuid4()), su["slot_id"],
                         su["old_status"], su["new_status"], now)
                    )
                self._conn.commit()
                cursor.close()
                return True
            except Exception as e:
                print(f"[WARN] DB write error: {e}", flush=True)
                try:
                    self._conn.rollback()
                except Exception:
                    pass
                self._conn = None
                return False


_db_writer = DatabaseWriter()


# ══════════════════════════════════════════════════════════════════════════
#   DDNS UPDATER
# ══════════════════════════════════════════════════════════════════════════

class DDNSUpdater:
    """Keeps DuckDNS updated with the current public IP every 5 minutes."""

    def __init__(self):
        self.domain  = DDNS_DOMAIN
        self.token   = DDNS_TOKEN
        self.enabled = bool(self.domain and self.token)
        if self.enabled:
            print(f"[DDNS] Enabled for domain: {self.domain}", flush=True)
            threading.Thread(target=self._loop, daemon=True, name="ddns").start()
        else:
            print("[DDNS] Disabled (set DDNS_DOMAIN + DDNS_TOKEN to enable)", flush=True)

    def _loop(self):
        while True:
            try:
                url = (f"https://www.duckdns.org/update"
                       f"?domains={self.domain}&token={self.token}&ip=")
                resp = requests.get(url, timeout=10)
                if "OK" in resp.text:
                    print(f"[DDNS] OK: Updated {self.domain}", flush=True)
                else:
                    print(f"[DDNS] Warning: DuckDNS response: {resp.text}", flush=True)
            except Exception as e:
                print(f"[DDNS] Update failed: {e}", flush=True)
            time.sleep(300)


# ══════════════════════════════════════════════════════════════════════════
#   EDGE NODE HEARTBEAT
# ══════════════════════════════════════════════════════════════════════════

class EdgeNodePulse:
    """Sends heartbeats to Central API every 30s.  Includes camera URL + tunnel URL."""

    def __init__(self):
        self.node_id = EDGE_NODE_ID
        self.token   = EDGE_TOKEN
        self.lot_id  = PARKING_LOT_ID
        self.api_url = f"{CENTRAL_API_URL}/api/edge/update"
        threading.Thread(target=self._loop, daemon=True, name="heartbeat").start()

    def _get_local_ip(self) -> str:
        """Returns the local network IP of this machine."""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def _loop(self):
        print(f"[Heartbeat] Started for {self.lot_id}", flush=True)
        while True:
            try:
                local_ip = self._get_local_ip()
                payload = {
                    "lotId":      self.lot_id,
                    "edgeNodeId": self.node_id,
                    "edgeToken":  self.token,
                    "slots":      [],
                    "cameraUrl":  CAMERA_STREAM_URL,
                    "tunnelUrl":  os.getenv("PUBLIC_TUNNEL_URL", "")
                }
                resp = requests.post(self.api_url, json=payload, timeout=5)
                if resp.status_code == 200:
                    print(f"[Heartbeat] OK: {self.lot_id} ONLINE (IP: {local_ip})", flush=True)
                else:
                    print(f"[Heartbeat] Warning: {resp.status_code}: {resp.text[:120]}", flush=True)
            except requests.exceptions.ConnectionError:
                print(f"[Heartbeat] Central API unreachable — will retry in 30s", flush=True)
            except Exception as e:
                print(f"[Heartbeat] Error: {e}", flush=True)
            time.sleep(30)


# ══════════════════════════════════════════════════════════════════════════
#   WEBSOCKET BROADCAST
# ══════════════════════════════════════════════════════════════════════════

def _broadcast(lot_id: str, updates: list[dict]):
    """Fire-and-forget WS broadcast (non-blocking)."""
    try:
        requests.post(
            f"{WS_SERVER_URL}/broadcast",
            json={"type": "BULK_SLOT_UPDATE", "lotId": lot_id, "updates": updates},
            timeout=0.5,
        )
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════
#   SMART MONITOR — One instance per parking lot
# ══════════════════════════════════════════════════════════════════════════

# STEP 4: Improve Slot Mapping function check overlap
def is_inside(box: dict, slot: dict) -> bool:
    xA = max(slot["x"], box["x"])
    yA = max(slot["y"], box["y"])
    xB = min(slot["x"] + slot["w"], box["x"] + box["w"])
    yB = min(slot["y"] + slot["h"], box["y"] + box["h"])
    inter = max(0, xB - xA) * max(0, yB - yA)
    if inter > 0:
        coverage = inter / max(1, slot["w"] * slot["h"])
        ccx = box["x"] + box["w"] / 2
        ccy = box["y"] + box["h"] / 2
        inside = (slot["x"] < ccx < slot["x"] + slot["w"]) and (slot["y"] < ccy < slot["y"] + slot["h"])
        if (inside and coverage >= CENTER_OVERLAP_MIN) or (coverage >= SLOT_OVERLAP_MIN):
            return True
    return False


class SmartMonitor:
    """
    Manages one parking lot:
      - Camera capture thread
      - AI detection thread
      - Periodic config sync (camera URL + slot coordinates)
    """

    def __init__(self, lot_id: str, camera_id: str = "virtual-cam-1"):
        self.lot_id      = lot_id
        self.camera_id   = camera_id
        self.roi         = ROI_MAP.get(camera_id, (0, 0, 1920, 1080))
        self.camera_url  = CAMERA_STREAM_URL
        self.running     = False
        self.lock        = threading.Lock()

        self.frame_queue = queue.Queue(maxsize=1)
        self.last_frame  = None
        self.latest_raw_frame = None

        self.slots:        list = []
        self.slot_db_map:  dict = {}
        self.slot_status:  dict = {}
        self.slot_buffer:  dict = {}
        self.vehicle_centroids = []

        # Booking state cache (refreshed periodically)
        self._booked_slots: set = set()  # Set of slot IDs with active bookings
        self._booking_lock = threading.Lock()

# AI Model
        self.net          = None
        self.model_loaded = False
        self.enhanced_detector = None  # EnhancedVehicleDetector instance (Module 1)
        self._load_model()

    # ── Model Loading ──────────────────────────────────────────────────────
    # Uses EnhancedVehicleDetector (CLAHE + ONNX/TensorRT + temporal smoothing)
    # Falls back to legacy YOLOv8 PyTorch if enhanced engine unavailable

    def _load_model(self):
        # Try enhanced engine first (Module 1)
        if HAS_ENHANCED_VISION:
            try:
                from edge_service.vision.enhanced_detector import (
                    EnhancedVehicleDetector,
                    ExecutionProvider,
                    PipelineMode,
                    resolve_model_path,
                )

                # Determine best execution provider
                provider = ExecutionProvider.AUTO
                if os.getenv("ENHANCED_FORCE_CPU", "false").lower() == "true":
                    provider = ExecutionProvider.CPU
                elif os.getenv("ENHANCED_FORCE_CUDA", "false").lower() == "true":
                    provider = ExecutionProvider.CUDA
                elif os.getenv("ENHANCED_FORCE_TENSORRT", "false").lower() == "true":
                    provider = ExecutionProvider.TENSORRT
                elif os.getenv("ENHANCED_FORCE_HAILO", "false").lower() == "true":
                    provider = ExecutionProvider.HAILO

                pipeline_mode = PipelineMode.RGB
                if ENHANCED_PIPELINE_MODE == "thermal":
                    pipeline_mode = PipelineMode.THERMAL
                elif ENHANCED_PIPELINE_MODE == "auto":
                    pipeline_mode = PipelineMode.AUTO

                model_path = resolve_model_path(ENHANCED_MODEL_PATH)
                thermal_path = (
                    resolve_model_path(ENHANCED_THERMAL_MODEL)
                    if ENHANCED_THERMAL_MODEL
                    else None
                )

                # Optional VLM callback for uncertain detections (0.15 <= conf < 0.40)
                vlm_callback = None
                try:
                    from edge_service.vlm_fallback.validator import LowConfidenceValidator
                    vlm_callback = lambda crop, cls_name: True  # placeholder until VLM model wired
                except ImportError:
                    pass

                print(f"[ENHANCED] Loading EnhancedVehicleDetector (provider={provider.value})...", flush=True)
                self.enhanced_detector = EnhancedVehicleDetector(
                    model_path=model_path,
                    thermal_model_path=thermal_path,
                    use_clahe=ENHANCED_USE_CLAE,
                    conf_threshold=CONFIDENCE_THRESHOLD,
                    iou_threshold=0.45,
                    execution_provider=provider,
                    pipeline_mode=pipeline_mode,
                    smoothing_alpha=ENHANCED_SMOOTHING_ALPHA,
                    occupancy_threshold=ENHANCED_OCCUPANCY_THRESHOLD,
                    vlm_callback=vlm_callback,
                )
                # Warm-up pass
                dummy_frame = np.zeros((320, 320, 3), dtype=np.uint8)
                _ = self.enhanced_detector.detect_vehicles(dummy_frame)

                self.model_loaded = True
                print("[ENHANCED] OK: Enhanced Vehicle Detector loaded — Edge AI Active", flush=True)
                return
            except Exception as e:
                print(f"[ENHANCED] Enhanced detector load failed: {e}", flush=True)
                print("[ENHANCED] Falling back to legacy YOLOv8 PyTorch...", flush=True)
                self.enhanced_detector = None

        # Legacy fallback: YOLOv8 PyTorch
        try:
            from ultralytics import YOLO
            import logging
            logging.getLogger("ultralytics").setLevel(logging.ERROR)

            print("[AI] Loading YOLOv8 nano model (legacy fallback)...", flush=True)
            pt_path = ENHANCED_MODEL_PATH.replace(".onnx", ".pt")
            if HAS_ENHANCED_VISION:
                from edge_service.vision.enhanced_detector import resolve_model_path
                pt_path = resolve_model_path(pt_path)
            self.net = YOLO(pt_path)
            
            # Warm-up pass
            dummy_frame = np.zeros((320, 320, 3), dtype=np.uint8)
            self.net.predict(dummy_frame, verbose=False)

            self.model_loaded = True
            print("[AI] OK: YOLO Model loaded — Legacy Edge AI Active", flush=True)
        except Exception as e:
            print(f"[ERROR] Model load failed: {e}", flush=True)
            self.model_loaded = False

    # ── Config Loading (from Central API) ─────────────────────────────────

    def load_config(self):
        """Fetch slot coords + camera URL from central API (scoped to this camera region)."""
        try:
            url = f"{CENTRAL_API_URL}/api/parking/{self.lot_id}/slots?cameraId={self.camera_id}"
            print(f"[Config] Scoped Fetching ({self.camera_id}): {url}", flush=True)
            res = requests.get(url, timeout=8)
            if res.status_code != 200:
                print(f"[Config] HTTP {res.status_code}", flush=True)
                return

            data = res.json()
            self.slots = data.get("slots", [])

            # Dynamic camera URL: Favor the physical local `.env` definition strongly.
            lot_data     = data.get("lot", {})
            db_camera_url = data.get("cameraUrl") or lot_data.get("cameraUrl")
            
            if CAMERA_STREAM_URL:
                self.camera_url = CAMERA_STREAM_URL
            elif db_camera_url:
                if db_camera_url != self.camera_url:
                    print(f"[Config] Camera URL updated from DB: {db_camera_url}", flush=True)
                self.camera_url = db_camera_url
            else:
                print("[Config] No camera URL in DB or .env", flush=True)

            self.slot_db_map = {
                s["slotNumber"]: s
                for s in self.slots
                if s.get("slotNumber") is not None
            }
            print(f"[Config] ✓ {len(self.slots)} slots loaded for {self.lot_id}", flush=True)
            if self.slots:
                s0 = self.slots[0]
                print(f"[Config]   Slot 1: x={s0.get('x')} y={s0.get('y')}", flush=True)

        except Exception as e:
            print(f"[Config] Error: {e}", flush=True)

    # ── Lifecycle ──────────────────────────────────────────────────────────

    # ── Booking-Aware State Helpers ─────────────────────────────────────────

    def _has_active_booking(self, slot_id: str) -> bool:
        """Check if a slot has an active booking (from cache)."""
        with self._booking_lock:
            return slot_id in self._booked_slots

    def _is_valid_transition(self, current: str, target: str) -> bool:
        """Validate state transitions per the state machine rules."""
        VALID_TRANSITIONS = {
            "AVAILABLE": {"RESERVED", "OCCUPIED"},
            "RESERVED":  {"OCCUPIED", "AVAILABLE"},
            "OCCUPIED":  {"AVAILABLE", "RESERVED"},  # RESERVED only when car leaves but booking exists
        }
        return target in VALID_TRANSITIONS.get(current, set())

    def _refresh_bookings(self):
        """Fetch active bookings from DB and update local cache."""
        try:
            if not _db_writer._params:
                # No DB — try API fallback
                try:
                    res = requests.get(
                        f"{CENTRAL_API_URL}/api/slots/active-bookings?lotId={self.lot_id}",
                        timeout=5
                    )
                    if res.status_code == 200:
                        data = res.json()
                        booked_ids = set(data.get("bookedSlotIds", []))
                        with self._booking_lock:
                            self._booked_slots = booked_ids
                        return
                except Exception:
                    pass
                return

            conn = mysql.connector.connect(
                **_db_writer._params,
                connection_timeout=3,
            )
            cursor = conn.cursor()
            now = time.strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute(
                """SELECT DISTINCT slotId FROM booking
                   WHERE parkingLotId = %s
                   AND status IN ('UPCOMING', 'ACTIVE')
                   AND slotId IS NOT NULL
                   AND startTime <= %s AND endTime >= %s""",
                (self.lot_id, now, now)
            )
            booked_ids = set(row[0] for row in cursor.fetchall())
            cursor.close()
            conn.close()

            with self._booking_lock:
                self._booked_slots = booked_ids

            if booked_ids:
                print(f"[Bookings] {len(booked_ids)} active bookings for {self.lot_id}", flush=True)

        except Exception as e:
            print(f"[Bookings] Refresh error: {e}", flush=True)

    def _booking_sync_loop(self):
        """Periodically refresh active bookings (every 10 seconds)."""
        while self.running:
            try:
                self._refresh_bookings()
            except Exception as e:
                print(f"[Bookings] Sync error: {e}", flush=True)
            time.sleep(10)

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def start(self):
        if self.running:
            return
        self.load_config()
        self._refresh_bookings()  # Pre-load bookings

        for s in self.slots:
            sid = s.get("id")
            if sid:
                # Initialize with booking-aware state
                if sid in self._booked_slots:
                    self.slot_status[sid] = "RESERVED"
                else:
                    self.slot_status[sid] = "AVAILABLE"
                self.slot_buffer[sid] = 0

        self.running = True
        threading.Thread(target=self._camera_loop,
                         daemon=True, name=f"cam-{self.lot_id}").start()
        threading.Thread(target=self._detect_loop,
                         daemon=True, name=f"det-{self.lot_id}").start()
        threading.Thread(target=self._config_sync_loop,
                         daemon=True, name=f"sync-{self.lot_id}").start()
        threading.Thread(target=self._booking_sync_loop,
                         daemon=True, name=f"bk-{self.lot_id}").start()
        print(f"[Monitor] ✓ Started: {self.lot_id} (CAR-ONLY mode, booking-aware)", flush=True)

    def stop(self):
        self.running = False
        print(f"[Monitor] Stopped: {self.lot_id}", flush=True)

    # ── Config Sync Loop ───────────────────────────────────────────────────

    def _config_sync_loop(self):
        """Re-fetches camera URL + slot config periodically (handles dynamic IP)."""
        time.sleep(CONFIG_REFRESH_INTERVAL)  # First sync after N minutes
        while self.running:
            try:
                print(f"[Sync] Refreshing config for {self.lot_id}...", flush=True)
                self.load_config()
                # Initialize new slots from sync
                for s in self.slots:
                    sid = s.get("id")
                    if sid and sid not in self.slot_status:
                        self.slot_status[sid] = "AVAILABLE"
                        self.slot_buffer[sid] = 0
            except Exception as e:
                print(f"[Sync] Error: {e}", flush=True)
            time.sleep(CONFIG_REFRESH_INTERVAL)

    # ── Camera Thread ──────────────────────────────────────────────────────

    def _camera_loop(self):
        print(f"[Camera] Connecting to: {self.camera_url}", flush=True)
        cap = None
        consecutive_failures = 0
        last_url = self.camera_url

        while self.running:
            # Check if camera URL changed (dynamic IP)
            current_url = self.camera_url
            if current_url != last_url:
                print(f"[Camera] URL changed → {current_url}", flush=True)
                if cap:
                    cap.release()
                    cap = None
                last_url = current_url

            if cap is None or not cap.isOpened():
                # Before connecting, test reachability
                host_part = current_url.split("//")[-1].split("/")[0]
                host, port_str = (host_part.split(":") if ":" in host_part
                                  else (host_part, "80"))
                try:
                    port = int(port_str)
                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(2)
                    result = s.connect_ex((host, port))
                    s.close()
                    if result != 0:
                        print(f"[Camera] ✗ Unreachable {host}:{port} — retry in 5s", flush=True)
                        time.sleep(5)
                        continue
                except Exception:
                    pass

                cap = cv2.VideoCapture(current_url)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if not cap.isOpened():
                    print(f"[Camera] ✗ OpenCV connect failed — retry in 3s", flush=True)
                    time.sleep(3)
                    continue
                print(f"[Camera] ✓ Connected: {current_url}", flush=True)
                consecutive_failures = 0

            ret, frame = cap.read()
            if not ret:
                # If we're using a static test image or video file, loop it repeatedly
                if "10." not in current_url and "http" not in current_url:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = cap.read()
                
                if not ret:
                    print("[Camera] Frame lost, reconnecting...", flush=True)
                    consecutive_failures += 1
                    if consecutive_failures >= 30:
                        cap.release()
                        cap = None
                        consecutive_failures = 0
                        time.sleep(2)
                    continue

            consecutive_failures = 0
            # Drop old frames — always process latest
            if self.frame_queue.full():
                try:
                    self.frame_queue.get_nowait()
                except Exception:
                    pass
            self.frame_queue.put_nowait(frame)

    # ── Detection Thread ───────────────────────────────────────────────────

    def _detect_loop(self):
        last_sync = 0.0
        while self.running:
            try:
                frame = self.frame_queue.get(timeout=0.5)
            except Exception:
                continue

            if not self.model_loaded:
                # No model — just keep last frame alive
                with self.lock:
                    self.last_frame = frame
                continue

            if self.enhanced_detector is None and self.net is None:
                with self.lock:
                    self.last_frame = frame
                continue

            t0 = time.perf_counter()
            try:
                annotated, changed_slots = self._detect_and_update(frame)
                
                with self.lock:
                    self.latest_raw_frame = frame
                    self.last_frame = annotated

                # FIRE UPDATES IMMEDIATELY (Millisecond Response)
                if changed_slots:
                    self._persist_changes(changed_slots)
            except Exception as e:
                print(f"[RECOVERY] Detection cycle failed: {e}", flush=True)

            elapsed = time.perf_counter() - t0
            
            # FPS Control (~20-30 FPS range for ultra-smooth updates)
            # Reduced sleep to keep processing throughput high
            time.sleep(0.01)

# ── AI Detection ───────────────────────────────────────────────────────
    # Enhanced engine path: Uses EnhancedVehicleDetector (CLAHE + ONNX/TensorRT + temporal smoothing)
    # Legacy path: Uses YOLOv8 PyTorch fallback with integer buffer

    def _detect_and_update(self, frame: np.ndarray) -> tuple[np.ndarray, list[dict]]:
        if self.enhanced_detector is not None:
            return self._detect_and_update_enhanced(frame)
        else:
            return self._detect_and_update_legacy(frame)

    def _detect_and_update_enhanced(self, frame: np.ndarray) -> tuple[np.ndarray, list[dict]]:
        """
        Enhanced detection pipeline:
          1. CLAHE preprocessing (LAB L-channel)
          2. ONNX/TensorRT inference
          3. Slot mapping with temporal EMA smoothing
          4. VLM confidence escalation for uncertain detections
        """
        # ROI cropping
        orig_h, orig_w = frame.shape[:2]
        rx, ry, rw, rh = self.roi
        rx = int(rx * orig_w / REF_W)
        ry = int(ry * orig_h / REF_H)
        rw = int(rw * orig_w / REF_W)
        rh = int(rh * orig_h / REF_H)
        rx = max(0, min(rx, orig_w - 10))
        ry = max(0, min(ry, orig_h - 10))
        rw = max(10, min(rw, orig_w - rx))
        rh = max(10, min(rh, orig_h - ry))
        cropped = frame[ry:ry+rh, rx:rx+rw]
        crop_h, crop_w = cropped.shape[:2]

        # Use enhanced detector's built-in CLAHE preprocessing + inference
        detections = self.enhanced_detector.detect_vehicles(cropped)

        # Build slot polygons from config
        slot_polygons = []
        for idx, slot in enumerate(self.slots):
            sid = slot.get("id")
            if not sid:
                continue
            raw_x = slot.get("x")
            raw_y = slot.get("y")
            if (raw_x is None or raw_x == 0) and (raw_y is None or raw_y == 0):
                cols = 6
                row = idx // cols
                col = idx % cols
                sx = 150 + col * 280
                sy = 150 + row * 180
                sw, sh = 240, 140
            else:
                sx = float(raw_x or 0)
                sy = float(raw_y or 0)
                sw = float(slot.get("width") or 240)
                sh = float(slot.get("height") or 140)
            slot_polygons.append({
                "id": sid,
                "slotNumber": slot.get("slotNumber"),
                "coordinates": [[sx, sy], [sx + sw, sy], [sx + sw, sy + sh], [sx, sy + sh]],
            })

        # Map detections to slots with temporal smoothing + VLM escalation
        slot_results = self.enhanced_detector.map_vehicles_to_slots(
            detections=detections,
            slot_polygons=slot_polygons,
            overlap_threshold=SLOT_OVERLAP_MIN,
            use_smoothing=True,
            frame=cropped,
        )

        # Apply booking-aware state logic on top of enhanced detection
        changed_slots = []
        for sr in slot_results:
            sid = sr["slotId"]
            prev = self.slot_status.get(sid, "AVAILABLE")
            detection_status = sr["status"] == "OCCUPIED"

            # Booking-aware override: if slot is booked but no car, keep RESERVED
            final = sr["status"]
            if not detection_status and self._has_active_booking(sid):
                final = "RESERVED"
            elif detection_status:
                final = "OCCUPIED"
            else:
                final = "AVAILABLE"

            if final != prev:
                if self._is_valid_transition(prev, final):
                    self.slot_status[sid] = final
                    changed_slots.append({
                        "slot_id": sid,
                        "slot_number": sr.get("slotNumber", ""),
                        "old_status": prev,
                        "new_status": final,
                    })
                else:
                    print(f"[STATE] Blocked invalid transition: {prev} → {final} for slot {sid}", flush=True)

        # Annotate frame with enhanced overlay
        annotated = self._annotate_frame(cropped, detections, slot_results, crop_h, crop_w)

        return annotated, changed_slots

    def _detect_and_update_legacy(self, frame: np.ndarray) -> tuple[np.ndarray, list[dict]]:
        """
        Legacy detection pipeline — YOLOv8 PyTorch fallback with integer buffer.
        Used when EnhancedVehicleDetector is not available.
        """
        # PHASE 1: ROI-BASED CROPPING (full frame for virtual-cam-1)
        orig_h, orig_w = frame.shape[:2]
        
        # Scale ROI from reference space to actual frame pixels
        rx, ry, rw, rh = self.roi
        rx = int(rx * orig_w / REF_W)
        ry = int(ry * orig_h / REF_H)
        rw = int(rw * orig_w / REF_W)
        rh = int(rh * orig_h / REF_H)
        
        # Guard rails for cropping
        rx = max(0, min(rx, orig_w - 10))
        ry = max(0, min(ry, orig_h - 10))
        rw = max(10, min(rw, orig_w - rx))
        rh = max(10, min(rh, orig_h - ry))

        # Perform the Crop
        frame = frame[ry:ry+rh, rx:rx+rw]
        
        # PHASE 2: ASPECT-RATIO-PRESERVING RESIZE
        crop_h, crop_w = frame.shape[:2]
        scale = min(INFERENCE_MAX_DIM / crop_w, INFERENCE_MAX_DIM / crop_h)
        if scale < 1.0:
            new_w = int(crop_w * scale)
            new_h = int(crop_h * scale)
            frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
        h, w = frame.shape[:2]

        # Inference with YOLOv8 on Crop
        results = self.net.predict(frame, verbose=False)

        # Extract VEHICLE detections (STRICT FILTER)
        cars = []
        rejected_count = 0
        for det in results[0].boxes:
            cls_id = int(det.cls[0].item())
            conf   = float(det.conf[0].item())

            # VEHICLE FILTER: Reject person(0), etc.
            if cls_id not in VEHICLE_CLASS_IDS:
                rejected_count += 1
                continue

            # Confidence gate — reject low-confidence detections
            if conf < CONFIDENCE_THRESHOLD:
                continue

            x1, y1, x2, y2 = det.xyxy[0].tolist()
            bw, bh = x2 - x1, y2 - y1

            # Size sanity — reject impossibly large or small boxes
            if bw / w > BIG_CAR_FRACTION or bh / h > BIG_CAR_FRACTION:
                continue
            if bw < 8 or bh < 8:
                continue
            # Aspect ratio check — cars are wider than tall (looser for toy cars)
            ar = bw / float(bh)
            if not (0.2 <= ar <= 5.0):
                continue

            # Scale detections back to Global Coordinates (REF_W, REF_H)
            rx_ref, ry_ref, rw_ref, rh_ref = self.roi
            global_bx = rx_ref + (x1 * rw_ref / w)
            global_by = ry_ref + (y1 * rh_ref / h)
            global_bw = bw * rw_ref / w
            global_bh = bh * rh_ref / h

            cars.append({
                "x": int(global_bx), 
                "y": int(global_by), 
                "w": int(global_bw), 
                "h": int(global_bh), 
                "conf": conf
            })
            # Draw detection on current view (green for accepted car)
            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
            cv2.putText(frame, f"CAR {conf:.0%}", (int(x1), int(y1) - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 255, 0), 1)

        # ── STATE DECISION ENGINE (Booking-Aware) ──────────────────────────
        changed_slots = []
        for idx, slot in enumerate(self.slots):
            sid = slot.get("id")
            if not sid:
                continue

            raw_x = slot.get("x")
            raw_y = slot.get("y")

            if (raw_x is None or raw_x == 0) and (raw_y is None or raw_y == 0):
                # Grid fallback
                cols = 6
                row  = idx // cols
                col  = idx % cols
                sx_ref = 150 + col * 280
                sy_ref = 150 + row * 180
                sw_ref, sh_ref = 240, 140
            else:
                sx_ref = float(raw_x or 0)
                sy_ref = float(raw_y or 0)
                sw_ref = float(slot.get("width") or 240)
                sh_ref = float(slot.get("height") or 140)

            slot_box = {"x": sx_ref, "y": sy_ref, "w": sw_ref, "h": sh_ref}

            # Check if any valid car detection overlaps this slot
            detection_status = False
            for car in cars:
                if is_inside(car, slot_box):
                    detection_status = True
                    break

            # Debounce buffer
            buf = self.slot_buffer.get(sid, 0)
            buf = min(buf + BUFFER_INCREMENT, 10) if detection_status else max(buf - BUFFER_DECREMENT, 0)
            self.slot_buffer[sid] = buf

            prev = self.slot_status.get(sid, "AVAILABLE")

            # ── STATE DECISION RULES ──
            # Rule 1: Car detected → ALWAYS OCCUPIED (highest priority)
            if buf >= OCCUPY_THRESHOLD:
                final = "OCCUPIED"
            # Rule 2: No car, buffer cleared → check booking status
            elif buf <= CLEAR_THRESHOLD:
                has_booking = self._has_active_booking(sid)
                if has_booking:
                    final = "RESERVED"
                else:
                    final = "AVAILABLE"
            else:
                # In transition zone — maintain previous state
                final = prev

            if final != prev:
                if self._is_valid_transition(prev, final):
                    self.slot_status[sid] = final
                    changed_slots.append({
                        "slot_id":    sid,
                        "slot_number": slot["slotNumber"],
                        "old_status": prev,
                        "new_status": final,
                    })
                else:
                    print(f"[STATE] Blocked invalid transition: {prev} → {final} for slot {slot.get('slotNumber')}", flush=True)

            # Overlay on local frame
            rx_ref, ry_ref, rw_ref, rh_ref = self.roi
            if (sx_ref + sw_ref > rx_ref and sx_ref < rx_ref + rw_ref and
                sy_ref + sh_ref > ry_ref and sy_ref < ry_ref + rh_ref):
                
                lsx = int((sx_ref - rx_ref) * w / rw_ref)
                lsy = int((sy_ref - ry_ref) * h / rh_ref)
                lsw = int(sw_ref * w / rw_ref)
                lsh = int(sh_ref * h / rh_ref)
                
                if final == "OCCUPIED":
                    color = (0, 0, 220)
                elif final == "RESERVED":
                    color = (220, 160, 0)
                else:
                    color = (0, 210, 0)
                cv2.rectangle(frame, (lsx, lsy), (lsx + lsw, lsy + lsh), color, 2)
                cv2.putText(frame, f"S{slot['slotNumber']} {final[:3]}",
                            (lsx + 2, lsy + 14),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.38, color, 1)

        # HUD overlay
        active_ids = [s.get("id") for s in self.slots]
        occ_count = sum(1 for sid, v in self.slot_status.items() if sid in active_ids and v == "OCCUPIED")
        total = len(self.slots)
        cv2.putText(frame, f"SLOTIFY AI | {self.camera_id} | Occ:{occ_count}/{total} | Cars:{len(cars)}",
                    (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

        return frame, changed_slots

    def _annotate_frame(
        self,
        frame: np.ndarray,
        detections: List[Detection],
        slot_results: List[Dict[str, Any]],
        crop_h: int,
        crop_w: int,
    ) -> np.ndarray:
        """Annotate frame with detection boxes and slot status overlay."""
        from edge_service.vision.enhanced_detector import Detection as EnhancedDetection

        # Draw detection boxes
        for det in detections:
            x1, y1, x2, y2 = det.bbox
            # Scale to current crop dimensions
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            label = f"{det.class_name} {det.confidence:.0%}"
            cv2.putText(frame, label, (x1, y1 - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)

        # Draw slot overlays
        occ_count = 0
        for sr in slot_results:
            status = sr["status"]
            is_occ = status == "OCCUPIED"
            if is_occ:
                occ_count += 1

            # Color coding
            if status == "OCCUPIED":
                color = (0, 0, 220)
            elif status == "RESERVED":
                color = (220, 160, 0)
            else:
                color = (0, 210, 0)

            # Find slot polygon coordinates from self.slots
            sid = sr["slotId"]
            for slot in self.slots:
                if slot.get("id") == sid:
                    raw_x = slot.get("x")
                    raw_y = slot.get("y")
                    if raw_x is not None and raw_y is not None:
                        sx = int(float(raw_x))
                        sy = int(float(raw_y))
                        sw = int(float(slot.get("width", 240)))
                        sh = int(float(slot.get("height", 140)))
                    else:
                        sx, sy, sw, sh = 0, 0, 240, 140
                    # Scale to crop view
                    rx_ref, ry_ref, rw_ref, rh_ref = self.roi
                    lsx = int((sx - rx_ref) * crop_w / rw_ref) if rw_ref > 0 else sx
                    lsy = int((sy - ry_ref) * crop_h / rh_ref) if rh_ref > 0 else sy
                    lsw = int(sw * crop_w / rw_ref) if rw_ref > 0 else sw
                    lsh = int(sh * crop_h / rh_ref) if rh_ref > 0 else sh
                    cv2.rectangle(frame, (lsx, lsy), (lsx + lsw, lsy + lsh), color, 2)
                    cv2.putText(frame, f"S{slot.get('slotNumber', '')} {status[:3]}",
                                (lsx + 2, lsy + 14),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.38, color, 1)
                    break

        # HUD
        total = len(self.slots)
        perf = self.enhanced_detector.get_performance_stats() if self.enhanced_detector else {}
        latency = perf.get("avg_latency_ms", 0)
        cv2.putText(
            frame,
            f"SLOTIFY AI v5.1 | {self.camera_id} | Occ:{occ_count}/{total} | {latency:.0f}ms | CLAHE",
            (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2,
        )

        return frame

    # ── Persist Changes ────────────────────────────────────────────────────

    def _persist_changes(self, changed_slots: list[dict]):
        """Send changes to Central API → fallback to direct DB → WS broadcast."""
        try:
            payload = {
                "lotId":      self.lot_id,
                "edgeNodeId": EDGE_NODE_ID,
                "edgeToken":  EDGE_TOKEN,
                "slots": [
                    {"number": s["slot_number"], "status": s["new_status"]}
                    for s in changed_slots
                ]
            }
            res = requests.post(
                f"{CENTRAL_API_URL}/api/edge/update",
                json=payload, timeout=5
            )
            if res.status_code != 200:
                print(f"[Sync] API Error {res.status_code} — using direct DB", flush=True)
                _db_writer.update_slots(self.lot_id, changed_slots)
        except Exception as e:
            print(f"[Sync] API unreachable: {e} — using direct DB", flush=True)
            _db_writer.update_slots(self.lot_id, changed_slots)

        # WS broadcast
        _broadcast(self.lot_id, [
            {
                "type": "SLOT_UPDATE",
                "lotId": self.lot_id,
                "slotId": s["slot_id"],
                "slotNumber": s["slot_number"],
                "status": s["new_status"],
            }
            for s in changed_slots
        ])


# ══════════════════════════════════════════════════════════════════════════
#   FLASK API ROUTES
# ══════════════════════════════════════════════════════════════════════════

@app.route("/start/<lot_id>", methods=["POST"])
@app.route("/start/<lot_id>/<camera_id>", methods=["POST"])
def start(lot_id: str, camera_id="virtual-cam-1"):
    key = f"{lot_id}:{camera_id}"
    if key not in monitors:
        monitors[key] = SmartMonitor(lot_id, camera_id)
    monitors[key].start()
    return jsonify({"status": "started", "lot": lot_id, "camera": camera_id})


@app.route("/stop/<lot_id>", methods=["POST"])
@app.route("/stop/<lot_id>/<camera_id>", methods=["POST"])
def stop(lot_id: str, camera_id=None):
    if camera_id:
        keys = [f"{lot_id}:{camera_id}"]
    else:
        keys = [k for k in monitors.keys() if k.startswith(f"{lot_id}:")]
        
    for key in keys:
        if key in monitors:
            monitors[key].stop()
            del monitors[key]
    return jsonify({"status": "stopped", "lot": lot_id, "cameras": keys})


@app.route("/camera/<lot_id>")
@app.route("/camera/<lot_id>/<camera_id>")
def stream(lot_id: str, camera_id="virtual-cam-1"):
    """MJPEG stream endpoint — auto-starts monitor if not running."""
    key = f"{lot_id}:{camera_id}"
    if key not in monitors:
        monitors[key] = SmartMonitor(lot_id, camera_id)
        monitors[key].start()
        time.sleep(1.0)

    # Capture the query arg here (within the request context) before entering
    # the generator, which runs in a separate thread without request context.
    use_raw = request.args.get("clean", "false").lower() == "true"

    def generate():
        print(f"[Stream] Starting MJPEG generator for {key}", flush=True)
        mon = monitors[key]
        while mon.running:
            with mon.lock:
                frame = mon.latest_raw_frame if use_raw else mon.last_frame
                # Fallback to last_frame if raw is missing (safety)
                if frame is None and use_raw:
                    frame = mon.last_frame
            
            if frame is None:
                time.sleep(0.05)
                continue
            ret, buf = cv2.imencode(".jpg", frame,
                                    [cv2.IMWRITE_JPEG_QUALITY, 75])
            if ret:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + buf.tobytes()
                    + b"\r\n"
                )
            time.sleep(0.04)

    return Response(generate(),
                    mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/health")
def health():
    status = {}
    for lid, mon in monitors.items():
        status[lid] = {
            "running":      mon.running,
            "model_loaded": mon.model_loaded,
            "camera_url":   mon.camera_url,
            "slots":        len(mon.slots),
            "occupied":     sum(1 for v in mon.slot_status.values() if v == "OCCUPIED"),
            "available":    sum(1 for v in mon.slot_status.values() if v == "AVAILABLE"),
        }
    # Determine overall status dynamically based on running monitors
    overall_running = any(m["running"] for m in status.values()) if status else True
    overall_model = any(m["model_loaded"] for m in status.values()) if status else False
    
    return jsonify({
        "status":           "running" if overall_running else "stopped",
        "camera":           "connected" if overall_running else "disconnected",
        "model":            "loaded" if overall_model else "unloaded",
        "ai_model":         "EnhancedVehicleDetector" if HAS_ENHANCED_VISION else "YOLOv8",
        "version":          "5.1",
        "db_connected":     bool(_db_writer._conn and _db_writer._conn.is_connected()),
        "active_monitors":  list(monitors.keys()),
        "detailed_status":  status,
    })


@app.route("/reload/<lot_id>", methods=["POST"])
def reload_config(lot_id: str):
    """Hot-reload slot config + camera URL without restart."""
    if lot_id not in monitors:
        return jsonify({"error": "Monitor not running"}), 404
    monitors[lot_id].load_config()
    return jsonify({
        "status":    "reloaded",
        "lot":       lot_id,
        "slots":     len(monitors[lot_id].slots),
        "cameraUrl": monitors[lot_id].camera_url,
    })


@app.route("/camera-url/<lot_id>", methods=["POST"])
def update_camera_url(lot_id: str):
    """Directly update the camera URL for a running monitor (used by admin/scripts)."""
    data = request.json or {}
    new_url = data.get("url")
    if not new_url:
        return jsonify({"error": "Missing url"}), 400

    if lot_id not in monitors:
        return jsonify({"error": "Monitor not running"}), 404

    monitors[lot_id].camera_url = new_url
    print(f"[API] Camera URL updated for {lot_id}: {new_url}", flush=True)
    return jsonify({"status": "updated", "lot": lot_id, "url": new_url})


@app.route("/status/<lot_id>")
def slot_status(lot_id: str):
    if lot_id not in monitors:
        return jsonify({"error": "Monitor not found"}), 404
    mon = monitors[lot_id]
    return jsonify({
        "lotId":     lot_id,
        "cameraUrl": mon.camera_url,
        "slots":     mon.slot_status,
        "buffers":   mon.slot_buffer,
        "occupied":  sum(1 for v in mon.slot_status.values() if v == "OCCUPIED"),
        "available": sum(1 for v in mon.slot_status.values() if v == "AVAILABLE"),
    })


@app.route("/debug/<lot_id>")
def debug_detection(lot_id: str):
    """Diagnostic endpoint — runs ONE YOLO inference and returns all detections + slot mapping."""
    mon = None
    for key, m in monitors.items():
        if key.startswith(lot_id) or key == lot_id:
            mon = m
            break
    if not mon:
        return jsonify({"error": "Monitor not found"}), 404

    frame = None
    with mon.lock:
        frame = mon.latest_raw_frame.copy() if mon.latest_raw_frame is not None else None
    if frame is None:
        return jsonify({"error": "No frame available"}), 503

    orig_h, orig_w = frame.shape[:2]
    result = {
        "frame_size": f"{orig_w}x{orig_h}",
        "roi": list(mon.roi),
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "car_only_class_id": CAR_ONLY_CLASS_ID,
        "model_loaded": mon.model_loaded,
        "inference_max_dim": INFERENCE_MAX_DIM,
    }

    if not mon.model_loaded:
        result["error"] = "Model not loaded"
        return jsonify(result)

    if mon.enhanced_detector is not None:
        cropped = frame
        crop_h, crop_w = cropped.shape[:2]
        detections = mon.enhanced_detector.detect_vehicles(cropped)
        result["engine"] = "enhanced"
        result["performance"] = mon.enhanced_detector.get_performance_stats()
        result["detections"] = [
            {
                "class_id": d.class_id,
                "class_name": d.class_name,
                "confidence": round(d.confidence, 3),
                "bbox": d.bbox,
                "source": d.source,
            }
            for d in detections
        ]
        result["total_detections"] = len(detections)
        return jsonify(result)

    if mon.net is None:
        result["error"] = "Legacy model not loaded"
        return jsonify(result)

    # Apply same ROI + resize as the detection pipeline
    rx, ry, rw, rh = mon.roi
    rx = int(rx * orig_w / REF_W)
    ry = int(ry * orig_h / REF_H)
    rw = int(rw * orig_w / REF_W)
    rh = int(rh * orig_h / REF_H)
    rx = max(0, min(rx, orig_w - 10))
    ry = max(0, min(ry, orig_h - 10))
    rw = max(10, min(rw, orig_w - rx))
    rh = max(10, min(rh, orig_h - ry))

    cropped = frame[ry:ry+rh, rx:rx+rw]
    crop_h, crop_w = cropped.shape[:2]
    scale = min(INFERENCE_MAX_DIM / crop_w, INFERENCE_MAX_DIM / crop_h)
    if scale < 1.0:
        cropped = cv2.resize(cropped, (int(crop_w * scale), int(crop_h * scale)), interpolation=cv2.INTER_AREA)
    h, w = cropped.shape[:2]

    result["processed_frame_size"] = f"{w}x{h}"
    result["crop_region"] = {"rx": rx, "ry": ry, "rw": rw, "rh": rh}

    # CRITICAL DIAGNOSTIC: Save the frame to a file to we can see it
    cv2.imwrite("debug_frame.jpg", cropped)
    result["debug_image_saved"] = True

    # Run YOLO inference
    results_yolo = mon.net.predict(cropped, verbose=False)

    all_detections = []
    accepted_cars = []
    for det in results_yolo[0].boxes:
        cls_id = int(det.cls[0].item())
        conf = float(det.conf[0].item())
        x1, y1, x2, y2 = det.xyxy[0].tolist()
        bw, bh = x2 - x1, y2 - y1

        # Map class ID to name
        cls_name = results_yolo[0].names.get(cls_id, f"class_{cls_id}")

        detection_info = {
            "class_id": cls_id,
            "class_name": cls_name,
            "confidence": round(conf, 3),
            "bbox_local": [round(x1), round(y1), round(x2), round(y2)],
            "size_local": [round(bw), round(bh)],
            "accepted": False,
            "reject_reason": None,
        }

        if cls_id != CAR_ONLY_CLASS_ID:
            detection_info["reject_reason"] = f"not a car (class={cls_name})"
        elif conf < CONFIDENCE_THRESHOLD:
            detection_info["reject_reason"] = f"low confidence ({conf:.2f} < {CONFIDENCE_THRESHOLD})"
        elif bw < 15 or bh < 15:
            detection_info["reject_reason"] = f"too small ({bw:.0f}x{bh:.0f})"
        elif bw / w > BIG_CAR_FRACTION or bh / h > BIG_CAR_FRACTION:
            detection_info["reject_reason"] = "too large (fills most of frame)"
        else:
            # Map to global coordinates
            rx_ref, ry_ref, rw_ref, rh_ref = mon.roi
            global_bx = rx_ref + (x1 * rw_ref / w)
            global_by = ry_ref + (y1 * rh_ref / h)
            global_bw = bw * rw_ref / w
            global_bh = bh * rh_ref / h

            detection_info["accepted"] = True
            detection_info["global_coords"] = {
                "x": int(global_bx), "y": int(global_by),
                "w": int(global_bw), "h": int(global_bh),
            }

            # Check which slots this car overlaps
            overlapping_slots = []
            car_box = {"x": global_bx, "y": global_by, "w": global_bw, "h": global_bh}
            for idx, slot in enumerate(mon.slots):
                sx = float(slot.get("x") or 0)
                sy = float(slot.get("y") or 0)
                sw = float(slot.get("width") or 240)
                sh = float(slot.get("height") or 140)
                if sx == 0 and sy == 0:
                    cols = 6
                    row = idx // cols
                    col = idx % cols
                    sx = 150 + col * 280
                    sy = 150 + row * 180
                    sw, sh = 240, 140
                slot_box = {"x": sx, "y": sy, "w": sw, "h": sh}
                if is_inside(car_box, slot_box):
                    overlapping_slots.append({
                        "slot_number": slot.get("slotNumber"),
                        "slot_id": slot.get("id"),
                        "slot_coords": slot_box,
                    })
            detection_info["overlapping_slots"] = overlapping_slots
            accepted_cars.append(detection_info)

        all_detections.append(detection_info)

    # Slot info
    slot_info = []
    for idx, slot in enumerate(mon.slots):
        sid = slot.get("id", "")
        sx = float(slot.get("x") or 0)
        sy = float(slot.get("y") or 0)
        sw = float(slot.get("width") or 240)
        sh = float(slot.get("height") or 140)
        if sx == 0 and sy == 0:
            cols = 6
            row = idx // cols
            col = idx % cols
            sx = 150 + col * 280
            sy = 150 + row * 180
            sw, sh = 240, 140
        slot_info.append({
            "slot_number": slot.get("slotNumber"),
            "id": sid,
            "coords": {"x": sx, "y": sy, "w": sw, "h": sh},
            "current_status": mon.slot_status.get(sid, "UNKNOWN"),
            "buffer": mon.slot_buffer.get(sid, 0),
            "using_fallback_coords": (slot.get("x") or 0) == 0 and (slot.get("y") or 0) == 0,
        })

    result["total_detections"] = len(all_detections)
    result["accepted_cars"] = len(accepted_cars)
    result["all_detections"] = all_detections
    result["slots"] = slot_info

    return jsonify(result)


@app.route("/discover")
def discover_cameras():
    """Scan local subnet for RTSP/HTTP cameras."""
    if not HAS_SCANNER:
        return jsonify({"error": "scanner module not available"}), 503
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        local_ip = s.getsockname()[0]
        s.close()
        subnet = ".".join(local_ip.split(".")[:-1])
        scanner = CameraScanner(subnet=subnet)
        found = scanner.run_scan()
        return jsonify({"status": "success", "subnet": subnet, "found": found})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/predict", methods=["POST"])
def predict():
    if not HAS_ML:
        return jsonify({"error": "ML module not available"}), 503
    data = request.json or {}
    lot_id = data.get("lotId")
    target_time_iso = data.get("targetTime")
    if not lot_id or not target_time_iso:
        return jsonify({"error": "lotId and targetTime are required"}), 400
    occupancy_rate = predict_occupancy(lot_id, target_time_iso)
    if occupancy_rate is None:
        return jsonify({"error": "Not enough data or model failed"}), 500
    return jsonify({
        "lotId":         lot_id,
        "targetTime":    target_time_iso,
        "occupancyRate": occupancy_rate,
    })


# ══════════════════════════════════════════════════════════════════════════
#   ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("═" * 72, flush=True)
    print("  SLOTIFY SMART PARKING AI SERVICE v5.0 — PRODUCTION SYSTEM", flush=True)
    print("  ┌──────────────────────────────────────────────────────┐", flush=True)
    print("  │  MODE : VEHICLE DETECTION (Cars/Buses/Trucks)       │", flush=True)
    print(f"  │  CONF : {CONFIDENCE_THRESHOLD:.2f} (sensitivity tuned)            │", flush=True)
    print("  │  STATE: Booking-Aware (AVAILABLE → RESERVED → OCC)  │", flush=True)
    print("  └──────────────────────────────────────────────────────┘", flush=True)
    print(f"  Lot     : {PARKING_LOT_ID}", flush=True)
    print(f"  Edge ID : {EDGE_NODE_ID}", flush=True)
    print(f"  Central : {CENTRAL_API_URL}", flush=True)
    print(f"  Camera  : {CAMERA_STREAM_URL or '(from DB)'}", flush=True)
    print(f"  DDNS    : {DDNS_DOMAIN or 'Disabled'}", flush=True)
    print("═" * 72, flush=True)

    # Start sidecars
    ddns_updater = DDNSUpdater()
    node_pulse   = EdgeNodePulse()

    # Train ML demand model in background
    if HAS_ML:
        threading.Thread(target=train_model, daemon=True, name="ml-train").start()

    # Auto-start the primary lot monitor
    primary_lot = PARKING_LOT_ID
    monitors[primary_lot] = SmartMonitor(primary_lot)
    monitors[primary_lot].start()

    app.run(host="0.0.0.0", port=PYTHON_SERVICE_PORT, threaded=True, debug=False)
