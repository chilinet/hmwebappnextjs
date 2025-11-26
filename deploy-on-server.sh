#!/bin/bash

# Deployment-Script für den Produktionsserver
# Dieses Script sollte auf dem Server ausgeführt werden

set -e

IMAGE_NAME="heatmanager-webapp"
IMAGE_TAG="${1:-latest}"
CONTAINER_NAME="heatmanager-webapp"
TAR_FILE="/tmp/heatmanager-webapp-${IMAGE_TAG}.tar.gz"
ENV_FILE="/app/.env.production"

echo "🚀 Deploying ${IMAGE_NAME}:${IMAGE_TAG}..."

# Prüfe ob tar-Datei existiert
if [ ! -f "${TAR_FILE}" ]; then
    echo "❌ Image-Datei nicht gefunden: ${TAR_FILE}"
    echo "Bitte übertragen Sie die Datei zuerst mit:"
    echo "  scp heatmanager-webapp-${IMAGE_TAG}.tar.gz user@server:/tmp/"
    exit 1
fi

# Prüfe ob .env.production existiert
if [ ! -f "${ENV_FILE}" ]; then
    echo "❌ FEHLER: ${ENV_FILE} nicht gefunden!"
    echo ""
    echo "Bitte erstellen Sie die Datei ${ENV_FILE} mit allen benötigten Umgebungsvariablen:"
    echo "  - NEXTAUTH_SECRET (erforderlich!)"
    echo "  - NEXTAUTH_URL"
    echo "  - THINGSBOARD_URL"
    echo "  - MSSQL_SERVER"
    echo "  - MSSQL_USER"
    echo "  - MSSQL_PASSWORD"
    echo "  - MSSQL_DATABASE"
    echo "  - REPORTING_URL (optional)"
    echo "  - REPORTING_PRESHARED_KEY (optional)"
    echo ""
    exit 1
fi

# Validiere, dass NEXTAUTH_SECRET gesetzt ist
if ! grep -q "NEXTAUTH_SECRET=" "${ENV_FILE}" || grep -q "NEXTAUTH_SECRET=$" "${ENV_FILE}"; then
    echo "❌ FEHLER: NEXTAUTH_SECRET ist nicht in ${ENV_FILE} gesetzt!"
    echo "Dies ist eine erforderliche Variable für NextAuth."
    exit 1
fi

# Stoppe und entferne alten Container
echo "🛑 Stopping existing container..."
if docker ps -a | grep -q ${CONTAINER_NAME}; then
    docker stop ${CONTAINER_NAME} 2>/dev/null || true
    docker rm ${CONTAINER_NAME} 2>/dev/null || true
    echo "✅ Alten Container entfernt"
fi

# Entferne altes Image (optional)
echo "🗑️  Removing old image..."
docker rmi ${IMAGE_NAME}:${IMAGE_TAG} 2>/dev/null || true

# Lade neues Image
echo "📥 Loading new image..."
gunzip -c ${TAR_FILE} | docker load

# Prüfe ob Image geladen wurde
if ! docker image inspect ${IMAGE_NAME}:${IMAGE_TAG} &> /dev/null; then
    echo "❌ Fehler beim Laden des Images!"
    exit 1
fi

# Starte neuen Container
echo "🚀 Starting new container..."
if [ -f "${ENV_FILE}" ]; then
    docker run -d \
        --name ${CONTAINER_NAME} \
        -p 3000:3000 \
        --env-file ${ENV_FILE} \
        --restart unless-stopped \
        ${IMAGE_NAME}:${IMAGE_TAG}
else
    echo "⚠️  Starte ohne .env.production - Umgebungsvariablen müssen manuell gesetzt werden"
    docker run -d \
        --name ${CONTAINER_NAME} \
        -p 3000:3000 \
        --restart unless-stopped \
        ${IMAGE_NAME}:${IMAGE_TAG}
fi

# Warte kurz
sleep 2

# Prüfe Status
if docker ps | grep -q ${CONTAINER_NAME}; then
    echo "✅ Container erfolgreich gestartet!"
    echo ""
    echo "Container-Status:"
    docker ps | grep ${CONTAINER_NAME}
    echo ""
    echo "Logs anzeigen mit:"
    echo "  docker logs -f ${CONTAINER_NAME}"
else
    echo "❌ Container konnte nicht gestartet werden!"
    echo "Logs:"
    docker logs ${CONTAINER_NAME}
    exit 1
fi

# Cleanup
echo "🧹 Cleaning up..."
rm -f ${TAR_FILE}

echo ""
echo "✅ Deployment erfolgreich abgeschlossen!"

