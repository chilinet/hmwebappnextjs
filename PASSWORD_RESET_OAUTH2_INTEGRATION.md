# Passwort-Reset mit OAuth2-Integration

## 🔐 **Übersicht**

Die "Passwort vergessen" Funktionalität wurde erfolgreich an die neue OAuth2 E-Mail-API angepasst. Jetzt verwendet sie die robuste OAuth2-Implementierung mit automatischer Token-Erneuerung.

## 🚀 **Neue Features**

### **1. Dedizierte Passwort-Reset-API**
- **Endpoint**: `/api/email/send-password-reset`
- **Keine Session-Authentifizierung erforderlich**
- **Automatische OAuth2-Token-Verwaltung**
- **Robuste Fehlerbehandlung**

### **2. Verbesserte E-Mail-API**
- **Endpoint**: `/api/auth/forgot-password`
- **Verwendet die neue OAuth2-API**
- **Bessere Fehlerbehandlung**
- **Detaillierte Logging**

### **3. Test-Funktionalität**
- **Endpoint**: `/api/email/test-password-reset`
- **Test der Passwort-Reset-E-Mails**
- **Integration in die E-Mail-Test-Seite**

## 🔧 **Technische Implementierung**

### **API-Struktur:**

```
/api/auth/forgot-password          # Haupt-API für Passwort-Reset
/api/email/send-password-reset     # Dedizierte E-Mail-API
/api/email/test-password-reset     # Test-API
```

### **Datenfluss:**

1. **Benutzer fordert Passwort-Reset an**
2. **Token wird in Datenbank gespeichert**
3. **E-Mail wird über OAuth2-API gesendet**
4. **Benutzer erhält E-Mail mit Reset-Link**

## 📧 **E-Mail-Template**

### **HTML-E-Mail mit:**
- **Professionelles Design**
- **Responsive Layout**
- **Klickbarer Button**
- **Fallback-Link**
- **Branding (HeatManager)**

### **E-Mail-Inhalt:**
- **Betreff**: "HeatManager - Passwort zurücksetzen"
- **Gültigkeit**: 24 Stunden
- **Sicherheit**: Einmaliger Token
- **Design**: Modern und benutzerfreundlich

## 🧪 **Testen der Funktionalität**

### **Option 1: Über die E-Mail-Test-Seite**
1. **Gehen Sie zu `/admin/email-test`**
2. **Geben Sie eine E-Mail-Adresse ein**
3. **Klicken Sie auf "Passwort-Reset Test"**
4. **Überprüfen Sie den Posteingang**

### **Option 2: Direkter API-Test**
```bash
curl -X POST http://localhost:3000/api/email/test-password-reset \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

### **Option 3: Vollständiger Passwort-Reset-Test**
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

## 🔑 **OAuth2-Konfiguration**

### **Erforderliche Umgebungsvariablen:**
```bash
# OAuth2-Konfiguration
OAUTH_TENANT_ID=your_tenant_id
OAUTH_CLIENT_ID=your_client_id
OAUTH_CLIENT_SECRET=your_client_secret
OAUTH_REFRESH_TOKEN=your_refresh_token

# SMTP-Konfiguration
SMTP_USER=your_email@domain.com
SMTP_FROM=your_email@domain.com
```

### **Optionale Variablen:**
```bash
# Für erste Authentifizierung (falls kein Refresh Token vorhanden)
OAUTH_AUTHORIZATION_CODE=your_auth_code
OAUTH_REDIRECT_URI=http://localhost:3000/api/email/oauth2-callback
```

## 📋 **Implementierungsdetails**

### **1. Token-Generierung**
- **Länge**: 32 Bytes (64 Hex-Zeichen)
- **Gültigkeit**: 24 Stunden
- **Speicherung**: Datenbank (hm_users.resetToken)

### **2. Sicherheitsmaßnahmen**
- **Keine Information über existierende E-Mails**
- **Einmalige Token**
- **Zeitlich begrenzte Gültigkeit**
- **Sichere Token-Generierung**

### **3. Fehlerbehandlung**
- **Detaillierte Logging**
- **Benutzerfreundliche Fehlermeldungen**
- **Fallback-Mechanismen**
- **Robuste Validierung**

## 🚨 **Fehlerbehebung**

### **Häufige Probleme:**

#### **1. OAuth2-Token abgelaufen**
```bash
# Lösung: Neuen Authorization Code holen
# Gehen Sie zu /admin/email-test
# Klicken Sie auf "OAuth2-URL generieren"
```

#### **2. E-Mail wird nicht gesendet**
```bash
# Überprüfen Sie die Server-Logs
# Testen Sie die OAuth2-Verbindung
# Prüfen Sie die Umgebungsvariablen
```

#### **3. Datenbankfehler**
```bash
# Überprüfen Sie die Datenbankverbindung
# Prüfen Sie die Tabellenstruktur
# Validieren Sie die SQL-Abfragen
```

## 📊 **Monitoring und Logging**

### **Server-Logs überwachen:**
```bash
# Passwort-Reset-Anfragen
# E-Mail-Versand-Status
# OAuth2-Token-Verwaltung
# Fehler und Ausnahmen
```

### **Datenbank-Monitoring:**
```sql
-- Überprüfen der Reset-Token
SELECT userid, email, resetToken, resetTokenExpiry 
FROM hm_users 
WHERE resetToken IS NOT NULL;

-- Bereinigung abgelaufener Token
DELETE FROM hm_users 
WHERE resetTokenExpiry < GETDATE();
```

## 🔄 **Wartung und Updates**

### **Regelmäßige Aufgaben:**
1. **OAuth2-Token erneuern** (alle 90 Tage)
2. **Abgelaufene Reset-Token bereinigen**
3. **E-Mail-Templates aktualisieren**
4. **Sicherheitsüberprüfungen durchführen**

### **Updates und Verbesserungen:**
- **Neue E-Mail-Templates**
- **Erweiterte Sicherheitsfunktionen**
- **Bessere Benutzerführung**
- **Performance-Optimierungen**

## 🎯 **Zusammenfassung**

### **Was wurde implementiert:**
✅ **Dedizierte Passwort-Reset-API**
✅ **OAuth2-Integration ohne Session-Auth**
✅ **Robuste Fehlerbehandlung**
✅ **Test-Funktionalität**
✅ **Professionelle E-Mail-Templates**
✅ **Automatische Token-Verwaltung**

### **Vorteile der neuen Implementierung:**
🚀 **Bessere Performance**
🔒 **Erhöhte Sicherheit**
📧 **Zuverlässiger E-Mail-Versand**
🛠️ **Einfachere Wartung**
🧪 **Umfassende Testmöglichkeiten**

## 📞 **Support und Hilfe**

### **Bei Problemen:**
1. **Überprüfen Sie die Server-Logs**
2. **Testen Sie die OAuth2-Verbindung**
3. **Prüfen Sie die Umgebungsvariablen**
4. **Kontaktieren Sie den Support**

### **Nützliche Links:**
- **E-Mail-Test-Seite**: `/admin/email-test`
- **OAuth2-Dokumentation**: `OAUTH2_REFRESH_TOKEN_SETUP.md`
- **90-Tage-Erneuerung**: `OAUTH2_90_DAYS_RENEWAL.md`

**Die Passwort-Reset-Funktionalität ist jetzt vollständig in die OAuth2-Infrastruktur integriert!** 🔐✨
