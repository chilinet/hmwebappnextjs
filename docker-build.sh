#!/bin/bash

# Docker Build Script für HeatManager Webapp
# Erstellt ein Docker Image aus dem Next.js Build

set -e

echo "🐳 Building Docker image for HeatManager Webapp..."

# Image Name und Tag
IMAGE_NAME="heatmanager-webapp"
IMAGE_TAG="${1:-latest}"

# Build das Docker Image
docker build \
  --tag ${IMAGE_NAME}:${IMAGE_TAG} \
  --tag ${IMAGE_NAME}:latest \
  --file Dockerfile \
  .

echo "✅ Docker image built successfully!"
echo ""
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "To run the container:"
echo "  docker run -p 3000:3000 ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "To run with environment variables:"
echo "  docker run -p 3000:3000 --env-file .env.production ${IMAGE_NAME}:${IMAGE_TAG}"
