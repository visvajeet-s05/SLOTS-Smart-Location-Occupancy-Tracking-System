# SLOTS Master Operational Command Reference
# =======================================
# Quick-reference command table for physical on-site configuration and operation.

## 🎯 Essential Commands

### ROI Capture
```bash
python vision_engine/tools/capture_ref.py \
  --rtsp-url "rtsp://admin:password@192.168.1.100:554/stream1" \
  --output reference_frame.jpg
```
**Purpose:** Save a clear reference frame to draw polygon coordinates in roi_config.json

### Service Installation
```bash
sudo bash deployment/install_services.sh
```
**Purpose:** Register, secure, and start the systemd auto-recovery services on the edge node

### Data Collection
```bash
nohup python vision_engine/tools/data_collector.py \
  --site-id CHENNAI-PILOT-01 \
  --camera "rtsp://admin:password@192.168.1.100:554/stream1" \
  --output-dataset ./dataset \
  --max-frames 10000 > data_collection.log 2>&1 &
```
**Purpose:** Run background frame harvesting for the 5k–10k Indian Mixed-Vehicle Dataset

### Quick Status Check
```bash
python edge/sync_daemon.py --status-check
```
**Purpose:** Query local SQLite queue length and central broker connection state

### Live Logs
```bash
sudo journalctl -u slots-vision.service -f --no-pager
```
**Purpose:** Stream real-time edge inference latency and state changes

### Full Health Audit
```bash
sudo bash deployment/verify_deployment.sh
```
**Purpose:** Run automated network, RTSP, process, and system resource sanity checks

## 🔧 Maintenance Commands

### Service Management
```bash
# Check service status
sudo systemctl status slots-vision.service
sudo systemctl status slots-sync.service

# Restart services
sudo systemctl restart slots-vision.service
sudo systemctl restart slots-sync.service

# Stop services
sudo systemctl stop slots-vision.service
sudo systemctl stop slots-sync.service

# View recent logs
sudo journalctl -u slots-vision.service -n 50
sudo journalctl -u slots-sync.service -n 50
```

### Database Management
```bash
# Check SQLite database size
ls -lh edge_storage_CHENNAI-PILOT-01.db

# Check queue status
python edge/sync_daemon.py --status-check

# View database contents
sqlite3 edge_storage_CHENNAI-PILOT-01.db "SELECT * FROM event_queue LIMIT 10;"
```

### Network Diagnostics
```bash
# Test camera connectivity
ping 192.168.1.100

# Test RTSP stream
ffprobe -i rtsp://admin:password@192.168.1.100:554/stream1

# Test MQTT broker
mosquitto_sub -h central.slotify.in -t "test/topic"

# Check internet connectivity
ping 8.8.8.8
```

## 📊 Monitoring Commands

### Resource Usage
```bash
# CPU and memory usage
htop

# Disk usage
df -h

# Process monitoring
ps aux | grep python
```

### Data Collection Status
```bash
# Check dataset size
du -sh ./dataset

# Count collected frames
find ./dataset/raw -name "*.jpg" | wc -l

# Check collection statistics
cat ./dataset/collection_stats.json
```

### Edge Sync Performance
```bash
# Monitor sync queue in real-time
watch -n 5 'python edge/sync_daemon.py --status-check'

# View sync service logs
sudo journalctl -u slots-sync.service -f
```

## 🚨 Emergency Commands

### Immediate Service Recovery
```bash
# Stop all services
sudo systemctl stop slots-vision.service slots-sync.service

# Restart services
sudo systemctl start slots-vision.service slots-sync.service

# Check if recovery successful
sudo systemctl status slots-vision.service slots-sync.service
```

### Force Restart
```bash
# Force kill vision process
sudo pkill -f pipeline_runner.py

# Restart service
sudo systemctl restart slots-vision.service
```

### Data Collection Recovery
```bash
# Check if data collector is running
ps aux | grep data_collector

# Restart data collection
# Kill existing process first, then:
nohup python vision_engine/tools/data_collector.py \
  --site-id CHENNAI-PILOT-01 \
  --camera "rtsp://admin:password@192.168.1.100:554/stream1" \
  --output-dataset ./dataset \
  --max-frames 10000 > data_collection.log 2>&1 &
```

## 📋 Immediate On-Site Checklist

### Physical Alignment
- [ ] **Camera Lens Clean-Off:** Verify that the camera lens clean-off is complete
- [ ] **Pitch Angle:** Set pitch angle to ~35° downward to reduce dusk glare
- [ ] **Mounting Stability:** Ensure camera pole is securely mounted
- [ **Weather Protection:** Verify IP67 enclosure is properly sealed
- [ **Cable Management:** Check all cables are properly secured and weatherproofed

### Network Configuration
- [ ] **Static IP:** Verify camera has static IP (192.168.1.100)
- [ ] **Network Connectivity:** Test ping to camera and central server
- [ ] **VPN Tunnel:** Verify VPN tunnel to central server is active
- [ ] **MQTT Connection:** Test connection to central MQTT broker
- [ ] **Firewall Rules:** Verify firewall allows MQTT port 1883

### Software Verification
- [ ] **Python Dependencies:** Verify all required packages are installed
- [ ] **RTSP Stream:** Test RTSP stream accessibility with VLC or ffprobe
- [ ] **ROI Configuration:** Verify roi_config.json has correct polygon coordinates
- [ ] **Environment Variables:** Verify all environment variables are set correctly
- [ ] **File Permissions:** Verify proper file permissions for all scripts

### Service Status
- [ ] **Vision Service:** Verify slots-vision.service is running and enabled
- [ ] **Sync Service:** Verify slots-sync.service is running and enabled
- [ ] **Auto-Recovery:** Test service restart after manual stop
- [ ] **Log Generation:** Verify journal logs are being written
- [ ] **Resource Usage:** Verify CPU and memory usage is within acceptable limits

### Data Collection Setup
- [ ] **Dataset Directory:** Verify dataset directory structure exists
- [ ] **Storage Space:** Verify sufficient disk space for 10,000+ frames
- [ ] **Data Collector:** Verify data collector can access camera stream
- [ ] **Environment Detection:** Verify environmental condition detection works
- [ ] **Test Collection:** Run short test collection to verify functionality

## 🎯 First Sync Test Procedure

### Network Failover Simulation
1. **Baseline Check:** Run `python edge/sync_daemon.py --status-check` to verify queue is empty
2. **Disconnect WAN:** Disconnect local router WAN cable for 3 minutes
3. **Generate Events:** Allow vision pipeline to continue processing frames
4. **Verify Queuing:** Check that events queue in SQLite without process crashes
5. **Reconnect Network:** Reconnect WAN cable
6. **Verify Sync:** Verify that telemetry_gateway.ts receives queued MQTT events
7. **Database Check:** Verify events appear in central database
8. **Queue Cleanup:** Verify queue is cleared after successful sync

### Expected Results
- ✅ Zero frame loss during network outage
- ✅ All events queued in SQLite locally
- ✅ Automatic sync recovery when network restored
- ✅ Zero data loss in central database
- ✅ Services continue running without manual intervention

## 📊 Dataset Verification

### 24-Hour Verification
```bash
# Check dataset structure
ls -la ./dataset/raw/

# Count frames by category
find ./dataset/raw/cars -name "*.jpg" | wc -l
find ./dataset/raw/two_wheelers -name "*.jpg" | wc -l
find ./dataset/raw/auto_rickshaws -name "*.jpg" | wc -l
find ./dataset/raw/empty -name "*.jpg" | wc -l

# Check metadata
ls -la ./dataset/metadata/

# Verify ambiguous lighting frames are being saved
find ./dataset/raw -name "*.jpg" | wc -l
```

### Collection Progress Tracking
```bash
# Check collection statistics
cat ./dataset/collection_stats.json

# Monitor collection progress
watch -n 60 'cat ./dataset/collection_stats.json'
```

### Environmental Condition Verification
```bash
# Check if environmental variations are being captured
grep -r "lighting" ./dataset/metadata/
grep -r "weather" ./dataset/metadata/
grep -r "time_of_day" ./dataset/metadata/
```

## 🆘 Troubleshooting Quick Reference

### Camera Issues
**Problem:** RTSP stream not accessible
```bash
# Test with ffprobe
ffprobe -i rtsp://admin:password@192.168.1.100:554/stream1

# Test with VLC media player
# VLC → Media → Open Network Stream → Enter RTSP URL

# Check network connectivity
ping 192.168.1.100
```

### Service Issues
**Problem:** Services not starting
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

### MQTT Issues
**Problem:** Events not reaching central server
```bash
# Test MQTT connection
mosquitto_sub -h central.slotify.in -t "test/topic"

# Check sync daemon status
python edge/sync_daemon.py --status-check

# View sync logs
sudo journalctl -u slots-sync.service -f
```

### Data Collection Issues
**Problem:** Frames not being collected
```bash
# Check if data collector is running
ps aux | grep data_collector

# Check data collection log
tail -f data_collection.log

# Restart data collector
# Kill existing process first, then restart with nohup command
```

### High Resource Usage
**Problem:** CPU or memory usage too high
```bash
# Check resource usage
htop

# Reduce FPS in service configuration
# Edit /etc/systemd/system/slots-vision.service
# Change --fps 25 to --fps 15

# Restart service
sudo systemctl restart slots-vision.service
```

## 📈 Performance Benchmarks

### Expected Performance Metrics
- **Inference Time:** <100ms per frame
- **System Latency:** <100ms detection to UI update
- **Frame Rate:** 20-25 FPS for RTSP processing
- **Queue Processing:** <5ms per event
- **Sync Interval:** 5 seconds
- **Data Loss:** <0.1% during network outages

### Resource Usage Targets
- **CPU Usage:** <80% normal, <90% peak
- **Memory Usage:** <80% normal, <90% peak
- **Disk Usage:** <80% for local storage
- **Network Usage:** <1GB/day MQTT traffic
- **Power Consumption:** <15W per edge node

## 🎓 Research Data Collection Goals

### 30-Day Collection Targets
- **Total Frames:** 5,000-10,000 verified frames
- **Vehicle Types:** Cars, two-wheelers, vehicles, auto-rickshaws
- **Environmental Conditions:** 6+ lighting/weather conditions
- **Ambiguous Cases:** 1,000+ frames in 15-40% confidence range
- **VLM Triggers:** 500+ frames requiring VLM fallback

### Dataset Quality Metrics
- **Annotation Accuracy:** >95% bounding box accuracy
- **Frame Quality:** Resolution ≥1080p, minimal motion blur
- **Metadata Completeness:** 100% frames with environmental data
- **Representation Balance:** Equal distribution across vehicle types
- **Environmental Diversity:** Coverage across different conditions

## 🚀 Pilot Execution Success Criteria

### Technical Success
- ✅ System uptime >99.5% over 30 days
- ✅ Data loss <0.1% during network outages
- ✅ Average detection latency <100ms
- ✅ Dashboard updates <100ms from detection
- ✅ Frame collection success rate >95%

### Research Success
- ✅ Dataset size 5,000-10,000 verified frames
- ✅ Vehicle type diversity achieved
- ✅ Environmental condition coverage completed
- ✅ Annotation quality >95% accuracy
- ✅ Paper 1 drafted by day 25
- ✅ Paper 2 drafted by day 30

### Operational Success
- ✅ Zero manual intervention required
- ✅ Auto-recovery works for power cycles
- ✅ Remote monitoring works correctly
- ✅ Data collection runs automatically
- ✅ System remains stable 24/7

## 📞 Emergency Contacts

### System Architecture Support
- **Architecture Analysis:** `ARCHITECTURE_ANALYSIS_REPORT.md`
- **Integration Guide:** `INTEGRATION_GUIDE.md`
- **Field Deployment:** `FIELD_DEPLOYMENT_GUIDE.md`
- **Pilot Blueprint:** `PILOT_DEPLOYMENT_BLUEPRINT.md`

### Technical Issues
- **Database:** Check DATABASE_URL and MySQL server status
- **Network:** Verify VPN tunnel and firewall rules
- **Hardware:** Check power supply and physical connections
- **Services:** Check systemd logs and restart services

## 🎉 System Status: READY FOR 30-DAY PILOT EXECUTION

The SLOTS Chennai pilot deployment is fully operational and ready for the 30-day pilot execution and research dataset gathering.

**Autonomous Operation:** ✅
- Auto-recovery systemd services
- Local SQLite queuing
- MQTT QoS-1 synchronization
- Environmental data collection

**Research-Ready:** ✅
- Automated frame harvesting
- Environmental condition detection
- VLM trigger capture
- Structured dataset organization

**Production-Grade:** ✅
- Security hardening implemented
- Comprehensive monitoring tools
- Backup and recovery procedures
- 24/7 operational capability

**On-site camera calibration and dataset harvesting can now proceed directly.**