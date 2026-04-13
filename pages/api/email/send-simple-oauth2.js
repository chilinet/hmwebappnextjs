import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import {
  getMailAccessTokenFromEnvironment,
  sendMailViaMicrosoftGraph,
} from '../../../lib/microsoftGraphMail';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { to, subject, text, html, from } = req.body;

    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({
        error:
          'Missing required fields: to, subject, and either text or html are required',
      });
    }

    const baseRequired = [
      'OAUTH_TENANT_ID',
      'OAUTH_CLIENT_ID',
      'OAUTH_CLIENT_SECRET',
      'SMTP_USER',
    ];
    const missingBase = baseRequired.filter((varName) => !process.env[varName]);
    if (missingBase.length > 0) {
      return res.status(400).json({
        error: 'Missing OAuth2 environment variables',
        missing: missingBase,
      });
    }

    const hasRefresh = Boolean(process.env.OAUTH_REFRESH_TOKEN);
    const hasCode = Boolean(process.env.OAUTH_AUTHORIZATION_CODE);
    if (!hasRefresh && !hasCode) {
      return res.status(400).json({
        error: 'No token source',
        details:
          'Set OAUTH_REFRESH_TOKEN or OAUTH_AUTHORIZATION_CODE (+ OAUTH_REDIRECT_URI for code).',
      });
    }
    if (hasCode && !process.env.OAUTH_REDIRECT_URI) {
      return res.status(400).json({
        error: 'Missing OAUTH_REDIRECT_URI',
        details: 'Required when using OAUTH_AUTHORIZATION_CODE.',
      });
    }

    const mailOptions = {
      from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    };

    console.log('Sending email via Microsoft Graph:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
    });

    let tokenData;
    try {
      tokenData = await getMailAccessTokenFromEnvironment();
    } catch (tokenErr) {
      console.error('Token error:', tokenErr.message);
      return res.status(400).json({
        error: 'Token request failed',
        details: tokenErr.message,
      });
    }

    if (tokenData.refresh_token && !process.env.OAUTH_REFRESH_TOKEN) {
      console.log(
        'Refresh token received - add OAUTH_REFRESH_TOKEN to .env and remove OAUTH_AUTHORIZATION_CODE'
      );
      console.log('Refresh token:', tokenData.refresh_token);
    }

    const result = await sendMailViaMicrosoftGraph(
      tokenData.access_token,
      mailOptions
    );

    const exposeRefresh =
      tokenData.refresh_token &&
      !process.env.OAUTH_REFRESH_TOKEN &&
      (process.env.NODE_ENV === 'development' ||
        process.env.OAUTH_EXPOSE_REFRESH_TOKEN === 'true');

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId,
      method: 'Microsoft Graph',
      tokenInfo: {
        access_token: tokenData.access_token ? 'present' : 'missing',
        refresh_token: tokenData.refresh_token ? 'present' : 'missing',
        expires_in: tokenData.expires_in,
      },
      ...(exposeRefresh && {
        newRefreshToken: tokenData.refresh_token,
        setupNote:
          'Copy newRefreshToken into .env as OAUTH_REFRESH_TOKEN, remove OAUTH_AUTHORIZATION_CODE, restart.',
      }),
    });
  } catch (error) {
    console.error('Error sending email via Microsoft Graph:', error);

    return res.status(500).json({
      error: 'Failed to send email',
      details: error.message,
      method: 'Microsoft Graph',
    });
  }
}
