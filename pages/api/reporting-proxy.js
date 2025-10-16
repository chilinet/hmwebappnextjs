// Proxy für Reporting API um CORS-Probleme zu vermeiden
export default async function handler(req, res) {
  // CORS-Header setzen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  
  // OPTIONS-Request für CORS Preflight behandeln
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // URL für den Server zusammenbauen
    const serverUrl = 'https://webapptest.heatmanager.cloud/api/reporting';
    const queryString = new URLSearchParams(req.query).toString();
    const fullUrl = `${serverUrl}?${queryString}`;
    
    console.log('Proxying request to:', fullUrl);
    
    // Request an den Server weiterleiten
    const response = await fetch(fullUrl, {
      method: req.method,
      headers: {
        'Authorization': req.headers.authorization || '',
        'X-API-Key': req.headers['x-api-key'] || '',
        'Content-Type': 'application/json'
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined
    });
    
    const data = await response.json();
    
    // Response mit gleichem Status Code zurückgeben
    res.status(response.status).json(data);
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Proxy Error',
      message: 'Fehler beim Weiterleiten der Anfrage an den Server',
      details: error.message
    });
  }
}
