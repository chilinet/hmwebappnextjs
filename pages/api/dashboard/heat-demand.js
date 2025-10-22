// Preshared Key für Authentifizierung
const PRESHARED_KEY = process.env.REPORTING_PRESHARED_KEY || 'default-reporting-key-2024';
const REPORTING_URL = process.env.REPORTING_URL || 'http://localhost:3000';

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
    
    // HTTP Request an die externe Reporting-API
    const reportingApiUrl = `${REPORTING_URL}/api/customer-hourly-avg`;
    const queryParams = new URLSearchParams({
      customer_id: customer_id,
      start_date: start_date,
      end_date: end_date,
      limit: limit.toString(),
      key: PRESHARED_KEY
    });
    
    const fullUrl = `${reportingApiUrl}?${queryParams.toString()}`;
    
    console.log('Calling external reporting API:', fullUrl);
    
    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': PRESHARED_KEY
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('External API error:', response.status, errorText);
        return res.status(response.status).json({
          error: 'External API Error',
          message: `Reporting API returned ${response.status}`,
          details: errorText
        });
      }
      
      const data = await response.json();
      
      // Metadaten für die Antwort
      const metadata = {
        total_records: data.data?.length || 0,
        limit: parseInt(limit),
        query_time: new Date().toISOString(),
        function_name: 'hmreporting.f_customer_hourly_avg',
        time_range: {
          start_date: start_date,
          end_date: end_date
        },
        external_api: true,
        reporting_url: REPORTING_URL
      };
      
      // Antwort senden
      res.status(200).json({
        success: true,
        metadata: metadata,
        data: data.data || []
      });
      
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      return res.status(503).json({
        error: 'External API Connection Failed',
        message: 'Verbindung zur Reporting-API fehlgeschlagen',
        details: fetchError.message
      });
    }
    
  } catch (error) {
    console.error('Heat Demand API Error:', error);
    
    // Generischer Fehler
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ein interner Fehler ist aufgetreten',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
