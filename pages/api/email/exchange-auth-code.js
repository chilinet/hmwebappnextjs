import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

/**
 * One-time: exchange OAUTH_AUTHORIZATION_CODE from .env for tokens (no email).
 * Use when server logs do not show the refresh token or you prefer the JSON body.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const required = [
      'OAUTH_TENANT_ID',
      'OAUTH_CLIENT_ID',
      'OAUTH_CLIENT_SECRET',
      'OAUTH_AUTHORIZATION_CODE',
      'OAUTH_REDIRECT_URI',
    ];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Missing environment variables',
        missing,
      });
    }

    if (process.env.OAUTH_REFRESH_TOKEN) {
      return res.status(400).json({
        error: 'OAUTH_REFRESH_TOKEN is already set',
        details:
          'Remove OAUTH_REFRESH_TOKEN from .env temporarily if you need to exchange a new authorization code.',
      });
    }

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.OAUTH_CLIENT_ID,
          client_secret: process.env.OAUTH_CLIENT_SECRET,
          scope: 'https://graph.microsoft.com/Mail.Send offline_access',
          grant_type: 'authorization_code',
          code: process.env.OAUTH_AUTHORIZATION_CODE,
          redirect_uri: process.env.OAUTH_REDIRECT_URI,
        }),
      }
    );

    const bodyText = await tokenResponse.text();
    if (!tokenResponse.ok) {
      return res.status(400).json({
        error: 'Token exchange failed',
        status: tokenResponse.status,
        details: bodyText,
      });
    }

    let tokenData;
    try {
      tokenData = JSON.parse(bodyText);
    } catch {
      return res.status(500).json({
        error: 'Invalid token response',
        details: bodyText.slice(0, 200),
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Copy refresh_token into .env, then remove OAUTH_AUTHORIZATION_CODE and restart.',
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token || null,
      has_refresh_token: Boolean(tokenData.refresh_token),
      token_type: tokenData.token_type,
      warning:
        'Treat refresh_token as a secret. Do not commit .env. Revoke in Azure if leaked.',
    });
  } catch (error) {
    console.error('exchange-auth-code:', error);
    return res.status(500).json({
      error: 'Exchange failed',
      details: error.message,
    });
  }
}
