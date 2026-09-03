"""
SLOTS ROI Calibration Tool - Reference Frame Capture
===================================================
This tool captures reference frames from RTSP streams for ROI calibration.

Usage:
    python capture_ref.py --rtsp-url "rtsp://url" --output reference_frame.jpg
    python capture_ref.py --camera 0 --output reference_frame.jpg
"""

import sys
import os
import cv2
import argparse
import logging
import numpy as np
import time
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def capture_reference_frame(rtsp_url: str, output_path: str, num_frames: int = 5):
    """
    Capture reference frames from RTSP stream.
    
    Args:
        rtsp_url: RTSP stream URL
        output_path: Output path for reference frame
        num_frames: Number of frames to capture for averaging
    """
    logger.info(f"Connecting to RTSP stream: {rtsp_url}")
    
    cap = cv2.VideoCapture(rtsp_url)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency
    
    if not cap.isOpened():
        logger.error("Failed to connect to RTSP stream")
        return False
    
    frames = []
    
    try:
        for i in range(num_frames):
            ret, frame = cap.read()
            if ret:
                frames.append(frame)
                logger.info(f"Captured frame {i+1}/{num_frames}")
            else:
                logger.warning(f"Failed to capture frame {i+1}")
                time.sleep(0.1)
        
        if frames:
            # Average frames to reduce noise
            if len(frames) > 1:
                averaged_frame = np.mean(np.array(frames, dtype=np.float32), axis=0).astype(np.uint8)
            else:
                averaged_frame = frames[0]
            
            # Add timestamp watermark
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(averaged_frame, f"SLOTS Reference - {timestamp}", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            # Save reference frame
            cv2.imwrite(output_path, averaged_frame)
            logger.info(f"Reference frame saved to: {output_path}")
            
            # Display frame for verification
            cv2.imshow("Reference Frame", averaged_frame)
            cv2.waitKey(3000)  # Display for 3 seconds
            cv2.destroyAllWindows()
            
            return True
        else:
            logger.error("No frames captured")
            return False
            
    except Exception as e:
        logger.error(f"Error capturing reference frame: {e}")
        return False
    finally:
        cap.release()


def capture_from_camera(camera_id: int, output_path: str):
    """
    Capture reference frame from local camera.
    
    Args:
        camera_id: Camera device ID
        output_path: Output path for reference frame
    """
    logger.info(f"Opening camera {camera_id}")
    
    cap = cv2.VideoCapture(camera_id)
    
    if not cap.isOpened():
        logger.error(f"Failed to open camera {camera_id}")
        return False
    
    try:
        ret, frame = cap.read()
        if ret:
            # Add timestamp watermark
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cv2.putText(frame, f"SLOTS Reference - {timestamp}", 
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            
            cv2.imwrite(output_path, frame)
            logger.info(f"Reference frame saved to: {output_path}")
            
            # Display frame for verification
            cv2.imshow("Reference Frame", frame)
            cv2.waitKey(3000)
            cv2.destroyAllWindows()
            
            return True
        else:
            logger.error("Failed to capture frame from camera")
            return False
            
    except Exception as e:
        logger.error(f"Error capturing from camera: {e}")
        return False
    finally:
        cap.release()


def main():
    parser = argparse.ArgumentParser(description="SLOTS Reference Frame Capture Tool")
    
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--rtsp-url", type=str, help="RTSP stream URL")
    input_group.add_argument("--camera", type=int, help="Local camera ID")
    
    parser.add_argument("--output", type=str, default="reference_frame.jpg", 
                       help="Output path for reference frame")
    parser.add_argument("--num-frames", type=int, default=5, 
                       help="Number of frames to average (for RTSP)")
    
    args = parser.parse_args()
    
    if args.rtsp_url:
        success = capture_reference_frame(args.rtsp_url, args.output, args.num_frames)
    else:
        success = capture_from_camera(args.camera, args.output)
    
    if success:
        logger.info("✅ Reference frame capture completed successfully")
        return 0
    else:
        logger.error("❌ Reference frame capture failed")
        return 1


if __name__ == "__main__":
    import time
    main()