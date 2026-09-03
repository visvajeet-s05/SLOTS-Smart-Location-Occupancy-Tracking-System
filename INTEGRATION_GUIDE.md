# SLOTS Integration Guide - End-to-End System Wiring

## Overview

This guide documents the complete integration of the SLOTS smart parking system, connecting all components into a cohesive end-to-end solution. The system now supports real-time AI-powered parking detection with offline resilience and live dashboard monitoring.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SLOTS INTEGRATED SYSTEM                        │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   RTSP Camera│ ────> │Vision Engine │ ────> │Edge Sync     │
│   (IP Camera)│      │  (YOLOv8 +   │      │Daemon (SQLite)│
└──────────────┘      │   PaddleOCR) │      └──────┬───────┘
                     └──────────────┘             │
                                                  │
                                                  v
                                          ┌──────────────┐
                                          │ MQTT Broker  │
                                          │   (QoS-1)    │
                                          └──────┬───────┘
                                                 │
                                                 v
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Web Dashboard│ <────│Telemetry     │ <────│ Central API   │
│ (Next.js)    │      │Gateway       │      │(Node.js)     │
└──────────────┘      │(Socket.IO)   │      │(Prisma/DB)   │
                      └──────────────┘      └──────────────┘
```

## Components Created

### 1. Vision Engine Integration (`vision_engine/pipeline_runner.py`)
**Purpose:** Connects the vision pipeline to the edge sync daemon for end-to-end processing.

**Key Features:**
- Integrates `SlotsVisionPipeline` with `EdgeSyncDaemon`
- Processes camera frames at configurable FPS
- Detects status changes and queues events automatically
- Performance metrics tracking (FPS, inference time, VLM triggers)
- Graceful camera reconnection for RTSP streams

**Usage:**
```bash
# Run with RTSP stream
python vision_engine/pipeline_runner.py \
  --site-id parking-lot-1 \
  --camera rtsp://camera-url/stream \
  --bay-id BAY-A-101 \
  --fps 20

# Run with video file
python vision_engine/pipeline_runner.py \
  --site-id parking-lot-1 \
  --camera test_video.mp4 \
  --bay-id BAY-A-102 \
  --fps 25

# Run with webcam
python vision_engine/pipeline_runner.py \
  --site-id parking-lot-1 \
  --camera 0 \
  --bay-id BAY-A-103 \
  --fps 30
```

### 2. Telemetry Gateway (`server/telemetry_gateway.ts`)
**Purpose:** Bridges MQTT events from edge nodes to WebSocket clients for real-time dashboard updates.

**Key Features:**
- MQTT consumer subscribing to `slots/edge/+/occupancy` topics
- Database updates via Prisma (both Slot and ParkingBay schemas)
- Socket.IO broadcast to connected clients
- Automatic reconnection with exponential backoff
- Room-based subscription system (`site:{site_id}`)

**Usage:**
```bash
# Start the telemetry gateway
npm run telemetry-gateway

# Or directly with tsx
npx tsx server/telemetry_gateway.ts
```

**Environment Variables:**
```env
MQTT_BROKER=mqtt://localhost:1883
SOCKET_PORT=4001
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=mysql://user:password@localhost:3306/smart_parking
```

### 3. Stream Simulator (`tests/stream_simulator.py`)
**Purpose:** Testing and validation tool for the vision pipeline under various conditions.

**Key Features:**
- Video file looping simulation
- RTSP stream simulation with reconnection
- Image folder processing
- Performance metrics collection
- Optional edge sync integration
- Configurable FPS limiting

**Usage:**
```bash
# Test with video file
python tests/stream_simulator.py \
  --video test_parking.mp4 \
  --bay-id BAY-A-101 \
  --site-id test-site \
  --fps 25

# Test with RTSP stream
python tests/stream_simulator.py \
  --rtsp rtsp://camera-url/stream \
  --bay-id BAY-A-102 \
  --site-id test-site \
  --fps 20

# Test with image folder
python tests/stream_simulator.py \
  --images ./test_images/ \
  --bay-id BAY-A-103 \
  --site-id test-site \
  --fps 30

# Test with edge sync enabled
python tests/stream_simulator.py \
  --video test_parking.mp4 \
  --bay-id BAY-A-101 \
  --site-id test-site \
  --enable-sync \
  --mqtt-broker localhost
```

### 4. Enhanced Dashboard (`components/owner/camera/CCTVSurveillanceDashboard.tsx`)
**Purpose:** Real-time CCTV surveillance dashboard with live WebSocket integration.

**Key Features:**
- Socket.IO client for real-time updates
- Automatic fallback to simulation mode when disconnected
- Live connection status indicators
- Real-time bay status updates
- Neural event log integration
- Multi-site subscription support

**Usage:**
```typescript
// The dashboard automatically connects to the telemetry gateway
// Access at: /dashboard/owner/parking-lots/[id]/camera

// Environment variable for Socket.IO URL:
NEXT_PUBLIC_SOCKET_URL=http://localhost:4001
```

### 5. Validation Test Suite (`tests/validation_suite.py`)
**Purpose:** Comprehensive validation testing for system reliability and performance.

**Key Features:**
- Network failover testing
- VLM fallback validation
- Performance benchmarking
- Database integration testing
- Automated test reporting

**Usage:**
```bash
# Run all tests
python tests/validation_suite.py --test all

# Run specific test
python tests/validation_suite.py --test failover
python tests/validation_suite.py --test vlm
python tests/validation_suite.py --test performance
python tests/validation_suite.py --test database

# Save results to JSON
python tests/validation_suite.py --test all --output results.json
```

## Installation & Setup

### Prerequisites
1. **Node.js** 18+ for Next.js and telemetry gateway
2. **Python** 3.9+ for vision engine and edge sync
3. **MySQL** database server
4. **MQTT Broker** (Mosquitto or similar)

### Step 1: Install Dependencies

**Frontend & Gateway:**
```bash
npm install
# Add MQTT dependency
npm install mqtt @types/mqtt
```

**Vision Engine:**
```bash
cd vision_engine
pip install -r requirements.txt
```

**Edge Sync:**
```bash
cd edge
pip install -r requirements.txt
```

### Step 2: Database Setup
```bash
# Push Prisma schema with new multi-level models
npx prisma db push
```

### Step 3: Environment Configuration

**`.env` file:**
```env
# Database
DATABASE_URL=mysql://user:password@localhost:3306/smart_parking

# MQTT
MQTT_BROKER=mqtt://localhost:1883

# Socket.IO
SOCKET_PORT=4001
NEXT_PUBLIC_SOCKET_URL=http://localhost:4001

# Next.js
NEXTAUTH_URL=http://localhost:3000
```

## Running the Integrated System

### Option 1: Full End-to-End System

**Terminal 1 - Start MQTT Broker:**
```bash
# Using Mosquitto
mosquitto -v
```

**Terminal 2 - Start Telemetry Gateway:**
```bash
npm run telemetry-gateway
```

**Terminal 3 - Start Vision Pipeline Runner:**
```bash
python vision_engine/pipeline_runner.py \
  --site-id parking-lot-1 \
  --camera rtsp://camera-url/stream \
  --bay-id BAY-A-101 \
  --mqtt-broker localhost \
  --mqtt-port 1883
```

**Terminal 4 - Start Next.js Dashboard:**
```bash
npm run dev
```

**Access Dashboard:**
```
http://localhost:3000/dashboard/owner/parking-lots/parking-lot-1/camera
```

### Option 2: Testing & Validation

**Run Stream Simulator:**
```bash
python tests/stream_simulator.py \
  --video test_video.mp4 \
  --bay-id BAY-A-101 \
  --site-id test-site \
  --enable-sync \
  --mqtt-broker localhost
```

**Run Validation Tests:**
```bash
python tests/validation_suite.py --test all
```

## Data Flow Example

### Vehicle Detection Flow

1. **Camera Capture:** RTSP camera captures frame
2. **Vision Processing:** YOLOv8 detects vehicle (confidence: 92%)
3. **OCR Extraction:** PaddleOCR reads plate "TN-01-AB-1234"
4. **Status Change:** System detects AVAILABLE → OCCUPIED transition
5. **Event Queuing:** Edge sync daemon queues event locally
6. **MQTT Publish:** Event published to `slots/edge/parking-lot-1/occupancy`
7. **Gateway Processing:** Telemetry gateway receives MQTT message
8. **Database Update:** Prisma updates Slot and ParkingBay records
9. **WebSocket Broadcast:** Dashboard receives real-time update
10. **UI Update:** Bay shows OCCUPIED status with plate number

### Network Failover Flow

1. **Normal Operation:** Events flowing through MQTT
2. **Network Disconnect:** MQTT connection lost
3. **Local Queuing:** Events continue queuing in SQLite
4. **Queue Growth:** Local database stores pending events
5. **Network Reconnect:** MQTT connection restored
6. **Batch Sync:** All pending events published via QoS-1
7. **Database Catch-up:** Central database updated with missed events
8. **Zero Data Loss:** All events preserved and synchronized

## Troubleshooting

### MQTT Connection Issues
**Problem:** Telemetry gateway can't connect to MQTT broker
**Solution:** 
- Verify MQTT broker is running: `mosquitto -v`
- Check broker address in `.env`: `MQTT_BROKER=mqtt://localhost:1883`
- Test connection: `mosquitto_sub -h localhost -t "test/topic"`

### Vision Pipeline Issues
**Problem:** YOLO model fails to load
**Solution:**
- Verify model file exists: `yolov8n.pt` in project root
- Download model: `python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"`
- Check Ultralytics installation: `pip install ultralytics`

### Dashboard WebSocket Issues
**Problem:** Dashboard shows "DEMO" mode instead of "LIVE"
**Solution:**
- Verify telemetry gateway is running
- Check Socket.IO URL: `NEXT_PUBLIC_SOCKET_URL=http://localhost:4001`
- Test WebSocket connection in browser console
- Check browser console for connection errors

### Database Schema Issues
**Problem:** Prisma updates fail for new models
**Solution:**
- Re-run schema migration: `npx prisma db push`
- Check database connection: `DATABASE_URL` in `.env`
- Verify MySQL server is running

## Performance Optimization

### Vision Engine
- **FPS Limiting:** Use `--fps` parameter to control processing rate
- **Model Selection:** Use `yolov8n.pt` for speed, `yolov8s.pt` for accuracy
- **ROI Optimization:** Define precise ROI polygons to reduce processing area
- **Batch Processing:** Process multiple frames in batches when possible

### Edge Sync
- **Queue Management:** Monitor queue size to prevent memory issues
- **Sync Interval:** Adjust `--sync-interval` based on network conditions
- **Batch Size:** Process up to 100 events per sync cycle for efficiency

### Telemetry Gateway
- **Room Management:** Use site-specific rooms to reduce broadcast overhead
- **Connection Pooling:** Reuse database connections for better performance
- **Event Throttling:** Implement rate limiting for high-frequency events

## Monitoring & Debugging

### Vision Engine Metrics
The pipeline runner outputs real-time metrics:
```
Metrics: 100 frames | 24.5 FPS | 45.2ms avg inference | 87.3% avg OCR | 2 VLM fallbacks | 3 status changes
```

### Edge Sync Queue Status
Monitor the sync daemon queue:
```python
from edge.sync_daemon import EdgeSyncDaemon

daemon = EdgeSyncDaemon(site_id="test-site")
daemon.start()
status = daemon.get_queue_status()
print(status)
# Output: {'unsynced_events': 5, 'synced_events': 150, 'running': True, ...}
```

### Dashboard Connection Status
The dashboard shows connection status in the header:
- **LIVE** (cyan): Connected to telemetry gateway
- **DEMO** (amber): Running in simulation mode

## Security Considerations

### MQTT Security
- Use authentication in production: `mqtt://user:password@broker:1883`
- Enable TLS for encrypted connections: `mqtts://broker:8883`
- Implement ACLs to restrict topic access

### WebSocket Security
- Implement authentication in Socket.IO
- Use HTTPS/WSS in production
- Validate site subscriptions

### Database Security
- Use environment variables for credentials
- Implement connection pooling
- Regular database backups

## Scalability Planning

### Single Site Deployment
- 1-4 cameras per edge node
- 1 telemetry gateway instance
- Shared MQTT broker

### Multi-Site Deployment
- Multiple edge nodes (one per site)
- Single telemetry gateway with room-based routing
- Shared MQTT broker with topic namespace
- Load-balanced Socket.IO connections

### Cloud Deployment
- Deploy telemetry gateway to cloud (AWS/GCP/Azure)
- Use managed MQTT service (AWS IoT Core, Azure IoT Hub)
- Deploy Next.js to Vercel/Netlify
- Use managed database (PlanetScale, Neon)

## Next Steps

### Immediate Actions
1. **Hardware Setup:** Acquire Raspberry Pi 4/Jetson Nano and IP camera
2. **Field Testing:** Deploy to pilot location with real camera
3. **Dataset Collection:** Capture Indian mixed-vehicle parking data
4. **Model Training:** Fine-tune YOLOv8 on collected dataset

### Medium Term
1. **Performance Optimization:** Implement model quantization for edge deployment
2. **Advanced Features:** Add thermal camera support, multiple vehicle types
3. **Analytics:** Implement historical reporting and trend analysis
4. **Mobile App:** Develop companion mobile application

### Long Term
1. **Expansion:** Deploy to multiple commercial parking lots
2. **Research:** Publish papers on Indian parking dataset and edge architectures
3. **Integration:** Connect to municipal "Open Parking Stack"
4. **Standardization:** Contribute to smart city parking standards

## Support & Documentation

For additional information:
- **Architecture:** See `ARCHITECTURE_ANALYSIS_REPORT.md`
- **Implementation:** See `IMPLEMENTATION_SUMMARY.md`
- **Original Plan:** See this integration guide
- **Issues:** Report bugs via GitHub issues

## Conclusion

The SLOTS system is now fully integrated with end-to-end functionality:
- ✅ **Multi-level database schema** for complex parking sites
- ✅ **Real-time AI detection** with YOLOv8 and PaddleOCR
- ✅ **Offline resilience** with SQLite and MQTT QoS-1
- ✅ **Live dashboard** with WebSocket integration
- ✅ **Comprehensive testing** with validation suite
- ✅ **Production-ready** architecture for deployment

The system is ready for pilot deployment and field testing.