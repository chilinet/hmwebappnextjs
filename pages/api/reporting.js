import { getPgConnection } from '../../../lib/pgdb.js';

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

// Hilfsfunktion zur Validierung der Query-Parameter
function validateQueryParams(query) {
  const errors = [];
  
  // Limit validieren (max 1000 Datensätze)
  if (query.limit) {
    const limit = parseInt(query.limit);
    if (isNaN(limit) || limit < 1 || limit > 10000) {
      errors.push('Limit muss zwischen 1 und 10000 liegen');
    }
  }
  
  // Offset validieren
  if (query.offset) {
    const offset = parseInt(query.offset);
    if (isNaN(offset) || offset < 0) {
      errors.push('Offset muss eine positive Zahl sein');
    }
  }
  
  // Entity ID validieren (UUID Format)
  if (query.entity_id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(query.entity_id)) {
      errors.push('Entity ID muss ein gültiges UUID-Format haben');
    }
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

// Hauptfunktion für die API
export default async function handler(req, res) {
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
      // SQL Query zusammenbauen
      let query = 'SELECT * FROM hmreporting.device_10m';
      const queryParams = [];
      let paramIndex = 1;
      const conditions = [];
      
      // Entity ID Filter
      if (req.query.entity_id) {
        conditions.push(`entity_id = $${paramIndex}`);
        queryParams.push(req.query.entity_id);
        paramIndex++;
      }
      
      // Datum Filter
      if (req.query.start_date) {
        conditions.push(`bucket_10m >= $${paramIndex}`);
        queryParams.push(req.query.start_date);
        paramIndex++;
      }
      
      if (req.query.end_date) {
        conditions.push(`bucket_10m <= $${paramIndex}`);
        queryParams.push(req.query.end_date);
        paramIndex++;
      }
      
      // WHERE Klausel hinzufügen
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // ORDER BY hinzufügen
      query += ' ORDER BY bucket_10m DESC, entity_id';
      
      // LIMIT und OFFSET hinzufügen
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(limit);
      paramIndex++;
      
      if (offset > 0) {
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(offset);
      }
      
      console.log('Reporting API Query:', query);
      console.log('Query Parameters:', queryParams);
      
      // Query ausführen
      const result = await client.query(query, queryParams);
      
      // Metadaten für die Antwort
      const metadata = {
        total_records: result.rows.length,
        limit: limit,
        offset: offset,
        has_more: result.rows.length === limit,
        query_time: new Date().toISOString()
      };
      
      // Antwort senden
      res.status(200).json({
        success: true,
        metadata: metadata,
        data: result.rows
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Reporting API Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === '42P01') {
      return res.status(404).json({
        error: 'Table not found',
        message: 'Die Tabelle hmreporting.device_10m wurde nicht gefunden'
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
REPORTING API ENDPOINT
=====================

URL: /api/reporting
Method: GET, POST
Authentication: Preshared Key

AUTHENTICATION OPTIONS:
1. Authorization Header: Bearer <key>
2. X-API-Key Header: <key>
3. Query Parameter: ?key=<key>

QUERY PARAMETERS:
- limit (optional): Anzahl der Datensätze (1-1000, default: 10)
- offset (optional): Anzahl der zu überspringenden Datensätze (default: 0)
- entity_id (optional): UUID der Entity für Filterung
- start_date (optional): Start-Datum für Filterung (ISO Format)
- end_date (optional): End-Datum für Filterung (ISO Format)

EXAMPLES:
GET /api/reporting?key=your-key&limit=50&entity_id=00229de0-6473-11ef-8cd8-8b580d9aa086
GET /api/reporting?key=your-key&start_date=2025-09-15&end_date=2025-09-16
POST /api/reporting
Headers: { "Authorization": "Bearer your-key", "Content-Type": "application/json" }
Body: { "limit": 100, "entity_id": "00229de0-6473-11ef-8cd8-8b580d9aa086" }

RESPONSE FORMAT:
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
*/
