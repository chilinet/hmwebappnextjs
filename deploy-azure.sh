#!/bin/bash

# Simplified Azure App Service Deployment Script
# This script focuses on the essential build and deployment steps

set -e

echo "=== Azure App Service Deployment ==="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"

# Clean previous build artifacts
echo "Cleaning previous build artifacts..."
rm -rf .next
rm -rf node_modules

# Install all dependencies
echo "Installing dependencies..."
npm install

# Build the Next.js application
echo "Building Next.js application..."
npm run build

# Verify build output
echo "Verifying build output..."
if [ ! -d ".next" ]; then
    echo "ERROR: .next directory was not created!"
    exit 1
fi

if [ ! -f ".next/BUILD_ID" ]; then
    echo "ERROR: BUILD_ID file not found!"
    exit 1
fi

echo "Build successful! BUILD_ID: $(cat .next/BUILD_ID)"

# Install only production dependencies
echo "Installing production dependencies..."
npm install --only=production

echo "Deployment completed successfully!"
echo "The application will be started by Azure App Service using: node server.js" 