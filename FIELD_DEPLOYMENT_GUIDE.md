# SLOTS Field Pilot Deployment Guide

## System Status: ✅ READY FOR FIELD DEPLOYMENT

The SLOTS end-to-end integration has been validated and is ready for physical installation at pilot sites.

## Hardware Bill of Materials (BOM)

### Edge Compute Node
**Options:**
- **Raspberry Pi 4 (4GB/8GB)** - Cost-effective, sufficient for YOLOv8n
- **NVIDIA Jetson Orin Nano (4GB)** - Higher performance, better for YOLOv8s/t
- **Raspberry Pi 5 (8GB)** - Latest generation, improved performance

**Recommended:** Jetson Orin Nano for production, Pi 4 for cost-sensitive pilots

**Specifications:**
- CPU: Quad-core ARM Cortex-A72 (Pi) / 6-core ARM Cortex-A78 (Jetson)
- RAM: 4GB minimum, 8GB recommended
- Storage: 64GB+ microSD (Class 10) or NVMe SSD
- Power: USB-C (Pi) / DC 12V (Jetson)
- Networking: Gigabit Ethernet + WiFi 5
- Operating System: Ubuntu 22.04 LTS / Raspberry Pi OS 64-bit

### Camera Sensor
**Requirements:**
- **Resolution:** 1080p minimum, 4K preferred
- **Frame Rate:** 25fps minimum, 30fps preferred
- **Protocol:** RTSP support mandatory
- **Night Vision:** IR LEDs for 24/7 operation
- **Weather Protection:** IP66/IP67 enclosure
- **Mounting:** PoE (Power over Ethernet) or 12V DC

**Recommended Models:**
- Hikvision DS-2CD2xxx series
- Dahua IPC-HFWxxx series
- Axis Communications M series
- Uniview IPC series

**Specifications:**
- Sensor: 1/2.7" CMOS or larger
- Lens: 2.8-12mm varifocal
- WDR: 120dB minimum
- ICR: Auto IR-cut filter
- Storage: microSD slot for edge recording backup

### Network & Power
**Options:**
- **PoE Switch:** Managed PoE+ switch (IEEE 802.3at)
- **4G/LTE Router:** Outdoor cellular router with fallback
- **Power Backup:** UPS for edge node and network equipment

**Recommended:**
- PoE switch: 8-port managed PoE+ switch
- Cellular: Outdoor 4G router with dual-SIM failover
- UPS: 1000VA line-interactive UPS

### Cabling & Mounting
- **Cables:** Cat6 outdoor-rated Ethernet cables
- **Conduit:** PVC conduit for cable protection
- **Mounting:** Weatherproof camera poles (6-8m height)
- **Grounding:** Proper earthing for lightning protection

## Pre-Deployment Checklist

### Software Preparation
- [ ] Install Ubuntu 22.04 LTS on edge node
- [ ] Configure static IP address
- [ ] Install Python 3.9+ and dependencies
- [ ] Install Node.js 18+ for telemetry gateway
- [ ] Configure Mosquitto MQTT broker
- [ ] Set up MySQL database for central server
- [ ] Clone SLOTS repository to edge node
- [ ] Install Python dependencies: `pip install -r vision_engine/requirements.txt edge/requirements.txt`
- [ ] Install Node dependencies: `npm install`

### Network Configuration
- [ ] Configure firewall rules for MQTT (port 1883)
- [ ] Set up VPN tunnel to central server
- [ ] Configure DDNS for dynamic IP
- [ ] Test network connectivity to central server
- [ ] Verify MQTT broker connectivity
- [ ] Test RTSP stream access from edge node

### System Integration
- [ ] Configure environment variables on edge node
- [ ] Set up systemd services for auto-start
- [ ] Configure log rotation
- [ ] Test pipeline_runner.py with camera stream
- [ ] Verify sync_daemon.py MQTT connection
- [ ] Test end-to-end data flow to central server
- [ ] Validate dashboard WebSocket connectivity

## Pilot Deployment Sequence

### Phase 1: Site Survey & Planning
**Duration:** 1-2 days

**Tasks:**
1. **Site Assessment**
   - Parking lot layout analysis
   - Camera mounting locations identification
   - Network infrastructure availability
   - Power source identification
   - Environmental factors (sunlight, weather)

2. **Camera Placement Planning**
   - Determine optimal camera angles (30-45° downward)
   - Calculate coverage areas (4-8 bays per camera)
   - Plan cable routing paths
   - Identify mounting points

3. **ROI Mapping**
   - Mark physical bay boundaries
   - Document camera coordinates
   - Create initial ROI configuration

### Phase 2: Hardware Installation
**Duration:** 2-3 days

**Tasks:**
1. **Mounting Infrastructure**
   - Install camera poles at designated locations
   - Ensure proper grounding
   - Install conduit for cable protection
   - Mount cameras with correct angles

2. **Network Setup**
   - Install PoE switch
   - Run Ethernet cables to cameras
   - Connect edge node to network
   - Configure network settings

3. **Power Setup**
   - Install UPS for backup power
   - Connect all equipment to power
   - Test power backup system
   - Label all cables and connections

### Phase 3: Software Configuration
**Duration:** 1-2 days

**Tasks:**
1. **Camera Configuration**
   - Configure camera IP addresses
   - Set up RTSP streams
   - Configure camera settings (resolution, FPS, WDR)
   - Test RTSP stream access

2. **ROI Calibration**
   - Run ROI calibration tool
   - Map camera coordinates to physical bays
   - Create vision_engine/roi_config.json
   - Test ROI accuracy with sample frames

3. **Edge Node Setup**
   - Deploy SLOTS software to edge node
   - Configure environment variables
   - Set up systemd services
   - Configure log rotation

### Phase 4: System Integration Testing
**Duration:** 2-3 days

**Tasks:**
1. **Component Testing**
   - Test vision pipeline with camera stream
   - Verify MQTT connection to central server
   - Test database writes
   - Validate WebSocket dashboard updates

2. **End-to-End Testing**
   - Run complete data flow test
   - Verify network failover behavior
   - Test system under load
   - Validate performance metrics

3. **Stress Testing**
   - Simulate network outages
   - Test high-traffic scenarios
   - Verify offline queuing
   - Validate sync recovery

### Phase 5: Dataset Collection
**Duration:** 2-4 weeks

**Tasks:**
1. **Data Capture Setup**
   - Configure frame saving for dataset
   - Set up storage for raw frames
   - Create data organization structure
   - Test data collection pipeline

2. **Environmental Variation**
   - Collect data across different times of day
   - Capture various weather conditions
   - Include different vehicle types
   - Document environmental conditions

3. **Data Annotation**
   - Set up annotation tools
   - Create annotation guidelines
   - Train annotation team
   - Quality control of annotations

## Systemd Service Configuration

### Edge Pipeline Service
Create `/etc/systemd/system/slots-pipeline.service`:

```ini
[Unit]
Description=SLOTS Vision Pipeline Service
After=network.target

[Service]
Type=simple
User=slots
WorkingDirectory=/home/slots/SLOTS
Environment="PATH=/home/slots/.local/bin:/usr/bin:/bin"
ExecStart=/usr/bin/python3 /home/slots/SLOTS/vision_engine/pipeline_runner.py \
  --site-id CHENNAI-PILOT-01 \
  --camera rtsp://admin:password@192.168.1.100:554/stream1 \
  --bay-id BAY-A-101 \
  --mqtt-broker mqtt-broker.example.com \
  --fps 25
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Edge Sync Service
Create `/etc/systemd/system/slots-sync.service`:

```ini
[Unit]
Description=SLOTS Edge Sync Service
After=network.target

[Service]
Type=simple
User=slots
WorkingDirectory=/home/slots/SLOTS
Environment="PATH=/home/slots/.local/bin:/usr/bin:/bin"
ExecStart=/usr/bin/python3 /home/slots/SLOTS/edge/sync_daemon.py \
  --mqtt-broker mqtt-broker.example.com \
  --site-id CHENNAI-PILOT-01
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Enable Services
```bash
sudo systemctl daemon-reload
sudo systemctl enable slots-pipeline.service
sudo systemctl enable slots-sync.service
sudo systemctl start slots-pipeline.service
sudo systemctl start slots-sync.service
```

## Environment Configuration

### Edge Node `.env`
```env
# Camera Configuration
CAMERA_IP=192.168.1.100
CAMERA_STREAM_URL=rtsp://admin:password@192.168.1.100:554/stream1

# Edge Node Configuration
EDGE_NODE_ID=CHENNAI-PILOT-01-EDGE
EDGE_TOKEN=your-secure-token
PARKING_LOT_ID=CHENNAI-PILOT-01

# MQTT Configuration
MQTT_BROKER=mqtt-broker.example.com
MQTT_PORT=1883
MQTT_USERNAME=slots-user
MQTT_PASSWORD=secure-password

# Central API Configuration
CENTRAL_API_URL=https://api.slots.example.com
API_KEY=your-api-key

# Vision Engine Configuration
YOLO_MODEL_PATH=yolov8n.pt
ROI_CONFIG_PATH=vision_engine/roi_config.json
ENABLE_OCR=true
ENABLE_VLM=true

# Sync Configuration
SYNC_INTERVAL=5
DB_PATH=edge_storage.db
```

### Central Server `.env`
```env
# Database
DATABASE_URL=mysql://user:password@localhost:3306/slots_production

# MQTT
MQTT_BROKER=mqtt://localhost:1883

# Socket.IO
SOCKET_PORT=4001
NEXT_PUBLIC_SOCKET_URL=https://slots.example.com

# Next.js
NEXTAUTH_URL=https://slots.example.com
NODE_ENV=production
```

## Monitoring & Maintenance

### Health Monitoring
**Edge Node Health:**
```bash
# Check service status
sudo systemctl status slots-pipeline.service
sudo systemctl status slots-sync.service

# View logs
sudo journalctl -u slots-pipeline.service -f
sudo journalctl -u slots-sync.service -f

# Check resource usage
htop
nvidia-smi  # For Jetson
```

**Central Server Health:**
```bash
# Check telemetry gateway
sudo systemctl status slots-telemetry-gateway

# Check MQTT broker
sudo systemctl status mosquitto

# Monitor database
mysql -u root -p -e "SHOW PROCESSLIST;"
```

### Log Management
**Configure log rotation:** `/etc/logrotate.d/slots`
```
/home/slots/SLOTS/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 slots slots
    sharedscripts
    postrotate
        systemctl reload slots-pipeline.service > /dev/null 2>&1 || true
    endscript
}
```

### Backup Strategy
**Database Backup:**
```bash
# Daily backup
0 2 * * * mysqldump -u root -p smart_parking > /backups/slots_$(date +\%Y\%m\%d).sql

# Keep 30 days
find /backups -name "slots_*.sql" -mtime +30 -delete
```

**Configuration Backup:**
```bash
# Backup edge node configuration
tar -czf /backups/edge_config_$(date +\%Y\%m\%d).tar.gz /home/slots/SLOTS/.env /home/slots/SLOTS/vision_engine/roi_config.json
```

## Troubleshooting Field Issues

### Camera Not Accessible
**Symptoms:** RTSP connection fails
**Solutions:**
1. Check camera network connectivity: `ping camera-ip`
2. Verify RTSP URL format: `rtsp://user:pass@ip:port/path`
3. Check camera network settings
4. Verify firewall rules
5. Test with VLC media player

### MQTT Connection Failures
**Symptoms:** Events not reaching central server
**Solutions:**
1. Check MQTT broker status: `sudo systemctl status mosquitto`
2. Verify network connectivity to broker
3. Check authentication credentials
4. Test with MQTT client: `mosquitto_sub -h broker -t "test/topic"`
5. Check firewall rules for port 1883

### High CPU Usage
**Symptoms:** Edge node performance degradation
**Solutions:**
1. Reduce FPS limit in pipeline_runner.py
2. Use smaller YOLO model (yolov8n vs yolov8s)
3. Optimize ROI polygons to reduce processing area
4. Check for memory leaks
5. Consider upgrading to Jetson Orin

### Database Sync Issues
**Symptoms:** Events not appearing in dashboard
**Solutions:**
1. Check telemetry gateway logs
2. Verify MQTT subscription
3. Test database connection
4. Check Prisma schema sync
5. Restart telemetry gateway

## Security Considerations

### Network Security
- Use VPN for edge-to-central communication
- Implement firewall rules to restrict access
- Use strong authentication for MQTT
- Enable TLS for MQTT in production
- Regular security updates

### Data Security
- Encrypt sensitive data at rest
- Use secure credential management
- Implement access logging
- Regular security audits
- Backup encryption

### Physical Security
- Weatherproof enclosures for all equipment
- Secure mounting to prevent theft
- Lock camera configuration interfaces
- Environmental monitoring (temperature, humidity)
- Regular physical inspections

## Performance Optimization

### Edge Node Optimization
```bash
# Enable performance mode
sudo jetson_clocks  # For Jetson devices

# Configure GPU memory limits
sudo nvidia-smi -pm 1
sudo nvidia-smi -pl 15W  # Set power limit

# Enable CPU performance governor
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

### Database Optimization
```sql
-- Add indexes for performance
CREATE INDEX idx_parkingbay_baynumber ON parkingbay(bayNumber);
CREATE INDEX idx_parkingbay_status ON parkingbay(status);
CREATE INDEX idx_occupancylog_timestamp ON occupancyLog(timestamp);

-- Configure connection pooling
```

### Network Optimization
- Use MQTT QoS-1 for critical messages
- Implement message batching for high-frequency events
- Use compression for large payloads
- Optimize WebSocket connection parameters

## Dataset Collection Guidelines

### Environmental Coverage
**Lighting Conditions:**
- Bright sunlight (morning/afternoon)
- Overcast conditions
- Nighttime (with/without IR)
- Golden hour (dawn/dusk)

**Weather Conditions:**
- Clear days
- Rainy conditions
- Foggy conditions
- Dust storms

### Vehicle Coverage
**Vehicle Types:**
- Cars (sedans, hatchbacks, SUVs)
- Two-wheelers (motorcycles, scooters)
- Auto-rickshaws
- Commercial vehicles (vans, trucks)

**Parking Scenarios:**
- Empty bays
- Partially occupied bays
- Fully occupied bays
- Entry/exit sequences
- Overlapping vehicles

### Data Organization
```
dataset/
├── images/
│   ├── cars/
│   ├── two-wheelers/
│   ├── auto-rickshaws/
│   └── mixed/
├── annotations/
│   ├── car_annotations.json
│   ├── two_wheeler_annotations.json
│   └── auto_rickshaw_annotations.json
├── metadata/
│   ├── environmental_conditions.csv
│   └── collection_log.csv
└── processed/
    ├── train/
    ├── val/
    └── test/
```

## Academic Publication Strategy

### Paper 1: Dataset & Benchmark
**Title:** "An Edge-Resilient Vision Framework and Dataset for Heterogeneous Indian Parking Environments"

**Structure:**
1. Introduction
2. Related Work
3. Dataset Collection Methodology
4. Vision Framework Architecture
5. Experimental Results
6. Discussion & Analysis
7. Conclusion & Future Work

**Key Contributions:**
- First Indian parking dataset with mixed vehicles
- Edge-resilient architecture validation
- Comparative analysis of detection methods
- Real-world deployment results

### Paper 2: Architecture & Systems
**Title:** "Edge-Resilient Vision Architectures for Smart Parking: A Systems Approach"

**Structure:**
1. Introduction
2. System Architecture
3. Edge Computing Integration
4. Offline Resilience Mechanisms
5. Real-time Performance Analysis
6. Scalability Evaluation
7. Conclusion

**Key Contributions:**
- Novel edge-cloud architecture
- MQTT QoS-1 synchronization strategy
- Real-time dashboard implementation
- Multi-level database schema design

## Success Metrics

### Technical Metrics
- **Detection Accuracy:** >95% (clear), >85% (ambiguous)
- **System Availability:** >99.5%
- **Data Loss:** <0.1% during outages
- **Response Time:** <100ms detection to UI
- **Scalability:** Support 10+ cameras per site

### Business Metrics
- **Parking Efficiency:** +25% space utilization
- **Revenue Optimization:** +15% dynamic pricing
- **Customer Satisfaction:** +40% real-time info
- **Operational Costs:** -30% automation
- **Deployment Time:** <1 week per site

## Conclusion

The SLOTS system is fully prepared for field pilot deployment with:

✅ **Complete software integration** - All components wired and tested
✅ **Comprehensive hardware plan** - Detailed BOM and installation guide  
✅ **Deployment sequence** - Step-by-step installation process
✅ **Monitoring strategy** - Health checks and maintenance procedures
✅ **Dataset collection plan** - Guidelines for academic research
✅ **Publication strategy** - Roadmap for academic contributions

The system is ready to transition from development to real-world deployment, with clear pathways for both commercial expansion and academic research validation.