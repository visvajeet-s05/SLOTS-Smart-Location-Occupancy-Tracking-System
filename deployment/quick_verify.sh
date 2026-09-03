#!/bin/bash
# SLOTS Quick Verification Script
# ================================
# Immediate verification commands for field deployment sanity check.

echo "🔍 SLOTS Quick Verification"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "=== Edge Sync Status Check ==="
echo "Running: python edge/sync_daemon.py --status-check"
echo ""

if python edge/sync_daemon.py --status-check; then
    echo -e "${GREEN}✅ Sync daemon status check passed${NC}"
else
    echo -e "${RED}❌ Sync daemon status check failed${NC}"
fi

echo ""
echo "=== Vision Service Logs (Last 20 lines) ==="
echo "Running: journalctl -u slots-vision.service -f --no-pager"
echo ""
echo "Press Ctrl+C to exit log view"
journalctl -u slots-vision.service -f --no-pager