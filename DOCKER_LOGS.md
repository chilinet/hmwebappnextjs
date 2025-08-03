# 🐳 Docker Logs - Wo finde ich die Logs?

## 📍 Log-Locations auf dem Server

### 1. **Container Logs (Hauptlogs)**

```bash
# Alle Container-Logs anzeigen
docker-compose -f docker-compose.simple.yml logs

# Logs in Echtzeit verfolgen
docker-compose -f docker-compose.simple.yml logs -f

# Spezifischer Container
docker-compose -f docker-compose.simple.yml logs hmwebapp

# Letzte 50 Zeilen
docker-compose -f docker-compose.simple.yml logs --tail=50
```

### 2. **Docker System Logs**

```bash
# Docker Service Logs
journalctl -u docker.service

# Docker Service Logs in Echtzeit
journalctl -u docker.service -f

# Docker Events der letzten Stunde
docker events --since 1h --until now
```

### 3. **Application Logs (innerhalb des Containers)**

```bash
# Container ID finden
docker ps -q --filter name=hmwebapp

# Application Logs anzeigen
docker exec -it $(docker ps -q --filter name=hmwebapp) cat /app/.next/server.log

# Application Logs in Echtzeit
docker exec -it $(docker ps -q --filter name=hmwebapp) tail -f /app/.next/server.log

# Next.js Build Logs
docker exec -it $(docker ps -q --filter name=hmwebapp) cat /app/.next/build-manifest.json
```

### 4. **System Logs**

```bash
# Docker System Logs
/var/log/docker.log

# Syslog mit Docker Filter
/var/log/syslog | grep docker

# Systemd Docker Service
systemctl status docker
```

## 🚀 Logs über SSH abrufen

### **Einfache Verbindung:**

```bash
# Mit Passwort (sshpass erforderlich)
sshpass -p "Ch!l!net$$01" ssh root@webapp02.heatmanager.cloud

# Dann im Server:
cd /home/root/hmwebapp
docker-compose -f docker-compose.simple.yml logs -f
```

### **Direkte Log-Abfrage:**

```bash
# Container Status
sshpass -p "Ch!l!net$$01" ssh root@webapp02.heatmanager.cloud "docker ps -a"

# Container Logs
sshpass -p "Ch!l!net$$01" ssh root@webapp02.heatmanager.cloud "cd /home/root/hmwebapp && docker-compose -f docker-compose.simple.yml logs"

# Real-time Logs
sshpass -p "Ch!l!net$$01" ssh root@webapp02.heatmanager.cloud "cd /home/root/hmwebapp && docker-compose -f docker-compose.simple.yml logs -f"
```

## 🛠️ Log-Helper Script verwenden

### **Script ausführen:**

```bash
# Interaktives Menu
./docker-logs.sh

# Direkte Ausführung
./docker-logs.sh webapp02.heatmanager.cloud root "Ch!l!net$$01"
```

### **Script-Optionen:**

1. **Log-Locations anzeigen** - Zeigt alle verfügbaren Log-Befehle
2. **Aktuelle Logs anzeigen** - Verbindet und zeigt aktuelle Logs
3. **Real-time Logs** - Verfolgt Logs in Echtzeit
4. **Spezifische Container-Logs** - Logs für bestimmten Container
5. **Docker System Logs** - System-Level Docker Logs
6. **Application Logs** - Next.js Application Logs
7. **Alle Logs** - Umfassender Log-Report

## 🔍 Häufige Log-Probleme

### **Container startet nicht:**

```bash
# Container Status prüfen
docker ps -a

# Container Logs anzeigen
docker-compose -f docker-compose.simple.yml logs hmwebapp

# Build Logs prüfen
docker-compose -f docker-compose.simple.yml build --no-cache
```

### **Application Fehler:**

```bash
# Application Logs im Container
docker exec -it $(docker ps -q --filter name=hmwebapp) tail -f /app/.next/server.log

# Environment prüfen
docker exec -it $(docker ps -q --filter name=hmwebapp) env | grep -E "(NODE_ENV|PORT|DATABASE)"
```

### **Port-Konflikte:**

```bash
# Ports prüfen
netstat -tulpn | grep :3000

# Docker Ports
docker port $(docker ps -q --filter name=hmwebapp)
```

## 📊 Log-Analyse

### **Fehler in Logs suchen:**

```bash
# ERROR Logs
docker-compose -f docker-compose.simple.yml logs | grep -i error

# WARNING Logs
docker-compose -f docker-compose.simple.yml logs | grep -i warning

# Build Fehler
docker-compose -f docker-compose.simple.yml logs | grep -i "build\|fail"
```

### **Performance-Logs:**

```bash
# Memory Usage
docker stats $(docker ps -q --filter name=hmwebapp)

# CPU Usage
docker stats --no-stream $(docker ps -q --filter name=hmwebapp)
```

## 🎯 Quick Commands

### **Häufig verwendete Befehle:**

```bash
# 1. Container Status
docker ps -a

# 2. Real-time Logs
docker-compose -f docker-compose.simple.yml logs -f

# 3. Application Logs
docker exec -it $(docker ps -q --filter name=hmwebapp) tail -f /app/.next/server.log

# 4. System Logs
journalctl -u docker.service -f

# 5. Alles auf einmal
docker-compose -f docker-compose.simple.yml logs && docker stats --no-stream
```
