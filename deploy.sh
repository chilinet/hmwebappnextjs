#!/bin/bash

# ----------------------
# KUDU Deployment Script
# Version: 1.0.17
# ----------------------
echo "Starting deployment..."
# Install dependencies
npm install

echo "Dependencies installed"

echo "Building the Next.js application"
# Build the Next.js application
npm run build
echo "Build completed"

echo "Creating deployment directory"
# Create the deployment directory if it doesn't exist
mkdir -p /home/site/wwwroot

echo "Copying files to deployment directory"
# Copy all necessary files to the deployment directory
cp -r .next /home/site/wwwroot/
cp -r public /home/site/wwwroot/
cp server.js /home/site/wwwroot/
cp package.json /home/site/wwwroot/
cp package-lock.json /home/site/wwwroot/
cp next.config.js /home/site/wwwroot/

echo "Installing production dependencies"
# Install production dependencies in the deployment directory
cd /home/site/wwwroot
npm install --only=production

echo "Installing PM2 globally"
npm install -g pm2
echo "PM2 installed"

echo "Starting the application using PM2"
pm2 start ecosystem.config.js 
echo "Application started"

echo "Deployment completed successfully"