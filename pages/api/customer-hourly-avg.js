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

// Hilfsfunktion zur Validierung der Query-Parameter
function validateQueryParams(query) {
  const errors = [];
  
  // Limit validieren (max 1000 Datensätze für bessere Performance)
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
  
  // Customer ID validieren (UUID Format)
  if (query.customer_id) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(query.customer_id)) {
      errors.push('Customer ID muss ein gültiges UUID-Format haben');
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
      // SQL Query zusammenbauen - Funktion verwenden
      let query = 'SELECT * FROM hmreporting.f_customer_hourly_avg_valveopen($1, $2)';
      const queryParams = [];
      let paramIndex = 3; // Start bei 3, da $1 und $2 bereits belegt sind
      
      // Standard Zeitraum: letzte 24 Stunden
      const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();
      const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
      
      // Datum im PostgreSQL-Format mit Zeitzone formatieren (YYYY-MM-DD HH:mm+TZ)
      // Konvertiere zu lokaler Zeit mit Zeitzone im Format +01 oder -01
      const formatDateForPostgres = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        // PostgreSQL erwartet Zeitzone im Format +01 oder -01 (nur Stunden, keine Minuten)
        const timezoneOffset = -date.getTimezoneOffset(); // Negiert, weil getTimezoneOffset() das Gegenteil zurückgibt
        const timezoneHours = Math.floor(Math.abs(timezoneOffset) / 60);
        const timezoneSign = timezoneOffset >= 0 ? '+' : '-';
        const timezoneStr = `${timezoneSign}${String(timezoneHours).padStart(2, '0')}`;
        return `${year}-${month}-${day} ${hours}:${minutes}${timezoneStr}`;
      };
      
      queryParams.push(formatDateForPostgres(startDate));
      queryParams.push(formatDateForPostgres(endDate));
      
      // Zusätzliche Filter als WHERE Klausel
      const conditions = [];
      
      // Customer ID Filter
      if (req.query.customer_id) {
        conditions.push(`customer_id = $${paramIndex}`);
        queryParams.push(req.query.customer_id);
        paramIndex++;
      }
      
      // WHERE Klausel hinzufügen falls Filter vorhanden
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // ORDER BY hinzufügen
      query += ' ORDER BY hour_start';
      
      // LIMIT und OFFSET hinzufügen
      const limit = parseInt(req.query.limit) || 24; // Default: 24 Stunden
      const offset = parseInt(req.query.offset) || 0;
      
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(limit);
      paramIndex++;
      
      if (offset > 0) {
        query += ` OFFSET $${paramIndex}`;
        queryParams.push(offset);
      }
      
      console.log('Customer Hourly Avg API Query:', query);
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
        function_name: 'hmreporting.f_customer_hourly_avg_valveopen',
        time_range: {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString()
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
- customer_id (optional): UUID der Customer für Filterung
- start_date (optional): Start-Datum für Filterung (ISO Format, default: 24h vor end_date)
- end_date (optional): End-Datum für Filterung (ISO Format, default: jetzt)

FUNCTION USAGE:
Die API verwendet die PostgreSQL-Funktion: hmreporting.f_customer_hourly_avg_valveopen(start_date, end_date)
Standard: letzte 24 Stunden (now() - INTERVAL '24 hours', now())
Die Datumsformate werden im Format 'YYYY-MM-DD HH:mm+TZ' übergeben (z.B. '2025-02-01 00:00+01')

EXAMPLES:
GET /api/customer-hourly-avg?key=your-key&limit=48&customer_id=2ea4ba70-647a-11ef-8cd8-8b580d9aa086
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
