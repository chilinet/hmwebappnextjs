export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error, error_description } = req.query;

    // Fehlerbehandlung
    if (error) {
      console.error('OAuth2 error:', error, error_description);
      return res.status(400).json({
        error: 'OAuth2 authorization failed',
        details: error_description || error
      });
    }

    // Authorization Code prüfen
    if (!code) {
      return res.status(400).json({
        error: 'No authorization code received',
        details: 'The authorization code is missing from the callback'
      });
    }

    // Erfolgreiche Antwort
    return res.status(200).json({
      success: true,
      message: 'Authorization code received successfully!',
      code: code,
      state: state,
      nextSteps: [
        '1. Kopieren Sie den "code" Wert oben',
        '2. Fügen Sie ihn in Ihre .env Datei ein:',
        '   OAUTH_AUTHORIZATION_CODE=ihr_code_hier',
        '3. Starten Sie die Anwendung neu',
        '4. Testen Sie die E-Mail-Funktionalität'
      ],
      warning: 'Dieser Code läuft in 10 Minuten ab. Verwenden Sie ihn sofort!'
    });

  } catch (error) {
    console.error('Error in OAuth2 callback:', error);
    
    return res.status(500).json({
      error: 'Failed to process OAuth2 callback',
      details: error.message
    });
  }
}
