# Reporting API Dokumentation

## Übersicht

Die Reporting API bietet Zugriff auf die PostgreSQL-Tabelle `hmreporting.device_10m` mit 10-Minuten-aggreggierten Gerätedaten.

## Authentifizierung

Die API verwendet einen Preshared Key für die Authentifizierung. Der Key kann auf drei Arten übergeben werden:

### 1. Authorization Header (empfohlen)
```bash
curl -H "Authorization: Bearer your-api-key" https://your-domain.com/api/reporting
```

### 2. X-API-Key Header
```bash
curl -H "X-API-Key: your-api-key" https://your-domain.com/api/reporting
```

### 3. Query Parameter
```bash
curl "https://your-domain.com/api/reporting?key=your-api-key"
```

## Konfiguration

Setzen Sie die Umgebungsvariable `REPORTING_PRESHARED_KEY` in Ihrer `.env.local` Datei:

```bash
REPORTING_PRESHARED_KEY=your-secure-api-key-here
```

## API Endpoints

### GET /api/reporting

Ruft Daten aus der `hmreporting.device_10m` Tabelle ab.

#### Query Parameter

| Parameter | Typ | Beschreibung | Standard | Beispiel |
|-----------|-----|--------------|----------|----------|
| `limit` | integer | Anzahl der Datensätze (1-1000) | 10 | `?limit=50` |
| `offset` | integer | Anzahl der zu überspringenden Datensätze | 0 | `?offset=100` |
| `entity_id` | UUID | Filter nach Entity ID | - | `?entity_id=00229de0-6473-11ef-8cd8-8b580d9aa086` |
| `start_date` | ISO Date | Start-Datum für Filterung | - | `?start_date=2025-09-15` |
| `end_date` | ISO Date | End-Datum für Filterung | - | `?end_date=2025-09-16` |

#### Beispiele

**Basis-Abfrage (10 neueste Datensätze):**
```bash
curl -H "Authorization: Bearer your-key" https://your-domain.com/api/reporting
```

**Mit Filterung nach Entity:**
```bash
curl -H "Authorization: Bearer your-key" "https://your-domain.com/api/reporting?entity_id=00229de0-6473-11ef-8cd8-8b580d9aa086&limit=50"
```

**Mit Datumsfilter:**
```bash
curl -H "Authorization: Bearer your-key" "https://your-domain.com/api/reporting?start_date=2025-09-15&end_date=2025-09-16&limit=100"
```

**Pagination:**
```bash
curl -H "Authorization: Bearer your-key" "https://your-domain.com/api/reporting?limit=50&offset=100"
```

## Antwortformat

### Erfolgreiche Antwort

```json
{
  "success": true,
  "metadata": {
    "total_records": 10,
    "limit": 10,
    "offset": 0,
    "has_more": false,
    "query_time": "2025-01-15T10:30:00.000Z"
  },
  "data": [
    {
      "entity_id": "00229de0-6473-11ef-8cd8-8b580d9aa086",
      "bucket_10m": "2025-09-15T18:30:00.000Z",
      "sensor_temperature": 26.06,
      "sensor_temperature_ts_ms": 1757961185791,
      "target_temperature": 22,
      "target_temperature_ts_ms": 1757961185791,
      "signal_quality": null,
      "signal_quality_ts_ms": null,
      "sf": null,
      "sf_ts_ms": null,
      "snr": 9.2,
      "snr_ts_ms": 1757961185791,
      "rssi": -63,
      "rssi_ts_ms": 1757961185791,
      "percent_valve_open": 0,
      "percent_valve_open_ts_ms": 1757961185791,
      "battery_voltage": 3.3,
      "battery_voltage_ts_ms": 1757961185791,
      "relative_humidity": 50.39,
      "relative_humidity_ts_ms": 1757961185791,
      "updated_at": "2025-10-15T18:30:12.964Z"
    }
  ]
}
```

### Fehlerantworten

#### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Ungültiger oder fehlender API-Key. Verwenden Sie Authorization: Bearer <key>, X-API-Key: <key> oder ?key=<key>"
}
```

#### 400 Bad Request
```json
{
  "error": "Bad Request",
  "message": "Ungültige Parameter",
  "details": ["Limit muss zwischen 1 und 1000 liegen"]
}
```

#### 404 Not Found
```json
{
  "error": "Table not found",
  "message": "Die Tabelle hmreporting.device_10m wurde nicht gefunden"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "Ein interner Fehler ist aufgetreten"
}
```

## Datenfelder

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `entity_id` | UUID | Eindeutige Geräte-ID |
| `bucket_10m` | Timestamp | 10-Minuten-Zeitbucket |
| `sensor_temperature` | Float | Sensortemperatur in °C |
| `sensor_temperature_ts_ms` | BigInt | Timestamp der Sensortemperatur |
| `target_temperature` | Integer | Zieltemperatur in °C |
| `target_temperature_ts_ms` | BigInt | Timestamp der Zieltemperatur |
| `signal_quality` | Float | Signalqualität |
| `signal_quality_ts_ms` | BigInt | Timestamp der Signalqualität |
| `sf` | Integer | Spreading Factor |
| `sf_ts_ms` | BigInt | Timestamp des Spreading Factor |
| `snr` | Float | Signal-to-Noise Ratio |
| `snr_ts_ms` | BigInt | Timestamp des SNR |
| `rssi` | Integer | Received Signal Strength Indicator |
| `rssi_ts_ms` | BigInt | Timestamp des RSSI |
| `percent_valve_open` | Integer | Ventilöffnung in Prozent |
| `percent_valve_open_ts_ms` | BigInt | Timestamp der Ventilöffnung |
| `battery_voltage` | Float | Batteriespannung in V |
| `battery_voltage_ts_ms` | BigInt | Timestamp der Batteriespannung |
| `relative_humidity` | Float | Relative Luftfeuchtigkeit in % |
| `relative_humidity_ts_ms` | BigInt | Timestamp der Luftfeuchtigkeit |
| `updated_at` | Timestamp | Letzte Aktualisierung |

## Rate Limiting

- Maximale Anzahl Datensätze pro Anfrage: 1000
- Standard-Limit: 10 Datensätze
- Empfohlenes Limit für große Abfragen: 100-500 Datensätze

## Sicherheit

- Alle Anfragen müssen authentifiziert werden
- API-Key sollte sicher gespeichert und regelmäßig rotiert werden
- HTTPS wird für alle Produktionsumgebungen empfohlen
- IP-Whitelisting kann auf Server-Ebene implementiert werden

## Fehlerbehandlung

Die API gibt detaillierte Fehlermeldungen zurück, um die Integration zu erleichtern:

- **401**: Authentifizierungsfehler
- **400**: Ungültige Parameter
- **404**: Tabelle nicht gefunden
- **405**: Methode nicht erlaubt
- **500**: Server-Fehler
- **503**: Datenbankverbindung fehlgeschlagen

## Beispiele für verschiedene Anwendungsfälle

### 1. Monitoring Dashboard
```bash
# Neueste 100 Datensätze für alle Geräte
curl -H "Authorization: Bearer your-key" "https://your-domain.com/api/reporting?limit=100"
```

### 2. Geräte-spezifische Analyse
```bash
# Alle Daten für ein bestimmtes Gerät
curl -H "Authorization: Bearer your-key" "https://your-domain.com/api/reporting?entity_id=00229de0-6473-11ef-8cd8-8b580d9aa086&limit=1000"
```

### 3. Zeitraum-Analyse
```bash
# Daten für einen bestimmten Tag
curl -H "Authorization: Bearer your-key" "https://your-domain.com/api/reporting?start_date=2025-09-15&end_date=2025-09-15&limit=1000"
```

### 4. Pagination für große Datensätze
```bash
# Erste Seite
curl -H "Authorization: Bearer your-key" "https://your-domain.com/api/reporting?limit=100&offset=0"

# Zweite Seite
curl -H "Authorization: Bearer your-key" "https://your-domain.com/api/reporting?limit=100&offset=100"
```
