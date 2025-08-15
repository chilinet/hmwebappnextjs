# Office365 SMTP Setup für HeatManager

## Übersicht
Diese Anleitung erklärt, wie Sie Office365 für den E-Mail-Versand in HeatManager konfigurieren.

## Option 1: App Password (Empfohlen - Einfacher)

### Schritt 1: App Password erstellen
1. Gehen Sie zu [account.microsoft.com/security](https://account.microsoft.com/security)
2. Melden Sie sich mit Ihrem Office365-Konto an
3. Wählen Sie "Sicherheit" → "Erweiterte Sicherheitsoptionen"
4. Klicken Sie auf "App-Passwörter erstellen"
5. **Name**: `HeatManager Email Service`
6. Klicken Sie auf "Weiter"
7. **Kopieren Sie das generierte Passwort** (wird nur einmal angezeigt!)

### Schritt 2: .env-Datei konfigurieren
```bash
# E-Mail-Einstellungen
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=ihre_email@ihre-domain.com
SMTP_PASS=ihr_app_password_hier
SMTP_FROM=ihre_email@ihre-domain.com
```

### Schritt 3: Testen
- Starten Sie die Anwendung neu
- Testen Sie die "Passwort vergessen" Funktion
- Die E-Mail sollte erfolgreich versendet werden

## Option 2: OAuth2 (Erweitert - Komplexer)

### Schritt 1: Azure App Registration
1. Gehen Sie zu [portal.azure.com](https://portal.azure.com)
2. Suchen Sie nach "App registrations"
3. Klicken Sie auf "New registration"
4. **Name**: `HeatManager Email Service`
5. **Supported account types**: `Accounts in this organizational directory only`
6. **Redirect URI**: `http://localhost:3000/api/auth/callback/azure` (für Entwicklung)
7. Klicken Sie auf "Register"

### Schritt 2: API-Berechtigungen
1. Gehen Sie zu "API permissions"
2. Klicken Sie auf "Add a permission"
3. Wählen Sie "Microsoft Graph"
4. Wählen Sie "Delegated permissions" (nicht Application permissions!)
5. Fügen Sie hinzu:
   - ✅ `SMTP.Send`
   - ✅ `offline_access`
6. Klicken Sie auf "Grant admin consent"

### Schritt 3: Client Secret
1. Gehen Sie zu "Certificates & secrets"
2. Klicken Sie auf "New client secret"
3. **Description**: `HeatManager Email Secret`
4. **Expires**: "Never"
5. Klicken Sie auf "Add"
6. **Kopieren Sie den Secret-Wert**

### Schritt 4: Authorization Code erhalten
1. Öffnen Sie einen Browser und navigieren Sie zu:
   ```
   https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize?
   client_id={CLIENT_ID}&
   response_type=code&
   redirect_uri={REDIRECT_URI}&
   scope=https://outlook.office365.com/SMTP.Send offline_access
   ```
2. Ersetzen Sie:
   - `{TENANT_ID}` mit Ihrer Verzeichnis-ID
   - `{CLIENT_ID}` mit Ihrer Client-ID
   - `{REDIRECT_URI}` mit `http://localhost:3000/api/auth/callback/azure`
3. Melden Sie sich an und autorisieren Sie die App
4. **Kopieren Sie den `code` Parameter aus der URL**

### Schritt 5: .env-Datei konfigurieren
```bash
# OAuth2 für Office365
OAUTH_TENANT_ID=ihre_verzeichnis_id
OAUTH_CLIENT_ID=ihre_client_id
OAUTH_CLIENT_SECRET=ihr_client_secret
OAUTH_AUTHORIZATION_CODE=ihr_authorization_code
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback/azure

# E-Mail-Einstellungen
SMTP_USER=ihre_email@ihre-domain.com
SMTP_FROM=ihre_email@ihre-domain.com
```

### Schritt 6: Testen der OAuth2-Verbindung
1. Gehen Sie zu `/admin/email-test`
2. Klicken Sie auf "Verbindung testen"
3. Überprüfen Sie die Ergebnisse
4. Testen Sie das Senden einer E-Mail

## Empfehlung

**Verwenden Sie Option 1 (App Password)**, da sie:
- ✅ Einfacher zu konfigurieren ist
- ✅ Weniger fehleranfällig ist
- ✅ Weniger Berechtigungen benötigt
- ✅ Sofort funktioniert

**Option 2 (OAuth2)** ist nur empfehlenswert, wenn:
- Sie strenge Sicherheitsrichtlinien haben
- App Passwords nicht erlaubt sind
- Sie erweiterte E-Mail-Funktionen benötigen

## Fehlerbehebung

### Häufige Probleme:
1. **"Authentication unsuccessful"**: Überprüfen Sie App Password
2. **"Connection timeout"**: Überprüfen Sie Firewall-Einstellungen
3. **"Invalid credentials"**: Überprüfen Sie Benutzername/Passwort

### Support:
Bei Problemen überprüfen Sie:
- Office365-Konto-Status
- App Password-Gültigkeit
- Firewall-Einstellungen
- Netzwerkverbindung
