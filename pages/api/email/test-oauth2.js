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
      'OAUTH_CLIENT_SECRET',
      'OAUTH_AUTHORIZATION_CODE',
      'OAUTH_REDIRECT_URI',
      'SMTP_USER'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      return res.status(400).json({
        error: 'Missing OAuth2 environment variables',
        missing: missingVars
      });
    }

    // OAuth2-Token-Test
    try {
      const tokenResponse = await fetch(`https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.OAUTH_CLIENT_ID,
          client_secret: process.env.OAUTH_CLIENT_SECRET,
          scope: 'https://outlook.office.com/SMTP.Send offline_access',
          grant_type: 'authorization_code',
          code: process.env.OAUTH_AUTHORIZATION_CODE,
          redirect_uri: process.env.OAUTH_REDIRECT_URI,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        return res.status(400).json({
          error: 'OAuth2 token request failed',
          status: tokenResponse.status,
          details: errorText
        });
      }

      const tokenData = await tokenResponse.json();
      
      return res.status(200).json({
        success: true,
        message: 'OAuth2 connection successful',
        tokenInfo: {
          access_token: tokenData.access_token ? '✓ Present' : '✗ Missing',
          refresh_token: tokenData.refresh_token ? '✓ Present' : '✗ Missing',
          expires_in: tokenData.expires_in,
          token_type: tokenData.token_type
        },
        config: {
          tenant_id: process.env.OAUTH_TENANT_ID,
          client_id: process.env.OAUTH_CLIENT_ID,
          redirect_uri: process.env.OAUTH_REDIRECT_URI,
          smtp_user: process.env.SMTP_USER
        }
      });

    } catch (tokenError) {
      return res.status(500).json({
        error: 'OAuth2 token test failed',
        details: tokenError.message
      });
    }

  } catch (error) {
    console.error('Error testing OAuth2 connection:', error);
    
    return res.status(500).json({
      error: 'Failed to test OAuth2 connection',
      details: error.message
    });
  }
}
