# ThingsBoard Token Refresh System

## Übersicht

Das ThingsBoard Token Refresh System ist ein automatischer Service, der jede Minute prüft, ob ThingsBoard-Tokens für Kunden ablaufen und diese bei Bedarf erneuert.

## Funktionsweise

### 1. Automatische Token-Überwachung

- **Intervall**: Jede Minute
- **Prüfung**: Tokens, die in den nächsten 5 Minuten ablaufen
- **Erneuerung**: Automatische Token-Erneuerung über ThingsBoard API
- **Speicherung**: Aktualisierte Tokens werden in der Datenbank gespeichert

### 2. Individuelle ThingsBoard-URLs

Jeder Kunde kann eine eigene ThingsBoard-Instanz verwenden:

- `tb_url` in der `customer_settings` Tabelle
- Automatische Verwendung der kundenspezifischen URL für Token-Requests

### 3. Token-Lebensdauer

- **Standard**: 15 Minuten
- **Sicherheitspuffer**: 5 Minuten vor Ablauf wird erneuert
- **Automatische Verlängerung**: Bei jeder Erneuerung +15 Minuten

## Datenbank-Schema

```sql
SELECT customer_id, tb_username, tb_password, tb_url, tbtoken, tbtokenexpiry
FROM customer_settings
WHERE (tb_username IS NOT NULL and tb_username <> '' and tb_username <> ' ')
AND (tb_password IS NOT NULL and tb_password <> '' and tb_password <> ' ')
AND (tb_url IS NOT NULL and tb_url <> '' and tb_url <> ' ')
```

### Erforderliche Felder:

- `customer_id`: Eindeutige Kunden-ID
- `tb_username`: ThingsBoard Benutzername
- `tb_password`: ThingsBoard Passwort
- `tb_url`: ThingsBoard Server-URL
- `tbtoken`: Aktueller JWT-Token (wird automatisch gesetzt)
- `tbtokenexpiry`: Ablaufzeit des Tokens (wird automatisch gesetzt)

## API-Endpunkte

### 1. Status abrufen

```http
GET /api/cron/refresh-tokens
```

**Response:**

```json
{
  "success": true,
  "cron": {
    "running": true,
    "description": "ThingsBoard Token Refresh (runs every minute)"
  },
  "tokens": {
    "success": true,
    "customers": [...],
    "summary": {
      "total": 5,
      "valid": 3,
      "expiring_soon": 1,
      "expired": 1,
      "missing": 0
    }
  }
}
```

### 2. Cron-Job steuern

```http
POST /api/cron/refresh-tokens
Content-Type: application/json

{
  "action": "start|stop|refresh|status"
}
```

**Aktionen:**

- `start`: Cron-Job starten
- `stop`: Cron-Job stoppen
- `refresh`: Manueller Token-Refresh
- `status`: Status abrufen

## Admin-Interface

### Zugriff

```
/admin/token-refresh
```

### Funktionen:

- **Live-Status**: Aktueller Status des Cron-Jobs
- **Token-Übersicht**: Anzahl gültiger/abgelaufener Tokens
- **Manuelle Steuerung**: Start/Stop/Refresh Buttons
- **Detail-Tabelle**: Alle Kunden mit Token-Status

## Konfiguration

### Umgebungsvariablen

```env
# Datenbank
MSSQL_USER=your_db_user
MSSQL_PASSWORD=your_db_password
MSSQL_SERVER=your_db_server
MSSQL_DATABASE=your_db_name

# ThingsBoard (Fallback-URL)
THINGSBOARD_URL=https://your-thingsboard-instance.com
```

### Automatischer Start

Der Service startet automatisch beim Start der Next.js-Anwendung über:

```javascript
// pages/_app.js
if (typeof window === "undefined") {
  require("../lib/tokenRefreshInit");
}
```

## Fehlerbehandlung

### Häufige Fehler:

1. **Ungültige Credentials**: ThingsBoard Login fehlgeschlagen
2. **Netzwerk-Fehler**: ThingsBoard-Server nicht erreichbar
3. **Datenbank-Fehler**: Verbindung zur Datenbank fehlgeschlagen

### Logging:

- Erfolgreiche Token-Erneuerungen: `✅ Successfully updated token for customer {id}`
- Fehler: `❌ Failed to update token for customer {id}: {error}`
- Cron-Job Status: `⏰ [timestamp] Running scheduled token refresh...`

## Monitoring

### Logs überwachen:

```bash
# Next.js Logs
npm run dev

# Oder in Produktion
pm2 logs
```

### API-Status prüfen:

```bash
curl http://localhost:3000/api/cron/refresh-tokens
```

### Admin-Interface:

```
http://localhost:3000/admin/token-refresh
```

## Troubleshooting

### Token wird nicht erneuert:

1. Prüfen Sie die `customer_settings` Tabelle
2. Stellen Sie sicher, dass `tb_username`, `tb_password` und `tb_url` gesetzt sind
3. Testen Sie die ThingsBoard-Verbindung manuell
4. Prüfen Sie die Logs auf Fehlermeldungen

### Cron-Job läuft nicht:

1. Prüfen Sie, ob die Anwendung läuft
2. Stellen Sie sicher, dass `tokenRefreshInit.js` importiert wird
3. Prüfen Sie die Browser-Konsole auf Fehler

### Datenbank-Verbindung:

1. Prüfen Sie die Umgebungsvariablen
2. Testen Sie die Datenbankverbindung
3. Stellen Sie sicher, dass die `customer_settings` Tabelle existiert

## Sicherheit

### Best Practices:

- **HTTPS**: Verwenden Sie HTTPS für ThingsBoard-URLs
- **Starke Passwörter**: Sichere ThingsBoard-Credentials
- **Regelmäßige Rotation**: Passwörter regelmäßig ändern
- **Monitoring**: Überwachen Sie die Token-Erneuerungen

### Zugriffskontrolle:

- Admin-Interface nur für Admin-Benutzer
- API-Endpunkte sollten in Produktion geschützt werden
- Logs nicht in öffentlichen Repositories

## Erweiterungen

### Mögliche Verbesserungen:

1. **E-Mail-Benachrichtigungen**: Bei Token-Fehlern
2. **Webhook-Integration**: Externe Systeme benachrichtigen
3. **Metriken**: Prometheus/Grafana Integration
4. **Retry-Logic**: Automatische Wiederholung bei Fehlern
5. **Token-Rotation**: Automatische Passwort-Rotation
