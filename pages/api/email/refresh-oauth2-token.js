import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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
      'OAUTH_CLIENT_SECRET',
      'OAUTH_REFRESH_TOKEN'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      return res.status(400).json({
        error: 'Missing OAuth2 environment variables',
        missing: missingVars
      });
    }

    console.log('Refreshing OAuth2 token...');

    // Refresh Token verwenden, um neuen Access Token zu holen
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.OAUTH_CLIENT_ID,
        client_secret: process.env.OAUTH_CLIENT_SECRET,
        scope: 'https://outlook.office.com/SMTP.Send offline_access',
        grant_type: 'refresh_token',
        refresh_token: process.env.OAUTH_REFRESH_TOKEN,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token refresh failed:', tokenResponse.status, errorText);
      
      // Spezifische Fehlerbehandlung
      if (tokenResponse.status === 400) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error === 'invalid_grant') {
            return res.status(400).json({
              error: 'Refresh token has expired',
              details: 'Your refresh token has expired and needs to be renewed',
              solution: 'Get a new authorization code and refresh token',
              steps: [
                '1. Go to /admin/email-test',
                '2. Click "OAuth2-URL generieren"',
                '3. Get new authorization code',
                '4. Update OAUTH_AUTHORIZATION_CODE in .env',
                '5. Restart app and get new refresh token'
              ]
            });
          }
        } catch (parseError) {
          // Fallback für nicht-JSON Fehler
        }
      }
      
      return res.status(400).json({
        error: 'Token refresh failed',
        status: tokenResponse.status,
        details: errorText
      });
    }

    const tokenData = await tokenResponse.json();
    console.log('OAuth2 token refreshed successfully');

    // Prüfen, ob wir einen neuen Refresh Token erhalten haben
    const hasNewRefreshToken = tokenData.refresh_token && 
                              tokenData.refresh_token !== process.env.OAUTH_REFRESH_TOKEN;

    return res.status(200).json({
      success: true,
      message: 'OAuth2 token refreshed successfully',
      tokenInfo: {
        access_token: tokenData.access_token ? '✓ Present' : '✗ Missing',
        refresh_token: tokenData.refresh_token ? '✓ Present' : '✗ Missing',
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type
      },
      refreshTokenUpdated: hasNewRefreshToken,
      newRefreshToken: hasNewRefreshToken ? tokenData.refresh_token : null,
      nextSteps: hasNewRefreshToken ? [
        'Update OAUTH_REFRESH_TOKEN in your .env file with the new token',
        'Restart your application',
        'Your OAuth2 authentication will work for another 90 days'
      ] : [
        'Token refreshed successfully',
        'No new refresh token needed',
        'Your OAuth2 authentication continues to work'
      ]
    });

  } catch (error) {
    console.error('Error refreshing OAuth2 token:', error);
    
    return res.status(500).json({
      error: 'Failed to refresh OAuth2 token',
      details: error.message
    });
  }
}
