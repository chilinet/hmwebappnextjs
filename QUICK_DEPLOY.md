# Schnellstart: Docker auf Produktionsserver deployen

## Schnellste Methode (3 Schritte)

### 1. Lokal: Image erstellen und exportieren

```bash
# Image bauen
./docker-build.sh

# Image exportieren
./docker-export.sh
```

### 2. Auf Server übertragen

```bash
# Ersetzen Sie user@server.com mit Ihren Server-Daten
scp heatmanager-webapp-latest.tar.gz user@server.com:/tmp/
```

### 3. Auf Server: Image laden und starten

```bash
# SSH zum Server
ssh user@server.com

# Deployment-Script ausführen
cd /tmp
wget https://raw.githubusercontent.com/your-repo/deploy-on-server.sh
chmod +x deploy-on-server.sh
./deploy-on-server.sh

# Oder manuell:
gunzip -c /tmp/heatmanager-webapp-latest.tar.gz | docker load
docker run -d --name heatmanager-webapp -p 3000:3000 --env-file /app/.env.production --restart unless-stopped heatmanager-webapp:latest
```

## Automatisches Deployment (1 Befehl)

```bash
# Mit dem Deployment-Script (übertragt und deployt automatisch)
./docker-deploy.sh latest user server.com /tmp
```

## Wichtige Dateien auf dem Server

### .env.production erstellen

```bash
# Auf dem Server
nano /app/.env.production
```

Fügen Sie alle benötigten Umgebungsvariablen hinzu.

### deploy-on-server.sh übertragen

```bash
# Vom lokalen Rechner
scp deploy-on-server.sh user@server.com:/usr/local/bin/
ssh user@server.com "chmod +x /usr/local/bin/deploy-on-server.sh"
```

## Update-Prozess

```bash
# 1. Lokal: Neues Image
./docker-build.sh v0.9
./docker-export.sh v0.9

# 2. Übertragen
scp heatmanager-webapp-v0.9.tar.gz user@server.com:/tmp/

# 3. Auf Server deployen
ssh user@server.com "deploy-on-server.sh v0.9"
```

## Container-Verwaltung

```bash
# Logs anzeigen
docker logs -f heatmanager-webapp

# Container stoppen
docker stop heatmanager-webapp

# Container starten
docker start heatmanager-webapp

# Container neu starten
docker restart heatmanager-webapp

# Status prüfen
docker ps | grep heatmanager-webapp
```

