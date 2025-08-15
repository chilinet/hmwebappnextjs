# E-Mail API Tests für HeatManager

## 📋 **Übersicht**

Diese Test-Skripte ermöglichen es Ihnen, alle E-Mail-APIs von HeatManager zu testen, ohne die Web-Oberfläche zu verwenden.

## 🚀 **Schnellstart**

### **Option 1: Einfacher Test (Empfohlen)**

```bash
# 1. Session Token setzen
# Öffnen Sie simple-email-test.js und setzen Sie SESSION_TOKEN

# 2. Test ausführen
node simple-email-test.js
```

### **Option 2: Vollständiger Test**

```bash
# 1. Abhängigkeiten installieren
npm install node-fetch

# 2. Session Token setzen
# Öffnen Sie test-email-api.js und setzen Sie SESSION_TOKEN

# 3. Test ausführen
node test-email-api.js
```

## 🔑 **Session Token erhalten**

### **Methode 1: Browser Developer Tools**

1. **Gehen Sie zu `/admin/email-test`**
2. **Öffnen Sie die Developer Tools (F12)**
3. **Gehen Sie zu "Application" → "Cookies"**
4. **Suchen Sie nach `next-auth.session-token`**
5. **Kopieren Sie den Wert**

### **Methode 2: Browser Console**

```javascript
// In der Browser-Konsole ausführen
document.cookie.split(';').find(c => c.trim().startsWith('next-auth.session-token=')).split('=')[1]
```

### **Methode 3: Network Tab**

1. **Öffnen Sie die Developer Tools (F12)**
2. **Gehen Sie zu "Network"**
3. **Laden Sie die Seite neu**
4. **Suchen Sie nach einem Request**
5. **Kopieren Sie den Cookie-Wert**

## 📝 **Konfiguration**

### **Session Token setzen**

**In `simple-email-test.js`:**
```javascript
const SESSION_TOKEN = 'ihr_echter_session_token_hier';
```

**In `test-email-api.js`:**
```javascript
const SESSION_TOKEN = 'ihr_echter_session_token_hier';
```

### **E-Mail-Adresse ändern**

**In beiden Dateien:**
```javascript
const testEmail = {
  to: 'ihre_echte_email@ihre-domain.com', // Hier ändern
  subject: 'Test E-Mail - HeatManager',
  text: 'Dies ist eine Test-E-Mail von HeatManager.',
  html: '<h1>Test E-Mail</h1><p>Dies ist eine <strong>Test-E-Mail</strong> von HeatManager.</p>'
};
```

## 🧪 **Verfügbare Tests**

### **1. OAuth2 Helper**
- **Endpoint**: `/api/email/send-oauth2`
- **Beschreibung**: Verwendet den verbesserten OAuth2-Helper
- **Anforderungen**: Alle OAuth2-Umgebungsvariablen gesetzt

### **2. Simple OAuth2**
- **Endpoint**: `/api/email/send-simple-oauth2`
- **Beschreibung**: Neue einfache OAuth2-API
- **Anforderungen**: Alle OAuth2-Umgebungsvariablen gesetzt

### **3. App Password**
- **Endpoint**: `/api/email/send-app-password`
- **Beschreibung**: Einfache SMTP-Authentifizierung
- **Anforderungen**: `SMTP_USER` und `SMTP_PASS` gesetzt

## 📊 **Test-Ergebnisse interpretieren**

### **Erfolgreicher Test:**
```json
{
  "success": true,
  "status": 200,
  "data": {
    "success": true,
    "message": "Email sent successfully",
    "messageId": "abc123...",
    "method": "App Password"
  }
}
```

### **Fehlgeschlagener Test:**
```json
{
  "success": false,
  "status": 400,
  "data": {
    "error": "Missing OAuth2 environment variables",
    "missing": ["OAUTH_TENANT_ID", "OAUTH_CLIENT_ID"]
  }
}
```

## 🔧 **Fehlerbehebung**

### **Fehler: "Session Token fehlt"**
- Überprüfen Sie, ob Sie eingeloggt sind
- Kopieren Sie den Token aus den Browser-Cookies
- Stellen Sie sicher, dass der Token gültig ist

### **Fehler: "Unauthorized"**
- Session Token ist abgelaufen
- Loggen Sie sich neu ein
- Kopieren Sie den neuen Token

### **Fehler: "Missing environment variables"**
- Überprüfen Sie Ihre `.env` Datei
- Stellen Sie sicher, dass alle erforderlichen Variablen gesetzt sind
- Starten Sie die Anwendung neu nach Änderungen

### **Fehler: "OAuth2 token request failed"**
- Authorization Code ist abgelaufen
- Holen Sie einen neuen Authorization Code
- Aktualisieren Sie `OAUTH_AUTHORIZATION_CODE` in `.env`

## 📱 **Alternative: cURL-Tests**

### **OAuth2-Test:**
```bash
curl -X POST http://localhost:3000/api/email/send-simple-oauth2 \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=ihr_token" \
  -d '{
    "to": "test@example.com",
    "subject": "Test E-Mail",
    "text": "Dies ist eine Test-E-Mail"
  }'
```

### **App Password-Test:**
```bash
curl -X POST http://localhost:3000/api/email/send-app-password \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=ihr_token" \
  -d '{
    "to": "test@example.com",
    "subject": "Test E-Mail",
    "text": "Dies ist eine Test-E-Mail"
  }'
```

## 🎯 **Empfehlungen**

1. **Starten Sie mit App Password** - einfacher zu konfigurieren
2. **Testen Sie OAuth2** nur nach vollständiger Konfiguration
3. **Verwenden Sie echte E-Mail-Adressen** für Tests
4. **Überprüfen Sie die Server-Logs** bei Problemen
5. **Testen Sie regelmäßig** nach Konfigurationsänderungen

## 📞 **Support**

Bei Problemen:
1. Überprüfen Sie die Server-Logs
2. Testen Sie die Verbindung über die Web-Oberfläche
3. Überprüfen Sie alle Umgebungsvariablen
4. Stellen Sie sicher, dass die Anwendung läuft

**Viel Erfolg beim Testen!** 🚀✨
