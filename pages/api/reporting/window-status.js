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
      // Customer ID ist erforderlich
      if (!req.query.customer_id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Customer ID ist erforderlich'
        });
      }
      
      const customerId = req.query.customer_id;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      // SQL Query zusammenbauen - verwende die View hmreporting.v_device_hall_sensor_state_latest
      let query = 'SELECT * FROM hmreporting.v_device_hall_sensor_state_latest';
      const queryParams = [];
      let paramIndex = 1;
      const conditions = [];
      
      // Customer ID Filter (erforderlich)
      if (customerId) {
        conditions.push(`customer_id = $${paramIndex}`);
        queryParams.push(customerId);
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
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(limit);
      paramIndex++;
      
      if (offset > 0) {
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(offset);
      }
      
      console.log('Window Status API Query:', query);
      console.log('Query Parameters:', queryParams);
      
      // Query ausführen
      const result = await client.query(query, queryParams);
      
      // Metadaten für die Antwort
      const metadata = {
        total_records: result.rows.length,
        limit: limit,
        offset: offset,
        has_more: result.rows.length === limit,
        query_time: new Date().toISOString(),
        view_name: 'hmreporting.v_device_hall_sensor_state_latest'
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

