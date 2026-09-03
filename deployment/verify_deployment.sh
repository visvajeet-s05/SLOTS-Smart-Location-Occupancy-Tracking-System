#!/bin/bash
# SLOTS Field Deployment Verification Script
# ==========================================
# This script performs comprehensive verification of the field deployment.

set -e

echo "🔍 SLOTS Field Deployment Verification"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verification counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

check_pass() {
    echo -e "${GREEN}✅${NC} $1"
    ((PASSED_CHECKS++))
    ((TOTAL_CHECKS++))
}

check_fail() {
    echo -e "${RED}❌${NC} $1"
    ((FAILED_CHECKS++))
    ((TOTAL_CHECKS++))
}

check_warn() {
    echo -e "${YELLOW}⚠️ ${NC} $1"
    ((TOTAL_CHECKS++))
}

echo "=== System Environment Checks ==="

# Check if running as pi user
if [ "$USER" = "pi" ]; then
    check_pass "Running as pi user"
else
    check_warn "Not running as pi user (current: $USER)"
fi

# Check Python installation
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    check_pass "Python installed: $PYTHON_VERSION"
else
    check_fail "Python not found"
fi

# Check Node.js installation
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js installed: $NODE_VERSION"
else
    check_fail "Node.js not found"
fi

echo ""
echo "=== Directory Structure Checks ==="

# Check deployment directory
if [ -d "/home/pi/slots" ]; then
    check_pass "Deployment directory exists"
else
    check_fail "Deployment directory not found"
fi

# Check vision engine
if [ -f "/home/pi/slots/vision_engine/pipeline_runner.py" ]; then
    check_pass "Vision pipeline runner exists"
else
    check_fail "Vision pipeline runner not found"
fi

# Check edge sync daemon
if [ -f "/home/pi/slots/edge/sync_daemon.py" ]; then
    check_pass "Edge sync daemon exists"
else
    check_fail "Edge sync daemon not found"
fi

# Check ROI configuration
if [ -f "/home/pi/slots/vision_engine/roi_config.json" ]; then
    check_pass "ROI configuration exists"
else
    check_fail "ROI configuration not found"
fi

echo ""
echo "=== Python Dependencies Check ==="

# Check critical Python packages
PYTHON_PACKAGES=("cv2" "ultralytics" "paddleocr" "paho-mqtt")

for package in "${PYTHON_PACKAGES[@]}"; do
    if python3 -c "import $package" 2>/dev/null; then
        check_pass "Python package: $package"
    else
        check_fail "Python package missing: $package"
    fi
done

echo ""
echo "=== Network Connectivity Checks ==="

# Check local network connectivity
if ping -c 1 192.168.1.100 &> /dev/null; then
    check_pass "Camera reachable (192.168.1.100)"
else
    check_fail "Camera not reachable (192.168.1.100)"
fi

# Check MQTT broker connectivity
if nc -zvw 2 central.slotify.in 1883 2>/dev/null; then
    check_pass "MQTT broker reachable (central.slotify.in:1883)"
else
    check_fail "MQTT broker not reachable (central.slotify.in:1883)"
fi

# Check internet connectivity
if ping -c 1 8.8.8.8 &> /dev/null; then
    check_pass "Internet connectivity"
else
    check_fail "No internet connectivity"
fi

echo ""
echo "=== Camera Stream Check ==="

# Test RTSP stream (basic check)
if command -v ffprobe &> /dev/null; then
    if timeout 5 ffprobe -i rtsp://admin:password@192.168.1.100:554/stream1 -v quiet 2>/dev/null; then
        check_pass "RTSP stream accessible"
    else
        check_fail "RTSP stream not accessible"
    fi
else
    check_warn "ffprobe not installed - skipping stream check"
fi

echo ""
echo "=== Systemd Service Status ==="

# Check if services are defined
if [ -f "/etc/systemd/system/slots-vision.service" ]; then
    check_pass "Vision service file exists"
    
    if systemctl is-enabled slots-vision.service &> /dev/null; then
        check_pass "Vision service enabled"
    else
        check_fail "Vision service not enabled"
    fi
    
    if systemctl is-active slots-vision.service &> /dev/null; then
        check_pass "Vision service running"
    else
        check_fail "Vision service not running"
    fi
else
    check_fail "Vision service file not found"
fi

if [ -f "/etc/systemd/system/slots-sync.service" ]; then
    check_pass "Sync service file exists"
    
    if systemctl is-enabled slots-sync.service &> /dev/null; then
        check_pass "Sync service enabled"
    else
        check_fail "Sync service not enabled"
    fi
    
    if systemctl is-active slots-sync.service &> /dev/null; then
        check_pass "Sync service running"
    else
        check_fail "Sync service not running"
    fi
else
    check_fail "Sync service file not found"
fi

echo ""
echo "=== Edge Sync Status Check ==="

# Run sync daemon status check
if [ -f "/home/pi/slots/edge/sync_daemon.py" ]; then
    cd /home/pi/slots
    if python3 edge/sync_daemon.py --status-check 2>/dev/null; then
        check_pass "Sync daemon status check passed"
    else
        check_fail "Sync daemon status check failed"
    fi
else
    check_fail "Cannot check sync daemon status - file not found"
fi

echo ""
echo "=== Vision Service Logs Check ==="

# Check recent vision service logs
if journalctl -u slots-vision.service --since "5 minutes ago" --no-pager | grep -q "error"; then
    check_fail "Errors found in vision service logs (last 5 minutes)"
else
    check_pass "No errors in vision service logs (last 5 minutes)"
fi

echo ""
echo "=== Resource Usage Check ==="

# Check CPU usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
if (( $(echo "$CPU_USAGE < 80" | bc -l) )); then
    check_pass "CPU usage: ${CPU_USAGE}%"
else
    check_warn "High CPU usage: ${CPU_USAGE}%"
fi

# Check memory usage
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
if (( $(echo "$MEM_USAGE < 80" | bc -l) )); then
    check_pass "Memory usage: ${MEM_USAGE}%"
else
    check_warn "High memory usage: ${MEM_USAGE}%"
fi

# Check disk usage
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if (( $(echo "$DISK_USAGE < 80" | bc -l) )); then
    check_pass "Disk usage: ${DISK_USAGE}%"
else
    check_warn "High disk usage: ${DISK_USAGE}%"
fi

echo ""
echo "=== Verification Summary ==="
echo "===================================="
echo -e "Total Checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! System is ready for operation.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review and fix issues.${NC}"
    exit 1
fi