import cv2

# Test different RTSP stream formats for IP Webcam
stream_urls = [
    "rtsp://100.125.245.26:8080/h264_pcm.sdp",
    "rtsp://100.125.245.26:8080/video",
    "rtsp://100.125.245.26:8080/h264",
    "rtsp://100.125.245.26:8080/live",
    "http://100.125.245.26:8080/video"
]

print("Testing IP Webcam stream connections...")
for url in stream_urls:
    print(f"\nTesting: {url}")
    cap = cv2.VideoCapture(url)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret:
            print(f"✓ SUCCESS: Stream is working!")
            print(f"  Frame size: {frame.shape}")
            cap.release()
            break
        else:
            print(f"✗ FAILED: Stream opened but no frame received")
            cap.release()
    else:
        print(f"✗ FAILED: Could not open stream")
else:
    print("\n❌ All stream formats failed. Trying webcam fallback...")
    cap = cv2.VideoCapture(0)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret:
            print(f"✓ Webcam 0 is available: {frame.shape}")
            cap.release()
        else:
            print("✗ Webcam 0 failed")
    else:
        print("✗ No webcam available")
