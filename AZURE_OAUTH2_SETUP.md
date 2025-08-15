# Azure OAuth2 Setup für HeatManager - Korrigiert

## 🔧 **Das Problem gelöst!**

**NextAuth.js unterstützt keine GET-Requests für OAuth2-Callbacks.** Wir verwenden jetzt einen **einfacheren OAuth2-Flow**.

## 📋 **Schritt-für-Schritt Setup**

### **Schritt 1: Azure App-Registrierung**

1. **Gehen Sie zu [portal.azure.com](https://portal.azure.com)**
2. **Suchen Sie nach "App registrations"**
3. **Klicken Sie auf "New registration"**
4. **Füllen Sie aus:**
   - **Name**: `HeatManager Email Service`
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: `http://localhost:3000/api/email/oauth2-callback`
5. **Klicken Sie auf "Register"**

### **Schritt 2: API-Berechtigungen**

1. **Gehen Sie zu "API permissions"**
2. **Klicken Sie auf "Add a permission"**
3. **Wählen Sie "Microsoft Graph"**
4. **Wählen Sie "Delegated permissions"**
5. **Fügen Sie hinzu:**
   - ✅ `SMTP.Send`
   - ✅ `offline_access`
6. **Klicken Sie auf "Grant admin consent"**

### **Schritt 3: Client Secret**

1. **Gehen Sie zu "Certificates & secrets"**
2. **Klicken Sie auf "New client secret"**
3. **Beschreibung**: `HeatManager Email Secret`
4. **Ablauf**: "Never"
5. **Klicken Sie auf "Add"**
6. **Kopieren Sie den Secret-Wert**

### **Schritt 4: Umgebungsvariablen setzen**

**Fügen Sie diese Zeilen in Ihre `.env` Datei ein:**

```bash
# OAuth2 für Office365
OAUTH_TENANT_ID=ihre_verzeichnis_id_hier
OAUTH_CLIENT_ID=ihre_client_id_hier
OAUTH_CLIENT_SECRET=ihr_client_secret_hier
OAUTH_REDIRECT_URI=http://localhost:3000/api/email/oauth2-callback

# E-Mail-Einstellungen
SMTP_USER=ihre_email@ihre-domain.com
SMTP_FROM=ihre_email@ihre-domain.com
```

## 🚀 **Verwendung**

### **1. OAuth2-URL generieren**
1. **Gehen Sie zu `/admin/email-test`**
2. **Klicken Sie auf "OAuth2-URL generieren"**
3. **Die URL öffnet sich automatisch in einem neuen Tab**

### **2. App autorisieren**
1. **Melden Sie sich mit Ihrem Office365-Konto an**
2. **Autorisieren Sie die App**
3. **Sie werden zu `/api/email/oauth2-callback` weitergeleitet**
4. **Kopieren Sie den "code" Parameter**

### **3. Authorization Code verwenden**
1. **Fügen Sie den Code in Ihre `.env` Datei ein:**
   ```bash
   OAUTH_AUTHORIZATION_CODE=ihr_code_hier
   ```
2. **Starten Sie die Anwendung neu**
3. **Testen Sie die E-Mail-Funktionalität**

## ✅ **Überprüfung**

### **Umgebungsvariablen prüfen:**
```bash
GET /api/email/debug-env
```

### **OAuth2-Verbindung testen:**
```bash
GET /api/email/test-oauth2
```

### **E-Mail senden:**
```bash
POST /api/email/send-simple-oauth2
```

## 🔍 **Wichtige Unterschiede zur vorherigen Version:**

- **Redirect URI**: `http://localhost:3000/api/email/oauth2-callback` (nicht NextAuth.js)
- **Einfacher Flow**: Direkte Kommunikation mit Azure
- **Keine NextAuth.js-Abhängigkeit** für OAuth2
- **Automatische URL-Generierung** über die Test-Seite

## 🚨 **Wichtige Hinweise:**

- **Authorization Code läuft nach 10 Minuten ab**
- **Verwenden Sie den Code sofort nach dem Erhalt**
- **Nach der Verwendung wird er automatisch erneuert**
- **Starten Sie die App neu nach dem Setzen des Codes**

## 🆘 **Bei Problemen:**

1. **Überprüfen Sie alle Umgebungsvariablen**
2. **Stellen Sie sicher, dass die Redirect URI exakt übereinstimmt**
3. **Warten Sie nach Azure-Änderungen 5-10 Minuten**
4. **Verwenden Sie die Debug-APIs zur Fehlersuche**

Jetzt sollte OAuth2 funktionieren! 🎯✨
