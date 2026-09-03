# SLOTS Chennai Pilot Deployment - Execution Blueprint

## 🎯 Pilot Deployment Status: READY FOR FIELD EXECUTION

All software integration, hardware provisioning, and deployment tools are ready for the Chennai pilot location installation.

## 📋 Completed Implementation Checklist

### ✅ Stage 1: Hardware Mounting & Network Provisioning
**Hardware BOM Finalized:**
- **Edge Compute Node:** Raspberry Pi 4 (4GB/8GB) or NVIDIA Jetson Orin Nano (4GB)
- **Camera Sensor:** 1080p IP Bullet Camera with RTSP, IR night vision, IP67 enclosure
- **Network:** PoE switch or 4G/LTE router with UPS backup
- **Mounting:** Weatherproof pole at 3.5-4.5m height, 30-45° downward angle

**Network Configuration:**
- Static IP for RTSP camera: 192.168.1.100
- VPN tunnel to central server
- DDNS for dynamic IP resolution
- Firewall rules for MQTT (port 1883)

### ✅ Stage 2: ROI Calibration Tools
**Created Tools:**
- **Reference Frame Capture:** `vision_engine/tools/capture_ref.py`
  - Captures clean reference frames from RTSP streams
  - Supports both RTSP and local camera sources
  - Automatic frame averaging for noise reduction
  - Timestamp watermarking for documentation

**Usage:**
```bash
python vision_engine/tools/capture_ref.py \
  --rtsp-url "rtsp://admin:password@192.168.1.100:554/stream1" \
  --output reference_frame.jpg
```

**ROI Configuration Template:**
```json
{
  "site_id": "CHENNAI-PILOT-01",
  "bays": [
    {
      "bay_id": "BAY-A-101",
      "vehicle_type": "CAR",
      "roi_polygon": [[120, 340], [350, 340], [380, 580], [100, 580]]
    },
    {
      "bay_id": "BAY-A-102", 
      "vehicle_type": "TWO_WHEELER",
      "roi_polygon": [[360, 340], [480, 340], [510, 580], [390, 580]]
    }
  ]
}
```

### ✅ Stage 3: Systemd Service Configuration
**Created Files:**
- **Vision Service:** `deployment/slots-vision.service`
  - Auto-restart on failure
  - Security hardening (NoNewPrivileges, PrivateTmp)
  - Journal logging for debugging
  - Network dependency management

- **Sync Service:** `deployment/slots-sync.service`
  - Auto-restart on failure
  - Security hardening
  - Journal logging
  - Network dependency management

**Installation Script:** `deployment/install_services.sh`
- Automatic service file installation
- Permission configuration
- Systemd daemon reload
- Service enablement and startup
- Status verification

**Installation Commands:**
```bash
# On edge node (Raspberry Pi/Jetson)
sudo bash deployment/install_services.sh
```

**Service Management:**
```bash
# Check status
sudo systemctl status slots-vision.service
sudo systemctl status slots-sync.service

# View logs
sudo journalctl -u slots-vision.service -f
sudo journalctl -u slots-sync.service -f

# Restart services
sudo systemctl restart slots-vision.service
sudo systemctl restart slots-sync.service
```

### ✅ Stage 4: Data Collection Pipeline
**Created Tool:** `vision_engine/tools/data_collector.py`

**Collection Criteria (Automated):**
- **Ambiguous Detections:** 15-40% confidence triggers VLM evaluation
- **Environmental Variations:** Dusk glare, heavy rain, shadow cast conditions
- **Non-Standard Vehicles:** Auto-rickshaws, modified two-wheelers
- **Research Conditions:** VLM fallback triggers, low-light scenarios

**Dataset Organization:**
```
dataset/
├── raw/
│   ├── cars/
│   ├── two_wheelers/
│   ├── auto_rickshaws/
│   └── empty/
├── annotations/
├── metadata/
└── collection_stats.json
```

**Usage:**
```bash
python vision_engine/tools/data_collector.py \
  --site-id CHENNAI-PILOT-01 \
  --camera rtsp://admin:password@192.168.1.100:554/stream1 \
  --bay-id BAY-A-101 \
  --output-dataset ./dataset \
  --max-frames 100
```

**Dataset Goals:**
- **Target:** 5,000-10,000 verified frames
- **Duration:** 30 days of continuous pilot operation
- **Variety:** Cars, two-wheelers, auto-rickshaws across environmental conditions

### ✅ Field Verification Tools
**Created Scripts:**
- **Comprehensive Verification:** `deployment/verify_deployment.sh`
  - System environment checks
  - Directory structure validation
  - Python dependency verification
  - Network connectivity testing
  - Camera stream accessibility
  - Systemd service status
  - Resource usage monitoring

- **Quick Verification:** `deployment/quick_verify.sh`
  - Edge sync status check
  - Live vision service logs
  - Immediate troubleshooting

**Verification Commands:**
```bash
# Full verification
sudo bash deployment/verify_deployment.sh

# Quick status check
python edge/sync_daemon.py --status-check

# Live service logs
sudo journalctl -u slots-vision.service -f --no-pager
```

## 🚀 Immediate Field Execution Commands

### 1. Hardware Installation (On-Site)
```bash
# Physical installation per FIELD_DEPLOYMENT_GUIDE.md
# - Mount camera at 3.5-4.5m height
# - Set 30-45° downward angle
# - Connect to PoE switch
# - Install edge node in weatherproof enclosure
```

### 2. Camera Calibration
```bash
# Capture reference frame
python vision_engine/tools/capture_ref.py \
  --rtsp-url "rtsp://admin:password@192.168.1.100:554/stream1" \
  --output reference_frame.jpg

# Define ROI polygons in vision_engine/roi_config.json
# Use reference frame to map bay boundaries
```

### 3. Service Installation
```bash
# Install systemd services
sudo bash deployment/install_services.sh

# Verify services started successfully
sudo systemctl status slots-vision.service
sudo systemctl status slots-sync.service
```

### 4. Data Collection Start
```bash
# Start automated data collection
python vision_engine/tools/data_collector.py \
  --site-id CHENNAI-PILOT-01 \
  --camera rtsp://admin:password@192.168.1.100:554/stream1 \
  --bay-id BAY-A-101 \
  --output-dataset ./chennai_pilot_dataset \
  --max-frames 10000
```

### 5. System Verification
```bash
# Run comprehensive verification
sudo bash deployment/verify_deployment.sh

# Quick status check
python edge/sync_daemon.py --status-check

# Check live logs
sudo journalctl -u slots-vision.service -f --no-pager
```

## 📊 Research Publication Pipeline

### Dataset Collection Timeline
- **Week 1-2:** Initial deployment and calibration
- **Week 3-6:** Data collection across environmental conditions
- **Week 7-8:** Frame annotation and quality control
- **Week 9-10:** Dataset preparation and documentation

### Paper 1: Dataset & Benchmark
**Title:** "An Edge-Resilient Vision Framework and Dataset for Heterogeneous Indian Parking Environments"

**Key Sections:**
1. Introduction - Indian parking challenges
2. Dataset Collection Methodology - Multi-vehicle, multi-condition
3. Vision Framework Architecture - Edge resilience
4. Experimental Results - Detection accuracy, system performance
5. Discussion - Comparison with existing approaches
6. Conclusion - Contributions and future work

### Paper 2: Architecture & Systems
**Title:** "Edge-Resilient Vision Architectures for Smart Parking: A Systems Approach"

**Key Sections:**
1. Introduction - Smart parking edge computing
2. System Architecture - Multi-tier edge-cloud design
3. Offline Resilience - MQTT QoS-1 synchronization
4. Real-Time Performance - Sub-100ms detection to UI
5. Scalability Evaluation - Multi-site deployment
6. Conclusion - Architectural contributions

## 🎯 Success Metrics for Pilot

### Technical Metrics
- **Detection Accuracy:** >95% (clear), >85% (ambiguous)
- **System Availability:** >99.5% uptime
- **Data Loss:** <0.1% during network outages
- **Response Time:** <100ms detection to UI update
- **Frames Collected:** 5,000-10,000 verified frames

### Operational Metrics
- **Installation Time:** <1 week per site
- **Camera Coverage:** 4-8 bays per camera
- **Power Consumption:** <15W per edge node
- **Network Usage:** <1GB/day MQTT traffic
- **Storage:** <10GB for 30-day dataset

### Research Metrics
- **Dataset Size:** 5,000-10,000 annotated frames
- **Vehicle Types:** Cars, two-wheelers, auto-rickshaws
- **Environmental Coverage:** 6+ lighting/weather conditions
- **Publication Timeline:** 6-8 months for IEEE ITS submission

## 📋 Field Deployment Checklist

### Pre-Deployment
- [ ] Hardware procurement completed
- [ ] Site survey conducted
- [ ] Network infrastructure tested
- [ ] Camera mounting locations identified
- [ ] Power backup (UPS) installed
- [ ] Edge node configured and tested

### Installation Phase
- [ ] Camera mounted at correct height and angle
- [ ] Weatherproof enclosures installed
- [ ] Network cables connected and tested
- [ ] Edge node installed in IP65 enclosure
- [ ] Static IP assigned to camera
- [ ] RTSP stream tested and verified

### Software Configuration
- [ ] Reference frame captured
- [ ] ROI polygons calibrated
- [ ] Systemd services installed
- [ ] Services enabled and started
- [ ] Environment variables configured
- [ ] Log rotation configured

### Verification Phase
- [ ] Comprehensive verification passed
- [ ] Edge sync status check passed
- [ ] Service logs error-free
- [ ] Camera stream stable
- [ ] MQTT connection confirmed
- [ ] Dashboard WebSocket connected

### Data Collection Phase
- [ ] Data collector started
- [ ] Environmental conditions logged
- [ ] Ambiguous frames captured
- [ ] Dataset organization structure created
- [ ] Collection statistics monitored
- [ ] Progress toward 5,000 frame goal

## 🆘 Troubleshooting Quick Reference

### Camera Not Accessible
```bash
# Test RTSP connection
ffprobe -i rtsp://admin:password@192.168.1.100:554/stream1

# Check network connectivity
ping 192.168.1.100

# Test with VLC media player
# Open VLC → Media → Open Network Stream → Enter RTSP URL
```

### Services Not Starting
```bash
# Check service status
sudo systemctl status slots-vision.service
sudo systemctl status slots-sync.service

# View error logs
sudo journalctl -u slots-vision.service -n 50
sudo journalctl -u slots-sync.service -n 50

# Restart services
sudo systemctl restart slots-vision.service
sudo systemctl restart slots-sync.service
```

### MQTT Connection Issues
```bash
# Test MQTT broker connection
mosquitto_sub -h central.slotify.in -t "test/topic"

# Check sync daemon status
python edge/sync_daemon.py --status-check

# View sync logs
sudo journalctl -u slots-sync.service -f
```

### High Resource Usage
```bash
# Check resource usage
htop

# Reduce FPS in service configuration
# Edit /etc/systemd/system/slots-vision.service
# Change --fps 25 to --fps 15

# Restart service
sudo systemctl restart slots-vision.service
```

## 📞 Support & Contact

### Technical Support
- **System Architecture:** See `ARCHITECTURE_ANALYSIS_REPORT.md`
- **Integration Guide:** See `INTEGRATION_GUIDE.md`
- **Field Deployment:** See `FIELD_DEPLOYMENT_GUIDE.md`
- **Implementation Summary:** See `IMPLEMENTATION_SUMMARY.md`

### Emergency Contacts
- **Database Issues:** Check DATABASE_URL and MySQL server status
- **Network Issues:** Verify VPN tunnel and firewall rules
- **Hardware Issues:** Check power supply and physical connections
- **Service Issues:** Check systemd logs and restart services

## 🎉 Pilot Deployment Ready

The SLOTS Chennai pilot deployment is now fully prepared with:

✅ **Complete Hardware BOM** - Detailed specifications and procurement guide
✅ **Installation Instructions** - Step-by-step mounting and configuration
✅ **Calibration Tools** - Reference frame capture and ROI mapping
✅ **Auto-Recovery Services** - Systemd configuration for 24/7 operation
✅ **Data Collection Pipeline** - Automated research dataset creation
✅ **Verification Scripts** - Comprehensive health checks and monitoring
✅ **Research Roadmap** - Academic publication strategy and timeline

The system is ready for physical installation at the Chennai pilot location, with clear procedures for camera setup, software configuration, data collection, and system verification. All tools and documentation are in place to support a successful pilot deployment and subsequent academic research publication.