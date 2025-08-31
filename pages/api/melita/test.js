export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Melita.io Konfiguration anzeigen
    const config = {
      MELITA_API_KEY: process.env.MELITA_API_KEY ? 'Set' : 'NOT SET',
      MELITA_BASE_URL: process.env.MELITA_BASE_URL || 'NOT SET',
      timestamp: new Date().toISOString()
    };

    // API-Key-Maskierung (zeigt nur die ersten und letzten 4 Zeichen)
    if (process.env.MELITA_API_KEY) {
      const apiKey = process.env.MELITA_API_KEY;
      config.MELITA_API_KEY_MASKED = `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
    }

    // Base-URL-Validierung
    if (process.env.MELITA_BASE_URL) {
      try {
        const url = new URL(process.env.MELITA_BASE_URL);
        config.URL_VALIDATION = {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 'default',
          pathname: url.pathname || '/'
        };
      } catch (error) {
        config.URL_VALIDATION = { error: 'Invalid URL format' };
      }
    }

    // Test-Request simulieren
    if (process.env.MELITA_API_KEY && process.env.MELITA_BASE_URL) {
      config.TEST_REQUEST = {
        url: `${process.env.MELITA_BASE_URL}/api/iot-gateway/auth/generate`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MELITA_API_KEY.substring(0, 8)}...`
        }
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Melita.io configuration test',
      config: config
    });

  } catch (error) {
    console.error('[MELITA TEST] Error:', error);
    return res.status(500).json({
      error: 'Configuration test failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
