// Proxy für Reporting API um CORS-Probleme zu vermeiden
import { fetchReportingUpstream } from '../../lib/reportingUpstream';

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
    const { status, data } = await fetchReportingUpstream({
      query: req.query,
      method: req.method,
      body: req.method === 'POST' ? req.body : undefined,
      forwardHeaders: {
        authorization: req.headers.authorization,
        xApiKey: req.headers['x-api-key']
      }
    });

    return res.status(status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Proxy Error',
      message: 'Fehler beim Weiterleiten der Anfrage an den Server',
      details: error.message
    });
  }
}
