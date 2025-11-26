# Docker Logo Fix

## Problem
Das HeatManager Logo wird im Docker-Container nicht angezeigt. Das Logo wird über Next.js Image-Komponente geladen: `/assets/img/heatmanager-logo.png`

## Lösung

### 1. Dockerfile Anpassungen

Das `public` Verzeichnis muss **nach** dem standalone output kopiert werden und im gleichen Verzeichnis wie `server.js` liegen.

Im `Dockerfile.production` wurde sichergestellt, dass:
- `public` nach dem standalone output kopiert wird
- Die Berechtigungen korrekt gesetzt sind (`chmod -R 755 ./public`)

### 2. Next.js Konfiguration

In `next.config.js` wurde die Image-Konfiguration hinzugefügt, um sicherzustellen, dass Bilder korrekt optimiert werden.

### 3. Verifizierung

Nach dem Build können Sie im Container prüfen:

```bash
# Container starten
docker run -it --rm heatmanager-webapp:latest sh

# Im Container prüfen
ls -la /app/public/assets/img/heatmanager-logo.png
```

Die Datei sollte existieren und lesbar sein.

## Build und Test

```bash
# Neues Image bauen
./docker-build.sh

# Lokal testen
docker run -p 3000:3000 --env-file .env.production heatmanager-webapp:latest

# Im Browser prüfen: http://localhost:3000
# Das Logo sollte jetzt angezeigt werden
```

## Troubleshooting

Falls das Logo immer noch nicht angezeigt wird:

1. **Prüfen Sie die Container-Logs:**
   ```bash
   docker logs heatmanager-webapp
   ```

2. **Prüfen Sie, ob die Datei existiert:**
   ```bash
   docker exec heatmanager-webapp ls -la /app/public/assets/img/
   ```

3. **Prüfen Sie die Netzwerk-Anfragen im Browser:**
   - Öffnen Sie die Entwicklertools (F12)
   - Gehen Sie zum Network-Tab
   - Laden Sie die Seite neu
   - Prüfen Sie, ob `/assets/img/heatmanager-logo.png` oder `/_next/image?url=...` einen 404-Fehler zeigt

4. **Falls Next.js Image Optimization Probleme macht:**
   - Sie können `unoptimized: true` in `next.config.js` setzen
   - Oder das Logo direkt als `<img>` statt `<Image>` verwenden

