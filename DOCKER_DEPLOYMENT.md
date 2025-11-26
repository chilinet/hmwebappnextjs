# Docker Deployment auf Produktionsserver

## Übersicht

Dieses Dokument beschreibt verschiedene Methoden, um den Docker-Container auf den Produktionsserver zu übertragen.

## Methode 1: Docker Image Export/Import (Empfohlen)

### Schritt 1: Image lokal erstellen

```bash
# Build das Image
./docker-build.sh

# Oder direkt
docker build -t heatmanager-webapp:latest .
```

### Schritt 2: Image exportieren

```bash
# Mit dem Export-Script
./docker-export.sh

# Oder manuell
docker save heatmanager-webapp:latest | gzip > heatmanager-webapp.tar.gz
```

### Schritt 3: Auf Server übertragen

```bash
# Mit SCP
scp heatmanager-webapp.tar.gz user@your-server.com:/tmp/

# Oder mit rsync (für große Dateien besser)
rsync -avz --progress heatmanager-webapp.tar.gz user@your-server.com:/tmp/
```

### Schritt 4: Auf Server importieren

```bash
# SSH zum Server
ssh user@your-server.com

# Image laden
gunzip -c /tmp/heatmanager-webapp.tar.gz | docker load

# Oder ohne gunzip (wenn bereits entpackt)
docker load < /tmp/heatmanager-webapp.tar
```

### Schritt 5: Container starten

```bash
# Mit Umgebungsvariablen
docker run -d \
  --name heatmanager-webapp \
  -p 3000:3000 \
  --env-file .env.production \
  --restart unless-stopped \
  heatmanager-webapp:latest

# Oder mit Docker Compose
docker-compose -f docker-compose.production.yml up -d
```

## Methode 2: Automatisches Deployment-Script

```bash
# Verwendung des Deployment-Scripts
./docker-deploy.sh [tag] [user] [host] [path]

# Beispiel
./docker-deploy.sh latest root your-server.com /tmp
```

Das Script:
1. Exportiert das Image lokal
2. Überträgt es auf den Server
3. Lädt es auf dem Server
4. Räumt temporäre Dateien auf

## Methode 3: Docker Registry (Für häufige Deployments)

### Docker Hub

```bash
# Image taggen
docker tag heatmanager-webapp:latest your-username/heatmanager-webapp:v0.9

# Zu Docker Hub pushen
docker login
docker push your-username/heatmanager-webapp:v0.9

# Auf Server pullen
docker pull your-username/heatmanager-webapp:v0.9
docker run -d -p 3000:3000 --env-file .env.production your-username/heatmanager-webapp:v0.9
```

### Private Registry

```bash
# Image taggen für private Registry
docker tag heatmanager-webapp:latest registry.example.com/heatmanager-webapp:v0.9

# Pushen
docker push registry.example.com/heatmanager-webapp:v0.9

# Auf Server pullen
docker pull registry.example.com/heatmanager-webapp:v0.9
```

## Methode 4: Direkt auf Server bauen

```bash
# Code auf Server übertragen
rsync -avz --exclude node_modules --exclude .next . user@server:/app/heatmanager-webapp/

# Auf Server bauen
ssh user@server "cd /app/heatmanager-webapp && docker build -t heatmanager-webapp:latest ."
```

## Vollständiges Deployment-Script für Server

Erstellen Sie auf dem Server: `deploy-on-server.sh`

```bash
#!/bin/bash
# deploy-on-server.sh

set -e

IMAGE_NAME="heatmanager-webapp"
IMAGE_TAG="${1:-latest}"
CONTAINER_NAME="heatmanager-webapp"

echo "🔄 Stopping existing container..."
docker stop ${CONTAINER_NAME} 2>/dev/null || true
docker rm ${CONTAINER_NAME} 2>/dev/null || true

echo "📥 Loading new image..."
gunzip -c /tmp/heatmanager-webapp-${IMAGE_TAG}.tar.gz | docker load

echo "🚀 Starting new container..."
docker run -d \
  --name ${CONTAINER_NAME} \
  -p 3000:3000 \
  --env-file /app/.env.production \
  --restart unless-stopped \
  ${IMAGE_NAME}:${IMAGE_TAG}

echo "✅ Deployment erfolgreich!"
docker ps | grep ${CONTAINER_NAME}
```

## Umgebungsvariablen auf Server

Erstellen Sie auf dem Server `/app/.env.production`:

```env
NODE_ENV=production
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-secret-key
THINGSBOARD_URL=https://your-thingsboard-instance.com
MSSQL_SERVER=your-sql-server
MSSQL_USER=your-sql-user
MSSQL_PASSWORD=your-sql-password
MSSQL_DATABASE=your-database
REPORTING_URL=https://your-reporting-url
REPORTING_PRESHARED_KEY=your-preshared-key
```

## Container-Verwaltung auf Server

### Container starten
```bash
docker start heatmanager-webapp
```

### Container stoppen
```bash
docker stop heatmanager-webapp
```

### Logs anzeigen
```bash
docker logs -f heatmanager-webapp
```

### Container neu starten
```bash
docker restart heatmanager-webapp
```

### Status prüfen
```bash
docker ps | grep heatmanager-webapp
docker stats heatmanager-webapp
```

## Update-Prozess

### Vollständiges Update

```bash
# 1. Lokal: Neues Image bauen
./docker-build.sh v0.9

# 2. Exportieren
./docker-export.sh v0.9

# 3. Auf Server übertragen
scp heatmanager-webapp-v0.9.tar.gz user@server:/tmp/

# 4. Auf Server: Alten Container stoppen
ssh user@server "docker stop heatmanager-webapp && docker rm heatmanager-webapp"

# 5. Auf Server: Neues Image laden
ssh user@server "gunzip -c /tmp/heatmanager-webapp-v0.9.tar.gz | docker load"

# 6. Auf Server: Neuen Container starten
ssh user@server "docker run -d --name heatmanager-webapp -p 3000:3000 --env-file /app/.env.production --restart unless-stopped heatmanager-webapp:v0.9"
```

## Troubleshooting

### Image zu groß

- Verwenden Sie `docker save` mit Kompression: `docker save | gzip`
- Prüfen Sie die Image-Größe: `docker images heatmanager-webapp`

### Übertragung langsam

- Verwenden Sie `rsync` statt `scp` für bessere Performance
- Komprimieren Sie das Image vor der Übertragung

### Container startet nicht

- Prüfen Sie die Logs: `docker logs heatmanager-webapp`
- Prüfen Sie Umgebungsvariablen: `docker exec heatmanager-webapp env`
- Prüfen Sie Port-Konflikte: `netstat -tulpn | grep 3000`

### Permission-Probleme

- Stellen Sie sicher, dass der User in der `docker` Gruppe ist
- Verwenden Sie `sudo` wenn nötig

## Sicherheit

- Verwenden Sie niemals `--privileged` Flag
- Setzen Sie `--read-only` für das Root-Dateisystem wenn möglich
- Verwenden Sie Secrets-Management für sensible Daten
- Regelmäßige Updates des Base-Images

## Monitoring

### Health Check

```bash
# Health Check Status
docker inspect --format='{{.State.Health.Status}}' heatmanager-webapp
```

### Ressourcen-Monitoring

```bash
# Container-Statistiken
docker stats heatmanager-webapp

# Disk-Usage
docker system df
```

