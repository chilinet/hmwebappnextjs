#!/bin/bash

# ----------------------
# KUDU Deployment Script
# Version: 1.0.17
# ----------------------

# Install dependencies
npm install

# Build the Next.js application
npm run build

# Install PM2 globally
npm install -g pm2

# Start the application using PM2
pm2 start ecosystem.config.js 