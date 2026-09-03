import os

# --- INPUT SOURCE CONFIGURATION ---
# Options: RTSP URL ("rtsp://user:pass@ip:port/h264"), Video File ("test_video.mp4"), or Webcam Index (0)
CAMERA_SOURCE = "rtsp://100.125.245.26:8080/h264_pcm.sdp"  

# --- TIMING & SAMPLING CONFIGURATION ---
BASELINE_INTERVAL_SEC = 4.0      # Baseline sampling rate (0.25 FPS)
BURST_INTERVAL_SEC = 0.5         # Burst mode sampling rate (2.0 FPS)
BURST_DURATION_SEC = 10.0        # Duration of burst mode after a visual trigger
PERSISTENCE_BUFFER_SIZE = 3      # Number of consecutive identical readings required to confirm state change

# --- AI & DETECTION CONFIGURATION ---
YOLO_MODEL_PATH = "yolov8n.pt"   # Auto-downloads if not present locally
VEHICLE_CLASS_IDS = [2, 5, 7]    # COCO Classes: 2 = Car, 5 = Bus, 7 = Truck
CONFIDENCE_THRESHOLD = 0.85      # Detections below this threshold are discarded
SLOT_OVERLAP_THRESHOLD = 0.40    # Minimum (Intersection / Slot Area) ratio to consider occupied

# --- RECONCILIATION TIMERS ---
OVERSTAY_GRACE_MINUTES = 10     # Grace period duration for overstaying vehicles
NO_SHOW_THRESHOLD_MINUTES = 15   # Time past booking start to auto-release unused slots

# --- PATHS ---
SLOTS_CONFIG_FILE = "slots.json"
LOGS_DIR = "logs"

os.makedirs(LOGS_DIR, exist_ok=True)
