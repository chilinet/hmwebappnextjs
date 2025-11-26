# Docker Build für HeatManager Webapp

## Übersicht

Dieses Dokument beschreibt, wie Sie einen Docker-Container aus dem Next.js Build erstellen.

## Voraussetzungen

- Docker installiert
- Node.js 20+ (für lokalen Build)
- Alle Umgebungsvariablen konfiguriert

## Build-Prozess

### 1. Lokaler Build (empfohlen für Tests)

```bash
# Dependencies installieren und Build erstellen
npm install
npm run build

# Docker Image erstellen
docker build -t heatmanager-webapp:latest .
```

### 2. Mit Build-Script

```bash
# Build-Script verwenden
./docker-build.sh

# Oder mit spezifischem Tag
./docker-build.sh v0.9
```

### 3. Mit Docker Compose

```bash
# Production Build mit Docker Compose
docker-compose -f docker-compose.production.yml build

# Container starten
docker-compose -f docker-compose.production.yml up -d
```

## Docker Image Details

### Multi-Stage Build

Das Dockerfile verwendet einen Multi-Stage Build mit 3 Stufen:

1. **deps**: Installiert nur die Dependencies
2. **builder**: Führt den Next.js Build durch
3. **runner**: Erstellt das finale Production-Image

### Standalone Output

Das Image nutzt den Next.js `standalone` output, der:
- Nur die benötigten Dependencies enthält
- Deutlich kleiner ist als ein vollständiges Image
- `server.js` automatisch generiert

### Image-Größe

Das finale Image ist optimiert und enthält nur:
- Node.js Runtime
- Standalone Next.js Output
- Public Assets
- Statische Dateien

## Umgebungsvariablen

Erstellen Sie eine `.env.production` Datei mit allen benötigten Variablen:

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

## Container starten

### Einfacher Start

```bash
docker run -p 3000:3000 \
  --env-file .env.production \
  heatmanager-webapp:latest
```

### Mit Docker Compose

```bash
docker-compose -f docker-compose.production.yml up -d
```

### Mit spezifischen Umgebungsvariablen

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e NEXTAUTH_URL=https://your-domain.com \
  -e THINGSBOARD_URL=https://your-thingsboard-instance.com \
  heatmanager-webapp:latest
```

## Health Check

Der Container enthält einen Health Check, der alle 30 Sekunden prüft, ob die Anwendung läuft.

## Troubleshooting

### Build schlägt fehl

1. Stellen Sie sicher, dass `npm run build` lokal funktioniert
2. Prüfen Sie, ob alle Dependencies in `package.json` vorhanden sind
3. Prüfen Sie die Docker-Logs: `docker build --progress=plain .`

### Container startet nicht

1. Prüfen Sie die Logs: `docker logs heatmanager-webapp`
2. Stellen Sie sicher, dass alle Umgebungsvariablen gesetzt sind
3. Prüfen Sie, ob Port 3000 verfügbar ist

### Standalone output fehlt

Stellen Sie sicher, dass `next.config.js` `output: 'standalone'` enthält.

## Image Tags

- `heatmanager-webapp:latest` - Neueste Version
- `heatmanager-webapp:v0.9` - Spezifische Version

## Image pushen (optional)

```bash
# Zu Docker Hub pushen
docker tag heatmanager-webapp:latest your-username/heatmanager-webapp:v0.9
docker push your-username/heatmanager-webapp:v0.9

# Zu privatem Registry pushen
docker tag heatmanager-webapp:latest registry.example.com/heatmanager-webapp:v0.9
docker push registry.example.com/heatmanager-webapp:v0.9
```

