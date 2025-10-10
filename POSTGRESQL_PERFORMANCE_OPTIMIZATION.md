# PostgreSQL Performance Optimization

## Übersicht

Die Dashboard-Seite wurde von der ThingsBoard API auf direkten PostgreSQL-Zugriff umgestellt, um die Performance zu verbessern. Die folgenden Sensordaten werden jetzt direkt aus der PostgreSQL-Datenbank gelesen:

- **sensorTemperature** - Aktuelle Temperatur
- **targetTemperature** - Zieltemperatur  
- **PercentValveOpen** - Ventilposition

## Neue APIs

### 1. `/api/telemetry/device-sensors`

**Zweck:** Abrufen der neuesten Sensordaten für mehrere Geräte

**Parameter:**
- `deviceIds` (required): Komma-getrennte Liste von Geräte-IDs
- `keys` (required): Komma-getrennte Liste von Sensor-Schlüsseln

**Beispiel:**
```
GET /api/telemetry/device-sensors?deviceIds=device1,device2&keys=sensorTemperature,targetTemperature,PercentValveOpen
```

**Antwort:**
```json
{
  "success": true,
  "device_count": 2,
  "requested_keys": ["sensorTemperature", "targetTemperature", "PercentValveOpen"],
  "data": {
    "device1": {
      "sensorTemperature": {
        "value": 22.5,
        "value_type": "double",
        "timestamp": 1703123456789,
        "timestamp_readable": "2023-12-21 10:30:56"
      },
      "targetTemperature": {
        "value": 20.0,
        "value_type": "double",
        "timestamp": 1703123456789,
        "timestamp_readable": "2023-12-21 10:30:56"
      }
    }
  }
}
```

### 2. `/api/telemetry/device-sensors-aggregated`

**Zweck:** Abrufen von aggregierten Zeitreihendaten für Charts

**Parameter:**
- `deviceIds` (required): Komma-getrennte Liste von Geräte-IDs
- `key` (required): Sensor-Schlüssel
- `startTs` (required): Start-Zeitstempel (Millisekunden)
- `endTs` (required): End-Zeitstempel (Millisekunden)
- `interval` (optional): Aggregationsintervall in Millisekunden (Standard: 300000 = 5 Minuten)

**Beispiel:**
```
GET /api/telemetry/device-sensors-aggregated?deviceIds=device1&key=sensorTemperature&startTs=1703123456789&endTs=1703209856789&interval=3600000
```

**Antwort:**
```json
{
  "success": true,
  "device_count": 1,
  "key": "sensorTemperature",
  "start_ts": 1703123456789,
  "end_ts": 1703209856789,
  "interval": 3600000,
  "data": {
    "device1": [
      {
        "ts": 1703123456789,
        "ts_end": 1703127056789,
        "ts_readable": "2023-12-21 10:30:56",
        "value": 22.5,
        "min_value": 22.0,
        "max_value": 23.0,
        "count": 12
      }
    ]
  }
}
```

## Geänderte Dashboard-Funktionen

### 1. `fetchCurrentTemperature()`
- **Vorher:** ThingsBoard API `/api/thingsboard/devices/telemetry/aggregated`
- **Nachher:** PostgreSQL API `/api/telemetry/device-sensors`

### 2. `fetchTelemetryData()`
- **Vorher:** ThingsBoard API `/api/thingsboard/devices/telemetry/aggregated`
- **Nachher:** PostgreSQL API `/api/telemetry/device-sensors-aggregated`

### 3. `fetchTargetTelemetryData()`
- **Vorher:** ThingsBoard API `/api/thingsboard/devices/telemetry/aggregated`
- **Nachher:** PostgreSQL API `/api/telemetry/device-sensors-aggregated`

### 4. `fetchValveTelemetryData()`
- **Vorher:** ThingsBoard API `/api/thingsboard/devices/telemetry/aggregated`
- **Nachher:** PostgreSQL API `/api/telemetry/device-sensors-aggregated`

### 5. `fetchTelemetryForDevices()`
- **Vorher:** ThingsBoard API `/api/thingsboard/devices/telemetry`
- **Nachher:** PostgreSQL APIs `/api/telemetry/device-sensors` und `/api/telemetry/device-sensors-aggregated`

## Performance-Verbesserungen

1. **Direkter Datenbankzugriff:** Keine Zwischenschicht über ThingsBoard API
2. **Optimierte Abfragen:** Verwendung von PostgreSQL-spezifischen Features
3. **Batch-Verarbeitung:** Mehrere Geräte in einer Abfrage
4. **Reduzierte Latenz:** Weniger Netzwerk-Hops
5. **Bessere Skalierbarkeit:** Direkte Kontrolle über Datenbankabfragen

## Datenbank-Schema

Die APIs verwenden die folgenden PostgreSQL-Tabellen:

- **ts_kv:** Zeitreihendaten
- **ts_kv_dictionary:** Schlüssel-zu-ID-Mapping

### Wichtige Spalten in ts_kv:
- `entity_id`: Geräte-ID (UUID)
- `key`: Numerische Schlüssel-ID
- `ts`: Zeitstempel (Millisekunden)
- `bool_v`, `str_v`, `long_v`, `dbl_v`, `json_v`: Wert-Spalten je nach Datentyp

## Migration

Die Änderungen sind rückwärtskompatibel. Die Dashboard-Seite funktioniert weiterhin, aber mit verbesserter Performance durch direkten PostgreSQL-Zugriff.

## Testing

Verwenden Sie das Test-Skript `test-postgresql-apis.js` um die neuen APIs zu testen:

```bash
node test-postgresql-apis.js
```

**Hinweis:** Ersetzen Sie die Test-Geräte-IDs mit echten Geräte-IDs aus Ihrem System.

## Überwachung

Überwachen Sie die Performance-Verbesserungen durch:

1. **Latenz-Messung:** Vergleichen Sie die Antwortzeiten vor und nach der Migration
2. **Datenbank-Performance:** Überwachen Sie PostgreSQL-Abfragen
3. **Fehlerrate:** Überwachen Sie API-Fehler und Timeouts
4. **Benutzer-Erfahrung:** Messen Sie die Ladezeiten der Dashboard-Seite
