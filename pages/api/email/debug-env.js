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

    // Alle relevanten Umgebungsvariablen prüfen
    const envVars = {
      // OAuth2
      OAUTH_TENANT_ID: {
        value: process.env.OAUTH_TENANT_ID,
        status: process.env.OAUTH_TENANT_ID ? '✓ Set' : '✗ Missing',
        description: 'Azure Tenant ID (Verzeichnis-ID)'
      },
      OAUTH_CLIENT_ID: {
        value: process.env.OAUTH_CLIENT_ID,
        status: process.env.OAUTH_CLIENT_ID ? '✓ Set' : '✗ Missing',
        description: 'Azure Client ID (Anwendungs-ID)'
      },
      OAUTH_CLIENT_SECRET: {
        value: process.env.OAUTH_CLIENT_SECRET ? '***HIDDEN***' : null,
        status: process.env.OAUTH_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
        description: 'Azure Client Secret'
      },
      OAUTH_AUTHORIZATION_CODE: {
        value: process.env.OAUTH_AUTHORIZATION_CODE ? '***HIDDEN***' : null,
        status: process.env.OAUTH_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
        description: 'OAuth2 Authorization Code (läuft nach 10 Min ab)'
      },
      OAUTH_REDIRECT_URI: {
        value: process.env.OAUTH_REDIRECT_URI,
        status: process.env.OAUTH_REDIRECT_URI ? '✓ Set' : '✗ Missing',
        description: 'OAuth2 Redirect URI'
      },
      
      // SMTP
      SMTP_USER: {
        value: process.env.SMTP_USER,
        status: process.env.SMTP_USER ? '✓ Set' : '✗ Missing',
        description: 'SMTP Benutzername (E-Mail-Adresse)'
      },
      SMTP_FROM: {
        value: process.env.SMTP_FROM,
        status: process.env.SMTP_FROM ? '✓ Set' : '✗ Missing',
        description: 'Absender-E-Mail-Adresse'
      },
      
      // App Password (Alternative)
      SMTP_PASS: {
        value: process.env.SMTP_PASS ? '***HIDDEN***' : null,
        status: process.env.SMTP_PASS ? '✓ Set' : '✗ Missing',
        description: 'App Password (Alternative zu OAuth2)'
      }
    };

    // Status zusammenfassen
    const missingOAuth2 = ['OAUTH_TENANT_ID', 'OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_AUTHORIZATION_CODE', 'OAUTH_REDIRECT_URI']
      .filter(varName => !process.env[varName]);
    
    const missingSMTP = ['SMTP_USER'].filter(varName => !process.env[varName]);
    
    const hasAppPassword = !!process.env.SMTP_PASS;
    const hasOAuth2 = missingOAuth2.length === 0;

    return res.status(200).json({
      success: true,
      message: 'Environment variables check completed',
      summary: {
        oauth2: hasOAuth2 ? '✓ Complete' : `✗ Missing ${missingOAuth2.length} variables`,
        smtp: missingSMTP.length === 0 ? '✓ Complete' : `✗ Missing ${missingSMTP.length} variables`,
        appPassword: hasAppPassword ? '✓ Available' : '✗ Not set',
        recommendation: hasOAuth2 ? 'Use OAuth2' : hasAppPassword ? 'Use App Password' : 'Configure either OAuth2 or App Password'
      },
      details: envVars,
      missing: {
        oauth2: missingOAuth2,
        smtp: missingSMTP
      },
      nextSteps: hasOAuth2 ? [
        'Test OAuth2 connection with /api/email/test-oauth2',
        'Send test email with /api/email/send-simple-oauth2'
      ] : hasAppPassword ? [
        'Use App Password with simple SMTP',
        'Set SMTP_USER and SMTP_PASS in .env'
      ] : [
        'Configure either OAuth2 or App Password',
        'See OFFICE365_SMTP_SETUP.md for instructions'
      ]
    });

  } catch (error) {
    console.error('Error checking environment variables:', error);
    
    return res.status(500).json({
      error: 'Failed to check environment variables',
      details: error.message
    });
  }
}
