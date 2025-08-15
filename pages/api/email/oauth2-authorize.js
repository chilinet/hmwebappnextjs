import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authentifizierung prüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // OAuth2-Konfiguration prüfen
    const requiredEnvVars = [
      'OAUTH_TENANT_ID',
      'OAUTH_CLIENT_ID', 
      'OAUTH_REDIRECT_URI'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      return res.status(400).json({
        error: 'Missing OAuth2 environment variables',
        missing: missingVars
      });
    }

    // Authorization URL generieren
    const authUrl = `https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/authorize?` +
      `client_id=${process.env.OAUTH_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(process.env.OAUTH_REDIRECT_URI)}&` +
      `scope=${encodeURIComponent('https://outlook.office.com/SMTP.Send offline_access')}&` +
      `state=${Date.now()}`;

    return res.status(200).json({
      success: true,
      message: 'OAuth2 authorization URL generated',
      authUrl: authUrl,
      instructions: [
        '1. Öffnen Sie diese URL in einem Browser',
        '2. Melden Sie sich mit Ihrem Office365-Konto an',
        '3. Autorisieren Sie die App',
        '4. Kopieren Sie den "code" Parameter aus der URL',
        '5. Fügen Sie ihn in Ihre .env Datei ein als OAUTH_AUTHORIZATION_CODE'
      ],
      config: {
        tenant_id: process.env.OAUTH_TENANT_ID,
        client_id: process.env.OAUTH_CLIENT_ID,
        redirect_uri: process.env.OAUTH_REDIRECT_URI
      }
    });

  } catch (error) {
    console.error('Error generating OAuth2 authorization URL:', error);
    
    return res.status(500).json({
      error: 'Failed to generate authorization URL',
      details: error.message
    });
  }
}
