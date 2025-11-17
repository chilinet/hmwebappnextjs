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
  
  // Nur GET erlauben
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
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
    
    // PostgreSQL Verbindung holen
    const pool = await getPgConnection();
    const client = await pool.connect();
    
    try {
      // Device ID ist erforderlich
      if (!req.query.device_id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Device ID ist erforderlich'
        });
      }
      
      const deviceId = req.query.device_id;
      const days = parseInt(req.query.days) || 3; // Standard: 3 Tage
      
      // Berechne Start- und Endzeit
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // SQL Query: Hole Historie aus ts_kv Tabelle
      // Wir müssen zuerst den Key für hall_sensor_state finden
      const query = `
        WITH key_lookup AS (
          SELECT key_id 
          FROM ts_kv_dictionary 
          WHERE key IN ('hallSensorState', 'hall_sensor_state', 'hallSensor')
          LIMIT 1
        ),
        history_data AS (
          SELECT 
            kv.ts,
            to_timestamp(kv.ts / 1000) AS timestamp,
            CASE 
              WHEN kv.str_v IS NOT NULL THEN kv.str_v
              WHEN kv.bool_v IS NOT NULL THEN CASE WHEN kv.bool_v THEN 'HIGH' ELSE 'LOW' END
              ELSE NULL
            END AS hall_sensor_state
          FROM ts_kv kv
          CROSS JOIN key_lookup kl
          WHERE kv.entity_id = $1
            AND kv.key = kl.key_id
            AND kv.ts >= $2
            AND kv.ts <= $3
          ORDER BY kv.ts ASC
        )
        SELECT 
          ts,
          timestamp,
          hall_sensor_state
        FROM history_data
        ORDER BY ts ASC
      `;
      
      const startTs = startDate.getTime();
      const endTs = endDate.getTime();
      
      console.log('Window Status History API Query:', {
        deviceId,
        startTs,
        endTs,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      
      const result = await client.query(query, [deviceId, startTs, endTs]);
      
      // Metadaten für die Antwort
      const metadata = {
        total_records: result.rows.length,
        device_id: deviceId,
        days: days,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
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
    console.error('Window Status History API Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === '42P01') {
      return res.status(404).json({
        error: 'Table or view not found',
        message: 'Die benötigte Tabelle oder View wurde nicht gefunden'
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

