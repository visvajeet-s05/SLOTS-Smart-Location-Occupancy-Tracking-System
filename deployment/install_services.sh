#!/bin/bash
# SLOTS Field Deployment - Systemd Service Installation Script
# ============================================================
# This script installs and configures the systemd services for
# the SLOTS edge node at the pilot deployment site.

set -e

echo "🚀 SLOTS Field Deployment - Systemd Service Installation"
echo "=========================================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Create deployment directory
DEPLOY_DIR="/home/pi/slots"
echo "📁 Setting up deployment directory: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy systemd service files
echo "📋 Installing systemd service files..."
cp deployment/slots-vision.service /etc/systemd/system/
cp deployment/slots-sync.service /etc/systemd/system/

# Set proper permissions
echo "🔒 Setting file permissions..."
chmod 644 /etc/systemd/system/slots-vision.service
chmod 644 /etc/systemd/system/slots-sync.service

# Reload systemd daemon
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable services
echo "✅ Enabling services..."
systemctl enable slots-vision.service
systemctl enable slots-sync.service

# Start services
echo "▶️  Starting services..."
systemctl start slots-vision.service
systemctl start slots-sync.service

# Check service status
echo "📊 Checking service status..."
systemctl status slots-vision.service --no-pager
systemctl status slots-sync.service --no-pager

echo "✅ Systemd service installation completed!"
echo ""
echo "📝 To view logs:"
echo "   sudo journalctl -u slots-vision.service -f"
echo "   sudo journalctl -u slots-sync.service -f"
echo ""
echo "📝 To manage services:"
echo "   sudo systemctl restart slots-vision.service"
echo "   sudo systemctl restart slots-sync.service"
echo "   sudo systemctl stop slots-vision.service"
echo "   sudo systemctl stop slots-sync.service"