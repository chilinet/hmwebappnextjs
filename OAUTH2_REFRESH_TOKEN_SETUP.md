# OAuth2 Refresh Token Setup für HeatManager

## 🔍 **Das Problem gelöst!**

**Warum musste der Authorization Code jedes Mal neu gesetzt werden?**

### **Das war der Fehler:**
- ❌ **Simple OAuth2 API** verwendete immer den abgelaufenen Authorization Code
- ❌ **Kein Refresh Token** wurde verwendet
- ❌ **Bei jedem Aufruf** wurde ein neuer Token geholt
- ❌ **Authorization Code** läuft nach 10 Minuten ab

### **Die Lösung:**
- ✅ **Refresh Token verwenden** für neue Access Tokens
- ✅ **Authorization Code nur einmal** für die erste Authentifizierung
- ✅ **Automatische Token-Erneuerung** ohne manuelle Eingriffe

## 🚀 **Schritt-für-Schritt Setup**

### **Schritt 1: Ersten Authorization Code holen**

1. **Gehen Sie zu `/admin/email-test`**
2. **Klicken Sie auf "OAuth2-URL generieren"**
3. **URL öffnet sich in einem neuen Tab**
4. **Melden Sie sich an und autorisieren Sie die App**
5. **Kopieren Sie den "code" Parameter**

### **Schritt 2: Erste Authentifizierung**

1. **Setzen Sie den Authorization Code in `.env`:**
   ```bash
   OAUTH_AUTHORIZATION_CODE=ihr_erster_code_hier
   ```

2. **Starten Sie die App neu:**
   ```bash
   npm run dev
   ```

3. **Senden Sie eine Test-E-Mail:**
   ```bash
   node test-simple-oauth2-only.js
   ```

4. **Refresh Token beschaffen** (eine der folgenden Methoden):

   **A) Server-Log** (nur wenn beim ersten Code-Exchange **noch kein** `OAUTH_REFRESH_TOKEN` in `.env` steht):
   ```
   Refresh token received - you can now add OAUTH_REFRESH_TOKEN to your .env file
   Refresh token: eyJhbGciOiJIUzUxMiJ9...
   ```
   Wenn dort **nichts** erscheint, liegt das meist an:
   - `OAUTH_REFRESH_TOKEN` ist **bereits gesetzt** → die App loggt den Wert absichtlich nicht erneut.
   - Es wird **nur** der Refresh-Grant genutzt → Microsoft liefert oft **keinen** neuen Refresh-Token im Body (dann keine „Refresh token received“-Zeile).
   - Der Authorization Code ist **abgelaufen** (ca. 10 Minuten) oder `OAUTH_REDIRECT_URI` stimmt nicht mit Azure überein.

   **B) JSON ohne E-Mail (empfohlen):** Als angemeldeter Benutzer `POST /api/email/exchange-auth-code` aufrufen (z. B. aus dem Admin-Bereich oder mit curl + Session-Cookie). Die Antwort enthält **`refresh_token`** im Body – kein Suchen in Logs.

   **C) Entwicklung:** Beim erfolgreichen Aufruf von `POST /api/email/send-simple-oauth2` liefert die Antwort in **development** (oder wenn `OAUTH_EXPOSE_REFRESH_TOKEN=true`) das Feld **`newRefreshToken`**, sofern Microsoft einen Refresh-Token zurückgibt und noch keiner in `.env` steht.

### **Schritt 3: Refresh Token speichern**

1. **Kopieren Sie den Refresh Token** aus der API-Antwort (B/C) oder aus den Server-Logs (A)
2. **Fügen Sie ihn in `.env` hinzu:**
   ```bash
   OAUTH_REFRESH_TOKEN=ihr_refresh_token_hier
   ```

3. **Entfernen Sie den Authorization Code** (wird nicht mehr benötigt):
   ```bash
   # OAUTH_AUTHORIZATION_CODE=...  # Diese Zeile entfernen
   ```

### **Schritt 4: App neu starten**

```bash
npm run dev
```

### **Schritt 5: Testen**

```bash
node test-simple-oauth2-only.js
```

**Jetzt sollte Simple OAuth2 funktionieren, ohne dass Sie den Authorization Code erneuern müssen!** 🎉

## 🔄 **Wie funktioniert es jetzt?**

### **Erste Authentifizierung:**
```
Authorization Code → Access Token + Refresh Token
```

### **Bei Token-Ablauf:**
```
Refresh Token → Neuer Access Token
```

### **Bei jedem E-Mail-Versand:**
```
Refresh Token → Neuer Access Token → E-Mail senden
```

## 📋 **Vollständige .env Konfiguration**

```bash
# OAuth2 für Office365
OAUTH_TENANT_ID=ihre_verzeichnis_id
OAUTH_CLIENT_ID=ihre_client_id
OAUTH_CLIENT_SECRET=ihr_client_secret
OAUTH_REFRESH_TOKEN=ihr_refresh_token_hier
OAUTH_REDIRECT_URI=http://localhost:3000/api/email/oauth2-callback

# E-Mail-Einstellungen
SMTP_USER=sluther@chilinet.solutions
SMTP_FROM=sluther@chilinet.solutions

# Authorization Code wird nicht mehr benötigt
# OAUTH_AUTHORIZATION_CODE=...
```

## ✅ **Vorteile der neuen Lösung:**

- ✅ **Kein manueller Code-Update** mehr nötig
- ✅ **Automatische Token-Erneuerung**
- ✅ **Langlebige Authentifizierung**
- ✅ **Weniger Wartungsaufwand**
- ✅ **Professioneller OAuth2-Flow**

## 🚨 **Wichtige Hinweise:**

### **Refresh Token läuft ab:**
- **Gültigkeitsdauer**: Normalerweise **90 Tage**
- **Bei Ablauf**: Neuen Authorization Code holen
- **Neuen Refresh Token**: Speichern und verwenden

### **Sicherheit:**
- **Refresh Token schützen**: Nicht teilen oder in Code einbetten
- **Regelmäßig erneuern**: Alle 90 Tage
- **Bei Verdacht**: Sofort neu generieren

## 🧪 **Testen:**

### **Nach dem Setup:**
```bash
node test-simple-oauth2-only.js
```

### **Erwartete Ausgabe:**
```
✅ Simple OAuth2 erfolgreich!
📨 Message ID: <message-id>
🔧 Methode: OAuth2
📊 Status: 200
```

## 🎯 **Zusammenfassung:**

1. **Ersten Authorization Code holen** (einmalig)
2. **Refresh Token aus den Logs kopieren**
3. **Refresh Token in .env speichern**
4. **Authorization Code entfernen**
5. **App neu starten**
6. **E-Mails funktionieren automatisch**

**Jetzt haben Sie einen professionellen OAuth2-Flow!** 🚀✨
