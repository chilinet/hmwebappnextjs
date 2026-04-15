import { getPgConnection } from '../../lib/pgdb.js';

// Preshared Key für Authentifizierung
const PRESHARED_KEY = process.env.REPORTING_PRESHARED_KEY || 'default-reporting-key-2024';

// Hilfsfunktion zur Authentifizierung
function authenticateRequest(req) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  
  // Prüfe Authorization Header (Bearer Token)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === PRESHARED_KEY;
  }
  
  // Prüfe X-API-Key Header
  if (apiKey) {
    return apiKey === PRESHARED_KEY;
  }
  
  // Prüfe Query Parameter
  if (req.query.key) {
    return req.query.key === PRESHARED_KEY;
  }
  
  return false;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimQueryParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Hilfsfunktion zur Validierung der Query-Parameter
function validateQueryParams(query) {
  const errors = [];

  const startId = trimQueryParam(query.start_id);

  // Limit validieren (max 1000 Datensätze für bessere Performance)
  if (query.limit) {
    const limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      errors.push('Limit muss zwischen 1 und 1000 liegen');
    }
  }

  // Offset validieren
  if (query.offset) {
    const offset = parseInt(query.offset, 10);
    if (isNaN(offset) || offset < 0) {
      errors.push('Offset muss eine positive Zahl sein');
    }
  }

  // Customer ID validieren (UUID Format)
  if (query.customer_id) {
    if (!UUID_REGEX.test(String(query.customer_id).trim())) {
      errors.push('Customer ID muss ein gültiges UUID-Format haben');
    }
  }

  if (startId && !UUID_REGEX.test(startId)) {
    errors.push('start_id muss ein gültiges UUID-Format haben');
  }

  if (startId && !trimQueryParam(query.customer_id)) {
    errors.push('customer_id ist bei start_id erforderlich');
  }
  
  // Datum validieren
  if (query.start_date) {
    const startDate = new Date(query.start_date);
    if (isNaN(startDate.getTime())) {
      errors.push('Start-Datum muss ein gültiges Datum sein');
    }
  }
  
  if (query.end_date) {
    const endDate = new Date(query.end_date);
    if (isNaN(endDate.getTime())) {
      errors.push('End-Datum muss ein gültiges Datum sein');
    }
  }
  
  return errors;
}

/**
 * Stundenmittel (Ventil / Sensor) nur für Devices unterhalb von start_id (asset-Teilbaum).
 * Datenbasis: hmreporting.device_10m — analog zur Fenster-Teilbaum-Logik in reporting/window-status.
 */
function buildHourlyAvgSubtreeSql(includeOffset) {
  const offsetClause = includeOffset ? `OFFSET $6` : '';
  return `
WITH RECURSIVE asset_tree AS (
    SELECT a.id
    FROM asset a
    WHERE a.id = $1::uuid

    UNION ALL

    SELECT child.id
    FROM relation r
    JOIN asset child
        ON r.to_id = child.id
       AND r.to_type = 'ASSET'
    JOIN asset_tree at
        ON r.from_id = at.id
       AND r.from_type = 'ASSET'
    WHERE r.relation_type = 'Contains'
      AND r.relation_type_group = 'COMMON'
),

asset_devices AS (
    SELECT DISTINCT
        r.to_id AS device_id
    FROM asset_tree at
    JOIN relation r
        ON r.from_id = at.id
       AND r.from_type = 'ASSET'
       AND r.to_type = 'DEVICE'
       AND r.relation_type = 'Contains'
       AND r.relation_type_group = 'COMMON'
),

hourly AS (
    SELECT
        date_trunc('hour', m.bucket_10m) AS hour_start,
        AVG(m.sensor_temperature::double precision) AS avg_sensortemperature,
        AVG(m.percent_valve_open::double precision) AS avg_percentvalveopen,
        COUNT(*) FILTER (WHERE m.sensor_temperature IS NOT NULL) AS n_sensortemperature,
        COUNT(*) FILTER (WHERE m.percent_valve_open IS NOT NULL) AS n_percentvalveopen
    FROM hmreporting.device_10m m
    INNER JOIN asset_devices ad ON ad.device_id = m.entity_id
    WHERE m.bucket_10m >= $2::timestamptz
      AND m.bucket_10m <= $3::timestamptz
    GROUP BY 1
)

SELECT
    $4::uuid AS customer_id,
    (SELECT title FROM customer WHERE id = $4::uuid LIMIT 1) AS customer_name,
    h.hour_start,
    h.avg_sensortemperature,
    h.avg_percentvalveopen,
    h.n_sensortemperature,
    h.n_percentvalveopen
FROM hourly h
ORDER BY h.hour_start
LIMIT $5
${offsetClause}
`;
}

// Hauptfunktion für die API
export default async function handler(req, res) {
  // CORS-Header setzen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  
  // OPTIONS-Request für CORS Preflight behandeln
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Nur GET und POST erlauben
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Nur GET und POST Anfragen sind erlaubt'
    });
  }
  
  try {
    // Authentifizierung prüfen
    if (!authenticateRequest(req)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Ungültiger oder fehlender API-Key. Verwenden Sie Authorization: Bearer <key>, X-API-Key: <key> oder ?key=<key>'
      });
    }
    
    // Query-Parameter validieren
    const validationErrors = validateQueryParams(req.query);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Ungültige Parameter',
        details: validationErrors
      });
    }
    
    // PostgreSQL Verbindung holen
    const pool = await getPgConnection();
    const client = await pool.connect();
    
    try {
      const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();
      const startDate = req.query.start_date
        ? new Date(req.query.start_date)
        : new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

      const formatDateForPostgres = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const timezoneOffset = -date.getTimezoneOffset();
        const timezoneHours = Math.floor(Math.abs(timezoneOffset) / 60);
        const timezoneSign = timezoneOffset >= 0 ? '+' : '-';
        const timezoneStr = `${timezoneSign}${String(timezoneHours).padStart(2, '0')}`;
        return `${year}-${month}-${day} ${hours}:${minutes}${timezoneStr}`;
      };

      const limit = parseInt(req.query.limit, 10) || 24;
      const offset = parseInt(req.query.offset, 10) || 0;
      const startId = trimQueryParam(req.query.start_id);
      const customerId = trimQueryParam(req.query.customer_id);

      let query;
      let queryParams;
      let metadataExtra;

      if (startId) {
        query = buildHourlyAvgSubtreeSql(offset > 0);
        queryParams = [
          startId,
          formatDateForPostgres(startDate),
          formatDateForPostgres(endDate),
          customerId,
          limit
        ];
        if (offset > 0) {
          queryParams.push(offset);
        }
        metadataExtra = {
          query_mode: 'asset_subtree',
          start_id: startId,
          function_name: 'hmreporting.device_10m (hourly, subtree)'
        };
      } else {
        query = 'SELECT * FROM hmreporting.f_customer_hourly_avg_valveopen($1, $2)';
        queryParams = [formatDateForPostgres(startDate), formatDateForPostgres(endDate)];
        let paramIndex = 3;
        const conditions = [];
        if (customerId) {
          conditions.push(`customer_id = $${paramIndex}`);
          queryParams.push(customerId);
          paramIndex++;
        }
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += ' ORDER BY hour_start';
        query += ` LIMIT $${paramIndex}`;
        queryParams.push(limit);
        paramIndex++;
        if (offset > 0) {
          query += ` OFFSET $${paramIndex}`;
          queryParams.push(offset);
        }
        metadataExtra = {
          query_mode: 'customer',
          function_name: 'hmreporting.f_customer_hourly_avg_valveopen'
        };
      }

      console.log('Customer Hourly Avg API Query:', query);
      console.log('Query Parameters:', queryParams);

      const result = await client.query(query, queryParams);

      const metadata = {
        total_records: result.rows.length,
        limit,
        offset,
        has_more: result.rows.length === limit,
        query_time: new Date().toISOString(),
        time_range: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString()
        },
        ...metadataExtra
      };

      res.status(200).json({
        success: true,
        metadata,
        data: result.rows
      });
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Customer Hourly Avg API Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === '42P01') {
      return res.status(404).json({
        error: 'Function not found',
        message: 'Die Funktion hmreporting.f_customer_hourly_avg_valveopen wurde nicht gefunden'
      });
    }
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Database connection failed',
        message: 'Verbindung zur Datenbank fehlgeschlagen'
      });
    }
    
    // Generischer Fehler
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ein interner Fehler ist aufgetreten',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// API Dokumentation als Kommentar
/*
CUSTOMER HOURLY AVERAGE API ENDPOINT
=====================================

URL: /api/customer-hourly-avg
Method: GET, POST
Authentication: Preshared Key

AUTHENTICATION OPTIONS:
1. Authorization Header: Bearer <key>
2. X-API-Key Header: <key>
3. Query Parameter: ?key=<key>

QUERY PARAMETERS:
- limit (optional): Anzahl der Datensätze (1-1000, default: 24)
- offset (optional): Anzahl der zu überspringenden Datensätze (default: 0)
- customer_id (optional): UUID der Customer für Filterung (bei start_id erforderlich)
- start_id (optional): Asset-UUID — nur Geräte im Teilbaum ab diesem Asset (Aggregation aus hmreporting.device_10m)
- start_date (optional): Start-Datum für Filterung (ISO Format, default: 24h vor end_date)
- end_date (optional): End-Datum für Filterung (ISO Format, default: jetzt)

FUNCTION USAGE:
Ohne start_id: hmreporting.f_customer_hourly_avg_valveopen(start_date, end_date) optional gefiltert nach customer_id.
Mit start_id: rekursiver Asset-Baum wie window-status, Stundenmittel aus device_10m nur für zugehörige Devices.
Standard: letzte 24 Stunden (now() - INTERVAL '24 hours', now())
Die Datumsformate werden im Format 'YYYY-MM-DD HH:mm+TZ' übergeben (z.B. '2025-02-01 00:00+01')

EXAMPLES:
GET /api/customer-hourly-avg?key=your-key&limit=48&customer_id=2ea4ba70-647a-11ef-8cd8-8b580d9aa086
GET /api/customer-hourly-avg?key=...&customer_id=...&start_id=<asset-uuid>&start_date=...&end_date=...
GET /api/customer-hourly-avg?key=your-key&start_date=2025-10-20&end_date=2025-10-21
POST /api/customer-hourly-avg
Headers: { "Authorization": "Bearer your-key", "Content-Type": "application/json" }
Body: { "limit": 48, "customer_id": "2ea4ba70-647a-11ef-8cd8-8b580d9aa086" }

RESPONSE FORMAT:
{
  "success": true,
  "metadata": {
    "total_records": 24,
    "limit": 24,
    "offset": 0,
    "has_more": false,
    "query_time": "2025-01-15T10:30:00.000Z",
    "function_name": "hmreporting.f_customer_hourly_avg_valveopen",
    "time_range": {
      "start_date": "2025-10-20T20:00:00.000Z",
      "end_date": "2025-10-21T20:00:00.000Z"
    }
  },
  "data": [
    {
      "customer_id": "2ea4ba70-647a-11ef-8cd8-8b580d9aa086",
      "customer_name": "EME_ADG_SchlossMontabaur",
      "hour_start": "2025-10-21T20:00:00.000Z",
      "avg_sensortemperature": 21.60584586466168,
      "avg_percentvalveopen": 4.044345898004434,
      "n_sensortemperature": 532,
      "n_percentvalveopen": 451
    }
  ]
}

DATA STRUCTURE:
- customer_id: UUID des Kunden
- customer_name: Name des Kunden
- hour_start: Startzeit der Stunde (ISO Format)
- avg_sensortemperature: Durchschnittliche Sensortemperatur in °C
- avg_percentvalveopen: Durchschnittlicher Ventilöffnungsgrad in %
- n_sensortemperature: Anzahl der Temperaturmessungen
- n_percentvalveopen: Anzahl der Ventilöffnungsmessungen
*/
