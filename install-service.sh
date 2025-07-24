#!/bin/bash

# HMWebApp Docker Service Installation Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (use sudo)"
    exit 1
fi

# Get the current directory
APP_DIR=$(pwd)
print_status "Application directory: $APP_DIR"

# Check if docker-compose.simple.yml exists
if [ ! -f "docker-compose.simple.yml" ]; then
    print_error "docker-compose.simple.yml not found in current directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Please create one before starting the service."
fi

# Create the service file
print_status "Creating systemd service file..."

cat > /etc/systemd/system/hmwebapp.service << EOF
[Unit]
Description=HMWebApp Docker Compose Service
Requires=docker.service
After=docker.service
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose -f docker-compose.simple.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.simple.yml down
ExecReload=/usr/local/bin/docker-compose -f docker-compose.simple.yml restart
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
print_status "Reloading systemd daemon..."
systemctl daemon-reload

# Enable the service
print_status "Enabling hmwebapp service..."
systemctl enable hmwebapp.service

print_status "Service installation completed!"
echo ""
echo "Service commands:"
echo "  Start:   sudo systemctl start hmwebapp"
echo "  Stop:    sudo systemctl stop hmwebapp"
echo "  Restart: sudo systemctl restart hmwebapp"
echo "  Status:  sudo systemctl status hmwebapp"
echo "  Logs:    sudo journalctl -u hmwebapp -f"
echo ""
print_warning "Don't forget to create/update your .env file before starting the service!" 