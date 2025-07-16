#!/bin/bash

# Azure App Service Startup Script
# This script ensures the Next.js application starts correctly in production

echo "Azure App Service Startup Script"
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "ERROR: package.json not found in current directory"
    exit 1
fi

# Check if .next directory exists
if [ ! -d ".next" ]; then
    echo "ERROR: .next directory not found. Application needs to be built first."
    echo "Available files:"
    ls -la
    exit 1
fi

# Check if BUILD_ID exists
if [ ! -f ".next/BUILD_ID" ]; then
    echo "ERROR: BUILD_ID not found in .next directory"
    echo "Contents of .next directory:"
    ls -la .next/
    exit 1
fi

echo "Build verification successful. BUILD_ID: $(cat .next/BUILD_ID)"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing production dependencies..."
    npm install --only=production
fi

# Install PM2 if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Stop any existing PM2 processes
echo "Stopping existing PM2 processes..."
pm2 stop all || true
pm2 delete all || true

# Start the application
echo "Starting application with PM2..."
pm2 start ecosystem.config.js

# Show PM2 status
echo "PM2 Status:"
pm2 status

# Keep the script running to prevent container exit
echo "Startup script completed. Application should be running."
echo "PM2 logs will be available in the application logs."

# Optional: Keep the script alive for debugging
# tail -f /dev/null 