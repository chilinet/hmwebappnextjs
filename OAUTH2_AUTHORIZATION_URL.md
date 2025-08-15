# OAuth2 Authorization URL für Office365

## URL-Template

Ersetzen Sie die Platzhalter in der folgenden URL:

```
https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize?
client_id={CLIENT_ID}&
response_type=code&
redirect_uri={REDIRECT_URI}&
scope=https://outlook.office.com/SMTP.Send offline_access
```

## Platzhalter

- `{TENANT_ID}` = Ihre Verzeichnis-ID (Mandant) aus Azure
- `{CLIENT_ID}` = Ihre Client-ID aus der App-Registrierung
- `{REDIRECT_URI}` = `http://localhost:3000/api/auth/callback/azure`

## Beispiel

```
https://login.microsoftonline.com/12345678-1234-1234-1234-123456789012/oauth2/v2.0/authorize?
client_id=87654321-4321-4321-4321-210987654321&
response_type=code&
redirect_uri=http://localhost:3000/api/auth/callback/azure&
scope=https://outlook.office.com/SMTP.Send offline_access
```

## Schritte

1. **URL öffnen** in einem Browser
2. **Anmelden** mit Ihrem Office365-Konto
3. **App autorisieren** (Zustimmung geben)
4. **Code kopieren** aus der Weiterleitungs-URL
5. **Code in .env-Datei** eintragen als `OAUTH_AUTHORIZATION_CODE`

## Wichtige Hinweise

- Der Authorization Code ist nur **einmal gültig**
- Nach der Verwendung wird er automatisch erneuert
- Der Code läuft nach **10 Minuten** ab
- Verwenden Sie den Code sofort nach dem Erhalt
