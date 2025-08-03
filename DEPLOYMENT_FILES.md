# 🚀 HMWebApp Deployment Files

## 📋 Dateien für Docker-Deployment

### **Core Application Files**

```
├── pages/                    # Next.js Seiten und API-Routen
├── components/               # React Komponenten
├── contexts/                 # React Context Provider
├── lib/                      # Utility Funktionen und Hooks
├── styles/                   # CSS und Theme Dateien
├── public/                   # Statische Assets
├── package.json              # Dependencies und Scripts
├── package-lock.json         # Dependency Lock File
├── next.config.js            # Next.js Konfiguration
├── jsconfig.json             # JavaScript Path Aliases
├── server.js                 # Custom Next.js Server
├── middleware.js             # Next.js Middleware
```

### **Docker Files**

```
├── Dockerfile                # Multi-stage Production Build
├── Dockerfile.simple         # Einfacher Production Build
├── docker-compose.yml        # Full Docker Compose
├── docker-compose.simple.yml # Einfacher Docker Compose
├── docker-compose.dev.yml    # Development Docker Compose
├── Dockerfile.dev            # Development Dockerfile
├── .dockerignore             # Docker Ignore Rules
├── docker-build.sh           # Build Helper Script
├── DOCKER_README.md          # Docker Dokumentation
```

### **Deployment Scripts**

```
├── deploy.sh                 # Azure Deployment Script
├── deploy-azure.sh           # Azure App Service Script
├── startup.sh                # Azure Startup Script
├── install-service.sh         # Systemd Service Installer
├── uninstall-service.sh      # Systemd Service Uninstaller
├── hmwebapp.service          # Systemd Service Definition
```

### **Configuration Files**

```
├── .env.example              # Environment Variables Template
├── azure.yaml                # Azure App Service Config
├── vercel.json               # Vercel Deployment Config
├── web.config                # IIS Configuration
├── ecosystem.config.js       # PM2 Configuration
├── .deployment               # Azure Deployment Config
```

### **Documentation**

```
├── README.md                 # Projekt Dokumentation
├── docs/                     # Zusätzliche Dokumentation
├── examples/                 # Code Beispiele
```

## 🔧 Environment Variables (.env)

### **Required Environment Variables**

```bash
# Database Configuration
MSSQL_USER=your_db_user
MSSQL_PASSWORD=your_db_password
MSSQL_SERVER=your_db_server
MSSQL_DATABASE=your_db_name

# NextAuth Configuration
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your_nextauth_secret

# ThingsBoard Configuration
THINGSBOARD_URL=https://your-thingsboard.com
THINGSBOARD_USERNAME=your_tb_username
THINGSBOARD_PASSWORD=your_tb_password

# Email Configuration
EMAIL_SERVER_HOST=your_smtp_host
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your_email_user
EMAIL_SERVER_PASSWORD=your_email_password
EMAIL_FROM=noreply@your-domain.com
```

## 🐳 Docker Deployment

### **Option 1: Simple Docker Compose**

```bash
# Build und Start
docker-compose -f docker-compose.simple.yml up -d

# Logs anzeigen
docker-compose -f docker-compose.simple.yml logs -f

# Stoppen
docker-compose -f docker-compose.simple.yml down
```

### **Option 2: Full Docker Compose**

```bash
# Build und Start
docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# Stoppen
docker-compose down
```

### **Option 3: Development Mode**

```bash
# Build und Start mit Hot Reload
docker-compose -f docker-compose.dev.yml up -d

# Logs anzeigen
docker-compose -f docker-compose.dev.yml logs -f
```

## 🔄 Build Helper Script

```bash
# Build Script verwenden
./docker-build.sh prod    # Production Build
./docker-build.sh dev     # Development Build
./docker-build.sh logs    # Logs anzeigen
./docker-build.sh cleanup # Cleanup
```

## 📦 Deployment Checklist

### **Vor dem Deployment:**

- [ ] `.env` Datei mit korrekten Werten erstellen
- [ ] Datenbank-Verbindung testen
- [ ] ThingsBoard-Verbindung testen
- [ ] Email-Konfiguration testen

### **Docker Build:**

- [ ] `docker-compose.simple.yml` verwenden für Production
- [ ] Environment Variables in `.env` setzen
- [ ] Build mit `docker-compose -f docker-compose.simple.yml up -d`
- [ ] Health Check überprüfen

### **Systemd Service (Optional):**

- [ ] `install-service.sh` ausführen
- [ ] Service Status überprüfen: `systemctl status hmwebapp`
- [ ] Logs anzeigen: `journalctl -u hmwebapp -f`

## 🚨 Wichtige Hinweise

### **Security:**

- Niemals `.env` Dateien in Git committen
- Sichere Passwörter verwenden
- HTTPS für Production verwenden

### **Performance:**

- Docker Images werden automatisch optimiert
- Multi-stage builds reduzieren Image-Größe
- Health Checks überwachen Application Status

### **Monitoring:**

- Docker Logs überwachen
- Health Check Endpoint: `/api/hello`
- Application Logs in Container

## 📞 Support

Bei Problemen:

1. Docker Logs überprüfen
2. Health Check Endpoint testen
3. Environment Variables validieren
4. Network Connectivity testen
