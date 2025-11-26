#!/bin/bash

# Script zum Deployment auf den Produktionsserver
# Verwendet SCP zum Übertragen und Docker zum Laden

set -e

# Konfiguration
IMAGE_NAME="heatmanager-webapp"
IMAGE_TAG="${1:-latest}"
EXPORT_FILE="heatmanager-webapp-${IMAGE_TAG}.tar.gz"

# Server-Konfiguration (kann als Parameter übergeben werden)
SERVER_USER="${2:-root}"
SERVER_HOST="${3:-your-server.com}"
SERVER_PATH="${4:-/tmp}"

echo "🚀 Deploying ${IMAGE_NAME}:${IMAGE_TAG} to ${SERVER_USER}@${SERVER_HOST}"

# Prüfe ob Image existiert
if ! docker image inspect ${IMAGE_NAME}:${IMAGE_TAG} &> /dev/null; then
    echo "❌ Image ${IMAGE_NAME}:${IMAGE_TAG} nicht gefunden!"
    echo "Bitte erstellen Sie das Image zuerst mit: ./docker-build.sh"
    exit 1
fi

# Exportiere Image
echo "📦 Exporting Docker image..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} | gzip > ${EXPORT_FILE}

# Übertrage auf Server
echo "📤 Uploading to server..."
scp ${EXPORT_FILE} ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/

# Auf Server laden
echo "📥 Loading image on server..."
ssh ${SERVER_USER}@${SERVER_HOST} "gunzip -c ${SERVER_PATH}/${EXPORT_FILE} | docker load"

# Cleanup auf Server
echo "🧹 Cleaning up..."
ssh ${SERVER_USER}@${SERVER_HOST} "rm ${SERVER_PATH}/${EXPORT_FILE}"

# Cleanup lokal
rm ${EXPORT_FILE}

echo "✅ Deployment erfolgreich!"
echo ""
echo "Auf dem Server können Sie den Container jetzt starten:"
echo "  docker run -d -p 3000:3000 --name heatmanager-webapp --env-file .env.production --restart unless-stopped ${IMAGE_NAME}:${IMAGE_TAG}"

