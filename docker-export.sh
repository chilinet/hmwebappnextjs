#!/bin/bash

# Script zum Exportieren des Docker Images für den Transfer zum Produktionsserver

set -e

IMAGE_NAME="heatmanager-webapp"
IMAGE_TAG="${1:-latest}"
EXPORT_FILE="heatmanager-webapp-${IMAGE_TAG}.tar"

echo "🐳 Exporting Docker image..."

# Prüfe ob Image existiert
if ! docker image inspect ${IMAGE_NAME}:${IMAGE_TAG} &> /dev/null; then
    echo "❌ Image ${IMAGE_NAME}:${IMAGE_TAG} nicht gefunden!"
    echo "Bitte erstellen Sie das Image zuerst mit: ./docker-build.sh"
    exit 1
fi

# Image als tar-Datei exportieren
echo "📦 Exporting ${IMAGE_NAME}:${IMAGE_TAG} to ${EXPORT_FILE}..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} | gzip > ${EXPORT_FILE}.gz

# Prüfe ob Export erfolgreich war
if [ -f "${EXPORT_FILE}.gz" ]; then
    FILE_SIZE=$(du -h "${EXPORT_FILE}.gz" | cut -f1)
    echo "✅ Image erfolgreich exportiert!"
    echo ""
    echo "📁 Datei: ${EXPORT_FILE}.gz"
    echo "📊 Größe: ${FILE_SIZE}"
    echo ""
    echo "Zum Übertragen auf den Server:"
    echo "  scp ${EXPORT_FILE}.gz user@server:/path/to/destination/"
    echo ""
    echo "Auf dem Server dann:"
    echo "  gunzip -c ${EXPORT_FILE}.gz | docker load"
    echo "  docker run -p 3000:3000 --env-file .env.production ${IMAGE_NAME}:${IMAGE_TAG}"
else
    echo "❌ Export fehlgeschlagen!"
    exit 1
fi

