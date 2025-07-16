#!/bin/bash

# ----------------------
# KUDU Deployment Script
# Version: 1.0.18
# ----------------------

set -e  # Exit on any error

echo "Starting deployment..."
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Clean up any existing build artifacts
echo "Cleaning up previous build artifacts..."
rm -rf .next
rm -rf node_modules

echo "Installing dependencies..."
# Install dependencies
npm install

echo "Dependencies installed successfully"

echo "Building the Next.js application..."
# Build the Next.js application with verbose output
npm run build

echo "Build completed. Verifying build output..."
# Verify that the .next directory exists and contains build files
if [ ! -d ".next" ]; then
    echo "ERROR: .next directory was not created during build!"
    exit 1
fi

if [ ! -f ".next/BUILD_ID" ]; then
    echo "ERROR: BUILD_ID file not found in .next directory!"
    exit 1
fi

echo "Build verification successful. BUILD_ID: $(cat .next/BUILD_ID)"

echo "Creating deployment directory..."
# Create the deployment directory if it doesn't exist
mkdir -p /home/site/wwwroot

echo "Copying files to deployment directory..."
# Copy all necessary files to the deployment directory
echo "Copying .next directory..."
cp -r .next /home/site/wwwroot/

echo "Copying public directory..."
cp -r public /home/site/wwwroot/

echo "Copying configuration files..."
cp server.js /home/site/wwwroot/
cp package.json /home/site/wwwroot/
cp package-lock.json /home/site/wwwroot/
cp next.config.js /home/site/wwwroot/
cp ecosystem.config.js /home/site/wwwroot/

echo "Verifying copied files..."
# Verify that the .next directory was copied correctly
if [ ! -d "/home/site/wwwroot/.next" ]; then
    echo "ERROR: .next directory was not copied to deployment directory!"
    exit 1
fi

if [ ! -f "/home/site/wwwroot/.next/BUILD_ID" ]; then
    echo "ERROR: BUILD_ID file not found in deployment .next directory!"
    exit 1
fi

echo "Files copied successfully. Deployment BUILD_ID: $(cat /home/site/wwwroot/.next/BUILD_ID)"

echo "Installing production dependencies..."
# Install production dependencies in the deployment directory
cd /home/site/wwwroot
npm install --only=production

echo "Installing PM2 globally..."
npm install -g pm2
echo "PM2 installed"

echo "Stopping any existing PM2 processes..."
pm2 stop all || true
pm2 delete all || true

echo "Starting the application using PM2..."
pm2 start ecosystem.config.js
echo "Application started"

echo "PM2 status:"
pm2 status

echo "Deployment completed successfully"