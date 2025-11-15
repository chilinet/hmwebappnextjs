# Window Status API - Verwendungsanleitung

## API-Endpunkt
```
GET /api/reporting/window-status
```

## Authentifizierung

Der API-Endpunkt verwendet einen Preshared Key. Der Standard-Key ist `default-reporting-key-2024` oder wird aus der Umgebungsvariable `REPORTING_PRESHARED_KEY` geladen.

Es gibt drei Möglichkeiten zur Authentifizierung:

### 1. Query Parameter (einfachste Methode)
```
?key=YOUR_API_KEY
```

### 2. Authorization Header
```
Authorization: Bearer YOUR_API_KEY
```

### 3. X-API-Key Header
```
X-API-Key: YOUR_API_KEY
```

## Erforderliche Parameter

- `customer_id` (string, erforderlich): UUID des Kunden

## Optionale Parameter

- `limit` (number, optional): Anzahl der Datensätze (1-1000, Standard: 100)
- `offset` (number, optional): Anzahl der zu überspringenden Datensätze (Standard: 0)

## Beispiele

### 1. cURL mit Query Parameter

```bash
curl "http://localhost:3000/api/reporting/window-status?key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD&customer_id=YOUR_CUSTOMER_UUID"
```

### 2. cURL mit Authorization Header

```bash
curl -H "Authorization: Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD" \
     "http://localhost:3000/api/reporting/window-status?customer_id=YOUR_CUSTOMER_UUID"
```

### 3. cURL mit X-API-Key Header

```bash
curl -H "X-API-Key: QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD" \
     "http://localhost:3000/api/reporting/window-status?customer_id=YOUR_CUSTOMER_UUID"
```

### 4. JavaScript/Fetch (aus dem Frontend)

```javascript
// Mit Query Parameter
const response = await fetch(
  `${reportingUrl}/api/reporting/window-status?key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD&customer_id=${customerId}`
);
const data = await response.json();

// Mit Authorization Header
const response = await fetch(
  `${reportingUrl}/api/reporting/window-status?customer_id=${customerId}`,
  {
    headers: {
      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
    }
  }
);
const data = await response.json();
```

### 5. Mit Limit und Offset

```bash
curl "http://localhost:3000/api/reporting/window-status?key=YOUR_API_KEY&customer_id=YOUR_CUSTOMER_UUID&limit=50&offset=0"
```

## Response Format

### Erfolgreiche Antwort (200 OK)

```json
{
  "success": true,
  "metadata": {
    "total_records": 10,
    "limit": 100,
    "offset": 0,
    "has_more": false,
    "query_time": "2025-01-15T10:30:00.000Z"
  },
  "data": [
    {
      "device_id": "93e5da80-0e12-11f0-95b4-6750e6af33ee",
      "device_name": "7066e1fffe016958",
      "device_type": "dnt-LW-WSCI",
      "device_label": "Fensterkontakt Küche",
      "asset_id": "174f3bc0-098e-11f0-bf3e-fdfa06a0145e",
      "asset_name": "Küche",
      "asset_type": "Room",
      "customer_id": "ecd4cd70-0815-11f0-bf3e-fdfa06a0145e",
      "hall_sensor_state": "LOW",
      "ts": 1703123456789,
      "ts_readable": "2023-12-21 10:30:56"
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
  "details": [
    "Customer ID ist erforderlich"
  ]
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "Ein interner Fehler ist aufgetreten"
}
```

## hall_sensor_state Werte

- `LOW` = Fenster ist **offen**
- `HIGH` = Fenster ist **geschlossen**
- `null` = Kein Wert verfügbar

## Verwendung in der Anwendung

Die API wird bereits automatisch von der `/window-status` Seite verwendet:

```javascript
// In pages/window-status.js
const reportingUrl = process.env.REPORTING_URL || 'https://webapptest.heatmanager.cloud';
const windowResponse = await fetch(
  `${reportingUrl}/api/reporting/window-status?key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD&customer_id=${session.user.customerid}`
);
```

## Testen der API

### Lokale Entwicklung
```bash
# Lokaler Server (z.B. localhost:3000)
curl "http://localhost:3000/api/reporting/window-status?key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD&customer_id=YOUR_CUSTOMER_UUID"
```

### Produktionsumgebung
```bash
# Produktionsserver
curl "https://webapptest.heatmanager.cloud/api/reporting/window-status?key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD&customer_id=YOUR_CUSTOMER_UUID"
```

## CORS

Der Endpunkt unterstützt CORS und kann von verschiedenen Domains aufgerufen werden.

## Hinweise

1. Der `customer_id` muss ein gültiges UUID-Format haben
2. Das `limit` kann maximal 1000 sein
3. Der `offset` muss eine positive Zahl sein
4. Der API-Key sollte sicher aufbewahrt werden und nicht in Client-seitigem Code committet werden

