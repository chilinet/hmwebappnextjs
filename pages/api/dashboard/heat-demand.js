import { getPgConnection } from '../../../lib/pgdb.js';

// Preshared Key für Authentifizierung
const PRESHARED_KEY = process.env.REPORTING_PRESHARED_KEY || 'default-reporting-key-2024';

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
      message: 'Nur GET Anfragen sind erlaubt'
    });
  }
  
  try {
    const { customer_id, start_date, end_date, limit = 24 } = req.query;
    
    // Parameter validieren
    if (!customer_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'customer_id ist erforderlich'
      });
    }
    
    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'start_date und end_date sind erforderlich'
      });
    }
    
    // PostgreSQL Verbindung holen
    const pool = await getPgConnection();
    const client = await pool.connect();
    
    try {
      // SQL Query mit der Funktion
      const query = `
        SELECT * FROM hmreporting.f_customer_hourly_avg($1, $2) 
        WHERE customer_id = $3 
        ORDER BY hour_start DESC 
        LIMIT $4
      `;
      
      const queryParams = [start_date, end_date, customer_id, parseInt(limit)];
      
      console.log('Heat Demand API Query:', query);
      console.log('Query Parameters:', queryParams);
      
      // Query ausführen
      const result = await client.query(query, queryParams);
      
      // Metadaten für die Antwort
      const metadata = {
        total_records: result.rows.length,
        limit: parseInt(limit),
        query_time: new Date().toISOString(),
        function_name: 'hmreporting.f_customer_hourly_avg',
        time_range: {
          start_date: start_date,
          end_date: end_date
        }
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
    console.error('Heat Demand API Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === '42P01') {
      return res.status(404).json({
        error: 'Function not found',
        message: 'Die Funktion hmreporting.f_customer_hourly_avg wurde nicht gefunden'
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
