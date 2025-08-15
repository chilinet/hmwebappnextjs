# OAuth2 Fehlerbehebung für Office365

## Häufige Fehler und Lösungen

### 1. Fehler: `AADSTS9002313: Invalid request. Request is malformed or invalid`

**Ursache:** Der Authorization Code ist abgelaufen oder ungültig.

**Lösung:** Einen neuen Authorization Code holen:

1. **Gehen Sie zu Ihrer Azure App-Registrierung**
2. **Kopieren Sie diese URL und ersetzen Sie die Platzhalter:**
   ```
   https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize?
   client_id={CLIENT_ID}&
   response_type=code&
   redirect_uri={REDIRECT_URI}&
   scope=https://outlook.office.com/SMTP.Send offline_access
   ```

3. **Öffnen Sie die URL in einem Browser**
4. **Melden Sie sich an und autorisieren Sie die App**
5. **Kopieren Sie den `code` Parameter aus der Weiterleitungs-URL**
6. **Aktualisieren Sie Ihre `.env` Datei:**
   ```bash
   OAUTH_AUTHORIZATION_CODE=ihr_neuer_code_hier
   ```

### 2. Fehler: `AADSTS70008: The provided authorization code has expired`

**Ursache:** Authorization Codes laufen nach 10 Minuten ab.

**Lösung:** Siehe Lösung 1 - neuen Code holen.

### 3. Fehler: `AADSTS50011: The reply URL specified in the request does not match the reply URLs configured for the application`

**Ursache:** Die Redirect URI stimmt nicht überein.

**Lösung:**
1. **Überprüfen Sie die Redirect URI in Azure:**
   - Gehen Sie zu Ihrer App-Registrierung
   - Klicken Sie auf "Authentication"
   - Stellen Sie sicher, dass `http://localhost:3000/api/auth/callback/azure` hinzugefügt ist

2. **Überprüfen Sie Ihre `.env` Datei:**
   ```bash
   OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback/azure
   ```

### 4. Fehler: `AADSTS65001: The user or administrator has not consented to use the application`

**Ursache:** Die App wurde nicht autorisiert.

**Lösung:**
1. **Gehen Sie zu Ihrer App-Registrierung in Azure**
2. **Klicken Sie auf "API permissions"**
3. **Klicken Sie auf "Grant admin consent"**
4. **Bestätigen Sie die Berechtigungen**

### 5. Fehler: `AADSTS50020: User account from a different tenant than the current context`

**Ursache:** Sie verwenden ein Konto aus einem anderen Tenant.

**Lösung:**
1. **Stellen Sie sicher, dass Sie sich mit dem richtigen Konto anmelden**
2. **Überprüfen Sie die TENANT_ID in Ihrer `.env` Datei**

## Schnelltest

### 1. Verbindung testen
```bash
GET /api/email/test-oauth2
```

### 2. Einfache E-Mail senden
```bash
POST /api/email/send-simple-oauth2
{
  "to": "test@example.com",
  "subject": "Test",
  "text": "Test E-Mail"
}
```

### 3. Test-Seite aufrufen
```
/admin/email-test
```

## Debugging

### 1. Umgebungsvariablen prüfen
```bash
echo "OAUTH_TENANT_ID: $OAUTH_TENANT_ID"
echo "OAUTH_CLIENT_ID: $OAUTH_CLIENT_ID"
echo "OAUTH_CLIENT_SECRET: $OAUTH_CLIENT_SECRET"
echo "OAUTH_AUTHORIZATION_CODE: $OAUTH_AUTHORIZATION_CODE"
echo "OAUTH_REDIRECT_URI: $OAUTH_REDIRECT_URI"
echo "SMTP_USER: $SMTP_USER"
```

### 2. Azure App-Registrierung prüfen
- [ ] App ist registriert
- [ ] Redirect URI ist korrekt
- [ ] API permissions sind gesetzt
- [ ] Admin consent ist erteilt
- [ ] Client Secret ist gültig

### 3. Authorization Code URL testen
1. **URL in Browser öffnen**
2. **Anmeldung sollte funktionieren**
3. **App-Autorisierung sollte funktionieren**
4. **Code sollte in der URL erscheinen**

## Alternative: App Password verwenden

Falls OAuth2 weiterhin Probleme macht, können Sie auf App Password umstellen:

1. **Gehen Sie zu [account.microsoft.com/security](https://account.microsoft.com/security)**
2. **Erstellen Sie ein App Password**
3. **Setzen Sie diese Umgebungsvariablen:**
   ```bash
   SMTP_USER=ihre_email@ihre-domain.com
   SMTP_PASS=ihr_app_password
   SMTP_FROM=ihre_email@ihre-domain.com
   ```

4. **Verwenden Sie die einfache SMTP-API:**
   ```bash
   POST /api/email/send-simple-smtp
   ```

## Support

Bei weiteren Problemen:
1. **Überprüfen Sie die Server-Logs**
2. **Testen Sie die Verbindung mit der Test-API**
3. **Vergleichen Sie Ihre Konfiguration mit der Dokumentation**
4. **Stellen Sie sicher, dass alle Umgebungsvariablen gesetzt sind**
