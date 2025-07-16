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

# Start the application directly with Node instead of PM2 for Azure
echo "Starting application directly with Node..."
echo "PORT: $PORT"
echo "NODE_ENV: $NODE_ENV"

# Start the application directly
exec node server.js 