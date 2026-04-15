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
  const customerId = trimQueryParam(query.customer_id);

  if (!startId && !customerId) {
    errors.push('Entweder customer_id oder start_id ist erforderlich');
  }

  if (customerId && !UUID_REGEX.test(customerId)) {
    errors.push('Customer ID muss ein gültiges UUID-Format haben');
  }

  if (startId && !UUID_REGEX.test(startId)) {
    errors.push('start_id muss ein gültiges UUID-Format haben');
  }

  // Limit validieren (max 5000 Datensätze)
  if (query.limit) {
    const limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 5000) {
      errors.push('Limit muss zwischen 1 und 5000 liegen');
    }
  }

  // Offset validieren
  if (query.offset) {
    const offset = parseInt(query.offset, 10);
    if (isNaN(offset) || offset < 0) {
      errors.push('Offset muss eine positive Zahl sein');
    }
  }

  return errors;
}

/** Fensterkontakte im Teilbaum ab start_id (Asset + rekursiv untergeordnete Assets). */
function buildWindowStatusSubtreeQuery() {
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
)

SELECT
    v.customer_id,
    v.customer_name,
    v.asset_id,
    v.asset_name,
    v.asset_type,
    v.device_id,
    v.device_name,
    v.device_type,
    COALESCE(d.label, '') AS device_label,
    v.hall_sensor_state,
    v.last_update_utc
FROM hmreporting.v_device_hall_sensor_state_latest v
JOIN asset_devices ad
    ON ad.device_id = v.device_id
LEFT JOIN device d
    ON d.id = v.device_id
WHERE v.device_type = 'dnt-LW-WSCI'
ORDER BY v.asset_name, v.device_name
LIMIT $2
OFFSET $3
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
      const startId = trimQueryParam(req.query.start_id);
      const customerId = trimQueryParam(req.query.customer_id);
      const limit = parseInt(req.query.limit, 10) || 5000;
      const offset = parseInt(req.query.offset, 10) || 0;

      let query;
      let queryParams;
      let metadataExtra = {};

      if (startId) {
        query = buildWindowStatusSubtreeQuery();
        queryParams = [startId, limit, offset];
        metadataExtra = {
          query_mode: 'asset_subtree',
          start_id: startId,
          device_type_filter: 'dnt-LW-WSCI'
        };
      } else {
        // SQL Query — View hmreporting.v_device_hall_sensor_state_latest, JOIN device für Label
        query = `
        SELECT 
          v.customer_id,
          v.customer_name,
          v.asset_id,
          v.asset_name,
          v.asset_type,
          v.device_id,
          v.device_name,
          v.device_type,
          COALESCE(d.label, '') AS device_label,
          v.hall_sensor_state,
          v.last_update_utc
        FROM hmreporting.v_device_hall_sensor_state_latest v
        LEFT JOIN device d ON d.id = v.device_id
        WHERE v.customer_id = $1
        ORDER BY v.asset_name, v.device_name
        LIMIT $2
        OFFSET $3
      `;
        queryParams = [customerId, limit, offset];
        metadataExtra = {
          query_mode: 'customer',
          customer_id: customerId
        };
      }

      console.log('Window Status API Query:', query);
      console.log('Window Status API Query Parameters:', queryParams);

      const result = await client.query(query, queryParams);

      const metadata = {
        total_records: result.rows.length,
        limit,
        offset,
        has_more: result.rows.length === limit,
        query_time: new Date().toISOString(),
        view_name: 'hmreporting.v_device_hall_sensor_state_latest',
        ...metadataExtra
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
    console.error('Window Status API Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === '42P01') {
      return res.status(404).json({
        error: 'View not found',
        message: 'Die View hmreporting.v_device_hall_sensor_state_latest wurde nicht gefunden'
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

