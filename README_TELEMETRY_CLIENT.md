# HEATMANAGER Telemetrie-API Client

Dieser Python3-Client ermöglicht es, die HEATMANAGER Telemetrie-API lokal aufzurufen und Telemetriedaten von Geräten abzurufen.

## 📋 Voraussetzungen

- Python 3.6 oder höher
- `requests` Bibliothek
- HEATMANAGER läuft lokal auf Port 3000 (oder angepasster Port)

## 🚀 Installation

1. **Python-Abhängigkeiten installieren:**
```bash
pip3 install requests
```

2. **Dateien herunterladen:**
   - `simple_telemetry_client.py` - Einfacher Client mit interaktiver Eingabe (empfohlen)
   - `direct_auth_client.py` - Direkter NextAuth-Client für komplexere Authentifizierung
   - `telemetry_client.py` - Vollständiger Client mit Kommandozeilen-Argumenten

## 🔧 Verwendung

### Option 1: Einfacher Client (empfohlen für den Start)

```bash
python3 simple_telemetry_client.py
```

Der Client fragt interaktiv nach:
- Device ID
- Benutzername
- Passwort
- Base URL (Standard: http://localhost:3000)

### Option 2: Direkter NextAuth-Client (bei Authentifizierungsproblemen)

```bash
python3 direct_auth_client.py
```

Dieser Client simuliert den kompletten NextAuth-Login-Prozess und kann bei Authentifizierungsproblemen helfen.

### Option 3: Vollständiger Client mit Kommandozeilen-Argumenten

```bash
# Grundlegende Verwendung
python3 telemetry_client.py \
  --username "dein_username" \
  --password "dein_password" \
  --device-id "device_uuid"

# Mit angepasster URL
python3 telemetry_client.py \
  --url "http://localhost:3001" \
  --username "dein_username" \
  --password "dein_password" \
  --device-id "device_uuid"

# Mit angepassten Keys
python3 telemetry_client.py \
  --username "dein_username" \
  --password "dein_password" \
  --device-id "device_uuid" \
  --keys "sensorTemperature,batteryVoltage"

# Mit Zeitbereich (letzte 48 Stunden)
python3 telemetry_client.py \
  --username "dein_username" \
  --password "dein_password" \
  --device-id "device_uuid" \
  --hours 48

# Rohe JSON-Ausgabe
python3 telemetry_client.py \
  --username "dein_username" \
  --password "dein_password" \
  --device-id "device_uuid" \
  --raw
```

## 📊 Verfügbare Telemetrie-Keys

Standardmäßig werden folgende Keys abgerufen:

- **`fCnt`** - Frame Counter (LoRaWAN)
- **`sensorTemperature`** - Aktuelle Sensortemperatur (°C)
- **`targetTemperature`** - Zieltemperatur (°C)
- **`batteryVoltage`** - Batteriespannung (V)
- **`PercentValveOpen`** - Ventil-Öffnungsgrad (%)
- **`rssi`** - Signalstärke (dBm)
- **`snr`** - Signal-to-Noise Ratio (dB)
- **`sf`** - Spreading Factor
- **`signalQuality`** - Signalqualität

## 🔍 Beispiel-Ausgabe

```
🚀 HEATMANAGER Telemetrie-Client
========================================
Device ID eingeben: 123e4567-e89b-12d3-a456-426614174000
Benutzername eingeben: admin
Passwort eingeben: ****
Base URL (Standard: http://localhost:3000): 

========================================
🔐 Anmeldung bei http://localhost:3000...
✅ Anmeldung erfolgreich!
✅ Token aus Session gefunden
📡 Rufe Telemetriedaten für Device 123e4567-e89b-12d3-a456-426614174000 ab...
✅ Telemetriedaten erfolgreich abgerufen!

📊 TELEMETRIEDATEN
==================================================

🔹 sensorTemperature:
   14:30:25: 22.5°C
   14:25:15: 22.3°C
   14:20:05: 22.1°C
   ... und 45 weitere Werte

🔹 batteryVoltage:
   14:30:25: 3.85V
   14:25:15: 3.86V
   14:20:05: 3.87V
   ... und 45 weitere Werte

🔹 PercentValveOpen:
   14:30:25: 65%
   14:25:15: 63%
   14:20:05: 61%
   ... und 45 weitere Werte

Rohe JSON-Daten in Datei speichern? (j/n): j
✅ Daten gespeichert in: telemetry_123e4567-e89b-12d3-a456-426614174000_20241201_143025.json
```

## 🛠️ Fehlerbehebung

### Anmeldung fehlgeschlagen
- Überprüfe Benutzername und Passwort
- Stelle sicher, dass HEATMANAGER läuft
- Überprüfe die Base URL

### Kein Access-Token
- **WICHTIG**: Der Client sucht jetzt nach verschiedenen Token-Feldern:
  - `token` (Hauptfeld)
  - `accessToken` (Alternatives Feld)
  - `user.token` (Verschachteltes Feld)
- Falls weiterhin Probleme auftreten, verwende den `direct_auth_client.py`
- Überprüfe die NextAuth-Konfiguration
- Schau in die Browser-Entwicklertools für die tatsächliche API-Struktur

### API-Fehler
- Überprüfe, ob die Telemetrie-API verfügbar ist
- Stelle sicher, dass ThingsBoard läuft und erreichbar ist
- Überprüfe die Logs der HEATMANAGER-Anwendung

### Authentifizierungsprobleme
Falls der einfache Client nicht funktioniert:

1. **Versuche den direkten NextAuth-Client:**
   ```bash
   python3 direct_auth_client.py
   ```

2. **Überprüfe die Session-Struktur:**
   - Öffne die Browser-Entwicklertools
   - Gehe zu Network → XHR
   - Melde dich im Browser an
   - Schaue dir den `/api/auth/session` Request an
   - Überprüfe die Antwort-Struktur

3. **Debug-Informationen:**
   - Alle Clients zeigen jetzt detaillierte Session-Informationen
   - Verwende den `--raw` Parameter für rohe JSON-Ausgabe
   - Überprüfe die Logs der HEATMANAGER-Anwendung

## 🔧 Anpassungen

### Eigene Telemetrie-Keys
```python
# In der get_telemetry Funktion
keys = "deinKey1,deinKey2,deinKey3"
```

### Andere Zeitbereiche
```python
# Letzte 7 Tage
start_time = end_time - (7 * 24 * 60 * 60 * 1000)

# Letzte Stunde
start_time = end_time - (60 * 60 * 1000)
```

### Andere API-Endpunkte
```python
# Für aggregierte Daten
url = f"{base_url}/api/thingsboard/devices/telemetry/aggregated"

# Für Alarme
url = f"{base_url}/api/thingsboard/devices/alarms"
```

## 🔍 Debug-Informationen

Alle Clients zeigen jetzt detaillierte Informationen:

- **Session-Daten**: Komplette Session-Informationen
- **Verfügbare Felder**: Liste aller Felder in der Session
- **API-Aufrufe**: URL, Parameter und Headers
- **Fehlerdetails**: Detaillierte Fehlermeldungen

## 📝 Hinweise

- **Sicherheit**: Passwörter werden im Klartext eingegeben. Für Produktionsumgebungen sollten sicherere Methoden verwendet werden.
- **Rate Limiting**: Beachte mögliche Rate-Limits der API
- **Datenmenge**: Große Zeitbereiche können zu vielen Datenpunkten führen
- **Session-Management**: NextAuth-Sessions können ablaufen
- **Token-Struktur**: Die Session-Struktur kann je nach NextAuth-Konfiguration variieren

## 🆘 Support

Bei Problemen:

1. **Überprüfe die HEATMANAGER-Logs**
2. **Teste die API direkt im Browser**
3. **Überprüfe die NextAuth-Konfiguration**
4. **Stelle sicher, dass alle Services laufen**
5. **Verwende den `direct_auth_client.py` bei Authentifizierungsproblemen**
6. **Überprüfe die Session-Struktur in den Browser-Entwicklertools**

## 🔄 Aktualisierungen

- **v1.1**: Verbesserte Token-Erkennung für verschiedene Session-Strukturen
- **v1.2**: Neuer direkter NextAuth-Client für komplexere Authentifizierung
- **v1.3**: Erweiterte Debug-Informationen und Fehlerbehebung
