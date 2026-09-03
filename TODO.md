# TODO: Update IP Webcam Address to 100.125.245.26:8080

List of files to update the webcam IP address:

1. [x] `.env` → `CAMERA_IP=100.125.245.26:8080`
2. [x] `.env.local` → `CAMERA_STREAM_URL=http://100.125.245.26:8080/video`
3. [x] `.env.example` → `CAMERA_IP="100.125.245.26:8080"`
4. [x] `.env.docker.example` → `IP_WEBCAM_URL`, `IP_WEBCAM_RTSP`, `IP_WEBCAM_SNAPSHOT`
5. [x] `pilot/config.py` → `CAMERA_SOURCE`
6. [x] `pilot/test_stream.py` → all stream URLs
7. [x] `scripts/live_ipwebcam_stream.py` → `IP_WEBCAM_URL`
8. [x] `prisma/seed.ts` → all `cameraUrl` entries
