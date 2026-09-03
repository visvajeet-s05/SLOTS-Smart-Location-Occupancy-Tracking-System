# Windows Deployment Notes

The shell scripts are designed for Linux (Raspberry Pi/Jetson). For Windows development:

## File Execution on Windows

**Option 1: Git Bash or WSL**
```bash
chmod +x deployment/*.sh
./deployment/install_services.sh
./deployment/verify_deployment.sh
```

**Option 2: Direct Python Execution**
```bash
# Status check
python edge/sync_daemon.py --status-check

# Reference frame capture
python vision_engine/tools/capture_ref.py --camera 0 --output reference_frame.jpg

# Data collection
python vision_engine/tools/data_collector.py --site-id TEST-SITE --camera 0 --output-dataset ./dataset
```

## Windows Service Configuration

For Windows deployment, use:
- Task Scheduler for auto-start
- NSSM (Non-Sucking Service Manager) for Windows services
- WSL2 for Linux compatibility layer

## Development Verification

**Status Check:**
```bash
python edge/sync_daemon.py --status-check
```

**Run Tests:**
```bash
python tests/validation_suite.py --test all
```

**Stream Simulator:**
```bash
python tests/stream_simulator.py --video test_video.mp4 --bay-id BAY-A-101 --site-id test-site
```