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
  
  // Device ID oder DevEUI muss vorhanden sein
  if (!query.deviceId && !query.deveui) {
    errors.push('deviceId oder deveui ist erforderlich');
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
      // Device-ID oder DevEUI aus Query-Parametern holen
      const deviceId = req.query.deviceId;
      const deveui = req.query.deveui;
      
      let deviceIdentifier;
      let whereCondition;
      const queryParams = [];
      let paramIndex = 1;
      
      // Bestimme, ob deviceId (UUID) oder deveui (Device-Name) verwendet wird
      if (deviceId) {
        // Wenn deviceId (UUID) übergeben wurde, verwende d.id
        deviceIdentifier = deviceId;
        whereCondition = `d.id = $${paramIndex}`;
        queryParams.push(deviceId);
        paramIndex++;
      } else if (deveui) {
        // Wenn deveui (Device-Name) übergeben wurde, verwende d.name
        deviceIdentifier = deveui;
        whereCondition = `d.name = $${paramIndex}`;
        queryParams.push(deveui);
        paramIndex++;
      } else {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'deviceId oder deveui ist erforderlich'
        });
      }
      
      // SQL Query zusammenbauen
      const query = `
        SELECT
          d.id     AS device_id,
          d.name   AS device_name,
          d.label  AS device_label,
          d.type   AS device_type,
          a.id     AS asset_id,
          a.name   AS asset_name,
          MAX(CASE WHEN ak.attribute_key = 'childLock'
                   THEN ak.bool_v::int END)::boolean                AS childLock,
          MAX(CASE WHEN ak.attribute_key = 'fixValue'
                   THEN ak.long_v END)                              AS fixValue,
          MAX(CASE WHEN ak.attribute_key = 'maxTemp'
                   THEN ak.long_v END)                              AS maxTemp,
          MAX(CASE WHEN ak.attribute_key = 'minTemp'
                   THEN ak.long_v END)                              AS minTemp,
          COALESCE(
            MAX(CASE WHEN ak.attribute_key = 'operationalMode' THEN ak.str_v END),
            MAX(CASE WHEN ak.attribute_key = 'operationalMode' THEN ak.long_v::text END)
          )                                                         AS operationalMode,
          MAX(CASE WHEN ak.attribute_key = 'overruleMinutes'
                   THEN ak.long_v END)                              AS overruleMinutes,
          MAX(CASE WHEN ak.attribute_key = 'runStatus'
                   THEN ak.str_v END)                               AS runStatus,
          MAX(CASE WHEN ak.attribute_key = 'schedulerPlan'
                   THEN ak.str_v END)                               AS schedulerPlan,
          MAX(CASE WHEN ak.attribute_key = 'sensorTemperature'
                   THEN ak.str_v END)                               AS sensorTemperature
        FROM asset a
        JOIN relation r
             ON r.from_id   = a.id
            AND r.from_type = 'ASSET'
            AND r.to_type   = 'DEVICE'
        JOIN device d
             ON d.id = r.to_id
        LEFT JOIN attribute_kv ak
               ON ak.entity_id   = a.id
              AND ak.entity_type = 'ASSET'
              AND ak.attribute_key IN (
                   'childLock','fixValue','maxTemp','minTemp',
                   'operationalMode','overruleMinutes',
                   'runStatus','schedulerPlan','sensorTemperature'
              )
        WHERE ${whereCondition}
        GROUP BY
          d.id, d.name, d.label, d.type,
          a.id, a.name
      `;
      
      console.log('Device Attributes API Query:', query);
      console.log('Query Parameters:', queryParams);
      
      // Query ausführen
      const result = await client.query(query, queryParams);
      
      // Metadaten für die Antwort
      const metadata = {
        total_records: result.rows.length,
        device_identifier: deviceIdentifier,
        identifier_type: deviceId ? 'deviceId (UUID)' : 'deveui (Device Name)',
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
    console.error('Device Attributes API Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === '42P01') {
      return res.status(404).json({
        error: 'Table not found',
        message: 'Eine oder mehrere Tabellen wurden nicht gefunden'
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
DEVICE ATTRIBUTES API ENDPOINT
===============================

URL: /api/reporting/device-attributes
Method: GET, POST
Authentication: Preshared Key

AUTHENTICATION OPTIONS:
1. Authorization Header: Bearer <key>
2. X-API-Key Header: <key>
3. Query Parameter: ?key=<key>

QUERY PARAMETERS:
- deviceId (optional): UUID des Devices (z.B. "123e4567-e89b-12d3-a456-426614174000")
- deveui (optional): Device EUI/Name (z.B. "70b3d52dd3011108")
- Hinweis: Entweder deviceId ODER deveui muss angegeben werden

EXAMPLES:
GET /api/reporting/device-attributes?key=your-key&deviceId=123e4567-e89b-12d3-a456-426614174000
GET /api/reporting/device-attributes?key=your-key&deveui=70b3d52dd3011108
POST /api/reporting/device-attributes
Headers: { "Authorization": "Bearer your-key", "Content-Type": "application/json" }
Body: { "deveui": "70b3d52dd3011108" }

RESPONSE FORMAT:
{
  "success": true,
  "metadata": {
    "total_records": 1,
    "device_identifier": "70b3d52dd3011108",
    "identifier_type": "deveui (Device Name)",
    "query_time": "2025-01-15T10:30:00.000Z"
  },
  "data": [
    {
      "device_id": "123e4567-e89b-12d3-a456-426614174000",
      "device_name": "70b3d52dd3011108",
      "device_label": "Device Label",
      "device_type": "dnt-lw-etrv",
      "asset_id": "174f3bc0-098e-11f0-bf3e-fdfa06a0145e",
      "asset_name": "Room_001",
      "childLock": true,
      "fixValue": 20,
      "maxTemp": 25,
      "minTemp": 15,
      "operationalMode": "auto",
      "overruleMinutes": 30,
      "runStatus": "running",
      "schedulerPlan": "plan1",
      "sensorTemperature": "22.5"
    }
  ]
}
*/

