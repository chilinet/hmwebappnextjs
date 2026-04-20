import { debugLog, debugWarn } from '../../../lib/appDebug';
import {
  getMailAccessTokenFromEnvironment,
  sendMailViaMicrosoftGraph,
} from '../../../lib/microsoftGraphMail';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, html, from } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({
        error: 'Missing required fields: to, subject, and html are required',
      });
    }

    const requiredEnvVars = [
      'OAUTH_TENANT_ID',
      'OAUTH_CLIENT_ID',
      'OAUTH_CLIENT_SECRET',
      'SMTP_USER',
    ];

    const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      console.error('Missing OAuth2 environment variables:', missingVars);
      return res.status(400).json({
        error: 'Missing OAuth2 environment variables',
        missing: missingVars,
      });
    }

    if (!process.env.OAUTH_REFRESH_TOKEN && !process.env.OAUTH_AUTHORIZATION_CODE) {
      return res.status(400).json({
        error: 'Missing credentials for Microsoft Graph mail',
        details:
          'Set OAUTH_REFRESH_TOKEN or OAUTH_AUTHORIZATION_CODE. Mail is sent via Graph API (not SMTP OAuth).',
      });
    }

    const mailOptions = {
      from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    };

    debugLog('Sending password reset email via Microsoft Graph:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
    });

    let tokenData;
    try {
      tokenData = await getMailAccessTokenFromEnvironment();
    } catch (tokenErr) {
      console.error('Token acquisition failed:', tokenErr.message);
      return res.status(400).json({
        error: 'Token acquisition failed',
        details: tokenErr.message,
        solution:
          'Azure: Microsoft Graph delegated Mail.Send. Re-authorize via /api/email/oauth2-authorize if needed.',
      });
    }

    if (tokenData.refresh_token && !process.env.OAUTH_REFRESH_TOKEN) {
      debugLog(
        'Refresh token received - add OAUTH_REFRESH_TOKEN to .env and remove OAUTH_AUTHORIZATION_CODE'
      );
      debugLog('Refresh token:', tokenData.refresh_token);
    }

    const sendResult = await sendMailViaMicrosoftGraph(
      tokenData.access_token,
      mailOptions
    );
    debugLog('Password reset email sent (Graph)', sendResult.status);

    return res.status(200).json({
      success: true,
      message: 'Password reset email sent successfully',
      messageId: sendResult.messageId,
      method: 'Microsoft Graph',
      tokenInfo: {
        accessToken: tokenData.access_token ? 'present' : 'missing',
        refreshToken: tokenData.refresh_token ? 'present' : 'missing',
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type,
      },
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);

    return res.status(500).json({
      error: 'Failed to send password reset email',
      details: error.message,
    });
  }
}
