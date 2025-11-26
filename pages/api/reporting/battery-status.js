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
  
  // Customer ID validieren (UUID Format)
  if (query.customer_id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(query.customer_id)) {
      errors.push('Customer ID muss ein gültiges UUID-Format haben');
    }
  }
  
  // Limit validieren (max 1000 Datensätze)
  if (query.limit) {
    const limit = parseInt(query.limit);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      errors.push('Limit muss zwischen 1 und 1000 liegen');
    }
  }
  
  // Offset validieren
  if (query.offset) {
    const offset = parseInt(query.offset);
    if (isNaN(offset) || offset < 0) {
      errors.push('Offset muss eine positive Zahl sein');
    }
  }
  
  return errors;
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
      // SQL Query zusammenbauen
      let query = 'SELECT * FROM hmreporting.v_device_battery_latest';
      const queryParams = [];
      let paramIndex = 1;
      const conditions = [];
      
      // Customer ID Filter (erforderlich)
      if (req.query.customer_id) {
        conditions.push(`customer_id = $${paramIndex}`);
        queryParams.push(req.query.customer_id);
        paramIndex++;
      } else {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Customer ID ist erforderlich'
        });
      }
      
      // WHERE Klausel hinzufügen
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // ORDER BY hinzufügen
      query += ' ORDER BY asset_name, device_name';
      
      // LIMIT und OFFSET hinzufügen
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      // Zuerst die Gesamtanzahl ermitteln (vor ORDER BY, LIMIT, OFFSET)
      let countQuery = 'SELECT COUNT(*) as total FROM hmreporting.v_device_battery_latest';
      if (conditions.length > 0) {
        countQuery += ' WHERE ' + conditions.join(' AND ');
      }
      const countResult = await client.query(countQuery, queryParams.slice(0, conditions.length));
      const totalCount = parseInt(countResult.rows[0].total) || 0;
      
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(limit);
      paramIndex++;
      
      if (offset > 0) {
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(offset);
      }
      
      console.log('Battery Status API Query:', query);
      console.log('Query Parameters:', queryParams);
      
      // Query ausführen
      const result = await client.query(query, queryParams);
      
      // Metadaten für die Antwort
      const metadata = {
        total_records: result.rows.length,
        total_count: totalCount,
        limit: limit,
        offset: offset,
        has_more: (offset + result.rows.length) < totalCount,
        query_time: new Date().toISOString(),
        view_name: 'hmreporting.v_device_battery_latest'
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
    console.error('Battery Status API Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === '42P01') {
      return res.status(404).json({
        error: 'View not found',
        message: 'Die View hmreporting.v_device_battery_latest wurde nicht gefunden'
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
BATTERY STATUS API ENDPOINT
===========================

URL: /api/reporting/battery-status
Method: GET, POST
Authentication: Preshared Key

AUTHENTICATION OPTIONS:
1. Authorization Header: Bearer <key>
2. X-API-Key Header: <key>
3. Query Parameter: ?key=<key>

QUERY PARAMETERS:
- customer_id (required): UUID des Kunden für Filterung
- limit (optional): Anzahl der Datensätze (1-1000, default: 100)
- offset (optional): Anzahl der zu überspringenden Datensätze (default: 0)

EXAMPLES:
GET /api/reporting/battery-status?key=your-key&customer_id=ecd4cd70-0815-11f0-bf3e-fdfa06a0145e
GET /api/reporting/battery-status?key=your-key&customer_id=ecd4cd70-0815-11f0-bf3e-fdfa06a0145e&limit=50
POST /api/reporting/battery-status
Headers: { "Authorization": "Bearer your-key", "Content-Type": "application/json" }
Body: { "customer_id": "ecd4cd70-0815-11f0-bf3e-fdfa06a0145e", "limit": 50 }

RESPONSE FORMAT:
{
  "success": true,
  "metadata": {
    "total_records": 10,
    "limit": 100,
    "offset": 0,
    "has_more": false,
    "query_time": "2025-01-15T10:30:00.000Z",
    "view_name": "hmreporting.v_device_battery_latest"
  },
  "data": [
    {
      "customer_id": "ecd4cd70-0815-11f0-bf3e-fdfa06a0145e",
      "customer_name": "Worlée Chemie GmbH",
      "asset_id": "174f3bc0-098e-11f0-bf3e-fdfa06a0145e",
      "asset_name": "WORLEE_0006",
      "asset_type": "Room",
      "device_id": "93e5da80-0e12-11f0-95b4-6750e6af33ee",
      "device_name": "7066e1fffe016958",
      "device_type": "dnt-lw-etrv",
      "battery_voltage": 3.12,
      "last_update_utc": "2025-10-24 16:37:13",
      "battery_status": "gut"
    }
  ]
}
*/
