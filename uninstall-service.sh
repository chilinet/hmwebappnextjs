#!/bin/bash

# HMWebApp Docker Service Uninstallation Script

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

print_status "Stopping hmwebapp service..."
systemctl stop hmwebapp.service || true

print_status "Disabling hmwebapp service..."
systemctl disable hmwebapp.service || true

print_status "Removing service file..."
rm -f /etc/systemd/system/hmwebapp.service

print_status "Reloading systemd daemon..."
systemctl daemon-reload

print_status "Service uninstallation completed!"
echo ""
print_warning "The application files are still in the current directory."
print_warning "To completely remove the application, delete the directory manually." 