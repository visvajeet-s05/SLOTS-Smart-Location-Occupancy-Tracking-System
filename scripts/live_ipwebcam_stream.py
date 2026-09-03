import cv2
import time
import logging
import sys
import os
import threading
from datetime import datetime
from typing import Dict, Any, Optional

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from edge_service.anpr.anpr_engine import IndianANPREngine
from edge_service.vision.two_wheeler_tracker import TwoWheelerSpatialTracker

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Your smartphone IP Webcam configuration
IP_WEBCAM_URL = "http://100.125.245.26:8080/video"
# Alternative snapshot option if MJPEG drops frames:
# SNAPSHOT_URL = "http://100.125.245.26:8080/shot.jpg"

# Sample parking zone polygon (adjust based on your camera view)
# Format: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
SAMPLE_ZONE_POLYGON = [
    [400, 300],   # Top-left
    [800, 300],   # Top-right
    [800, 600],   # Bottom-right
    [400, 600]    # Bottom-left
]

# Session tracking configuration
GRACE_PERIOD_SECONDS = 300  # 5 minutes grace period for unpaid violations


class ThreadedIPWebcam:
    """
    Dedicated background thread for IP Webcam stream to prevent frame buffering latency.
    """
    def __init__(self, src_url: str):
        self.cap = cv2.VideoCapture(src_url)
        # Limit OpenCV internal buffer size
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.ret, self.frame = self.cap.read()
        self.stopped = False

    def start(self):
        threading.Thread(target=self.update, args=(), daemon=True).start()
        return self

    def update(self):
        while not self.stopped:
            if not self.cap.isOpened():
                break
            ret, frame = self.cap.read()
            if ret:
                self.ret, self.frame = ret, frame

    def read(self):
        return self.ret, self.frame

    def stop(self):
        self.stopped = True
        self.cap.release()


class SessionTracker:
    """
    Tracks vehicle entry/exit sessions for parking duration and violation detection.
    """
    def __init__(self):
        self.active_sessions: Dict[str, Dict[str, Any]] = {}
        self.session_history: list = []

    def log_entry(self, plate: str, timestamp: datetime):
        """Log vehicle entry."""
        if plate not in self.active_sessions:
            self.active_sessions[plate] = {
                "entry_time": timestamp,
                "last_seen": timestamp,
                "plate": plate
            }
            logging.info(f"🚗 ENTRY LOGGED: {plate} at {timestamp.strftime('%H:%M:%S')}")

    def log_exit(self, plate: str, timestamp: datetime):
        """Log vehicle exit and calculate duration."""
        if plate in self.active_sessions:
            session = self.active_sessions[plate]
            entry_time = session["entry_time"]
            duration_seconds = (timestamp - entry_time).total_seconds()
            
            session_record = {
                "plate": plate,
                "entry_time": entry_time,
                "exit_time": timestamp,
                "duration_seconds": duration_seconds,
                "is_paid": False  # Would be updated by payment system
            }
            self.session_history.append(session_record)
            del self.active_sessions[plate]
            
            logging.info(f"🚗 EXIT LOGGED: {plate} | Duration: {duration_seconds:.1f}s")
            
            # Check for unpaid violation
            if duration_seconds > GRACE_PERIOD_SECONDS:
                logging.warning(f"⚠️ UNPAID VIOLATION: {plate} exceeded grace period by {duration_seconds - GRACE_PERIOD_SECONDS:.1f}s")
                # Trigger WhatsApp notification (would integrate with notification service)
                logging.info(f"📱 WhatsApp violation notice queued for {plate}")

    def update_last_seen(self, plate: str, timestamp: datetime):
        """Update last seen timestamp for active session."""
        if plate in self.active_sessions:
            self.active_sessions[plate]["last_seen"] = timestamp

def run_live_stream_inference():
    logging.info(f"Connecting to IP Webcam stream at {IP_WEBCAM_URL}...")
    
    # Initialize engines
    anpr_engine = IndianANPREngine()
    tracker = TwoWheelerSpatialTracker(
        max_capacity_per_zone=5,
        frame_width=1920,
        frame_height=1080
    )
    session_tracker = SessionTracker()
    
    # Use threaded reader for zero-latency streaming
    webcam = ThreadedIPWebcam(IP_WEBCAM_URL)
    webcam.start()
    
    if not webcam.cap.isOpened():
        logging.error(f"Failed to connect to IP Webcam stream at {IP_WEBCAM_URL}.")
        logging.error("Check if: 1. Phone and PC are on the same Wi-Fi network. 2. IP Webcam 'Start server' button is active.")
        return

    logging.info("Successfully connected to live stream! Press 'q' on the video window to quit.")
    logging.info(f"Zone polygon configured: {SAMPLE_ZONE_POLYGON}")

    frame_count = 0
    last_anpr_time = time.time()
    last_density_time = time.time()
    
    # Track last seen plates for exit detection
    last_seen_plates: Dict[str, float] = {}
    PLATE_TIMEOUT_SECONDS = 10.0  # Consider plate exited after 10 seconds without detection

    while True:
        ret, frame = webcam.read()
        if not ret or frame is None:
            logging.warning("Empty frame received from stream. Retrying...")
            time.sleep(0.1)
            continue

        frame_count += 1
        current_time = time.time()
        
        # Display Live Camera Feed
        display_frame = frame.copy()
        
        # Draw zone polygon
        zone_poly = np.array(SAMPLE_ZONE_POLYGON, dtype=np.int32)
        cv2.polylines(display_frame, [zone_poly], True, (255, 0, 0), 2)
        cv2.putText(
            display_frame,
            "Parking Zone",
            (SAMPLE_ZONE_POLYGON[0][0], SAMPLE_ZONE_POLYGON[0][1] - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 0, 0),
            2
        )
        
        cv2.putText(
            display_frame,
            f"SLOTS Live Feed | Frame: {frame_count}",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),
            2
        )

        # Periodically trigger ANPR scan (every 2 seconds)
        if current_time - last_anpr_time >= 2.0:
            last_anpr_time = current_time
            
            # Feed current frame snapshot to ANPR engine
            anpr_result = anpr_engine.extract_license_plate(frame)
            
            if anpr_result["is_valid"]:
                plate = anpr_result['sanitized_plate']
                confidence = anpr_result['confidence']
                
                logging.info(f"🎯 PLATE DETECTED: {plate} (Conf: {confidence})")
                logging.info(f"   Raw: {anpr_result['raw_text']} -> Sanitized: {plate}")
                
                # Update session tracking
                now = datetime.now()
                if plate not in last_seen_plates:
                    session_tracker.log_entry(plate, now)
                session_tracker.update_last_seen(plate, now)
                last_seen_plates[plate] = current_time
                
                cv2.putText(
                    display_frame,
                    f"PLATE: {plate}",
                    (20, 80),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.9,
                    (0, 0, 255),
                    2
                )
                cv2.putText(
                    display_frame,
                    f"Conf: {confidence:.2f}",
                    (20, 110),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 255),
                    2
                )
            
            # Check for plate exits (timeout detection)
            plates_to_remove = []
            for plate, last_seen in last_seen_plates.items():
                if current_time - last_seen > PLATE_TIMEOUT_SECONDS:
                    session_tracker.log_exit(plate, datetime.now())
                    plates_to_remove.append(plate)
            
            for plate in plates_to_remove:
                del last_seen_plates[plate]

        # Periodically calculate zone density (every 3 seconds)
        if current_time - last_density_time >= 3.0:
            last_density_time = current_time
            
            # Simulate two-wheeler detections (replace with actual detector in production)
            # For testing, we'll create mock detections based on active sessions
            mock_detections = []
            for plate in last_seen_plates.keys():
                # Create a mock detection in the zone center
                center_x = (SAMPLE_ZONE_POLYGON[0][0] + SAMPLE_ZONE_POLYGON[2][0]) // 2
                center_y = (SAMPLE_ZONE_POLYGON[0][1] + SAMPLE_ZONE_POLYGON[2][1]) // 2
                mock_detections.append({
                    "bbox": [center_x - 50, center_y - 50, center_x + 50, center_y + 50],
                    "confidence": 0.85,
                    "class_name": "motorcycle"
                })
            
            density_result = tracker.calculate_zone_density(
                mock_detections,
                np.array(SAMPLE_ZONE_POLYGON)
            )
            
            logging.info(f"📊 ZONE DENSITY: {density_result['vehicleCount']}/{density_result['maxCapacity']} vehicles")
            logging.info(f"   Density Ratio: {density_result['densityRatio']:.2%}")
            logging.info(f"   Status: {density_result['status']}")
            
            # Display density info
            status_color = {
                "AVAILABLE": (0, 255, 0),
                "FULL": (0, 165, 255),
                "OVERFLOW": (0, 0, 255)
            }.get(density_result['status'], (255, 255, 255))
            
            cv2.putText(
                display_frame,
                f"Zone: {density_result['vehicleCount']}/{density_result['maxCapacity']} | {density_result['status']}",
                (20, 140),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                status_color,
                2
            )
            cv2.putText(
                display_frame,
                f"Density: {density_result['densityRatio']:.1%}",
                (20, 170),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (255, 255, 255),
                2
            )

        cv2.imshow("SLOTS IP Webcam Live Stream Test", display_frame)

        # Press 'q' to stop execution
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    webcam.stop()
    cv2.destroyAllWindows()
    logging.info("Stream closed successfully.")
    logging.info(f"Total sessions logged: {len(session_tracker.session_history)}")

if __name__ == "__main__":
    import numpy as np
    run_live_stream_inference()
