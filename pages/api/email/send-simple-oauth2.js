import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import nodemailer from 'nodemailer';

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

    const { to, subject, text, html, from } = req.body;

    // Validierung der E-Mail-Parameter
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, and either text or html are required' 
      });
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
      console.error('Missing OAuth2 environment variables:', missingVars);
      console.log('Available environment variables:', {
        OAUTH_TENANT_ID: process.env.OAUTH_TENANT_ID ? '✓ Set' : '✗ Missing',
        OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID ? '✓ Set' : '✗ Missing',
        OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET ? '✓ Set' : '✗ Missing',
        OAUTH_AUTHORIZATION_CODE: process.env.OAUTH_AUTHORIZATION_CODE ? '✓ Set' : '✗ Missing',
        OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI ? '✓ Set' : '✗ Missing',
        SMTP_USER: process.env.SMTP_USER ? '✓ Set' : '✗ Missing'
      });
      
      return res.status(400).json({
        error: 'Missing OAuth2 environment variables',
        missing: missingVars,
        available: Object.fromEntries(
          requiredEnvVars.map(varName => [varName, process.env[varName] ? 'Set' : 'Missing'])
        )
      });
    }

    // E-Mail-Optionen vorbereiten
    const mailOptions = {
      from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to,
      subject: subject,
      text: text,
      html: html,
    };

    console.log('Sending email via OAuth2:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    // OAuth2-Token holen - Verwende Refresh Token wenn verfügbar
    let tokenResponse;
    
    if (process.env.OAUTH_REFRESH_TOKEN) {
      // Verwende Refresh Token für neue Access Tokens
      console.log('Using refresh token to get new access token');
      tokenResponse = await fetch(`https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
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
    } else {
      // Erste Authentifizierung mit Authorization Code
      console.log('Using authorization code for initial authentication');
      tokenResponse = await fetch(`https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
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
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('OAuth2 token response:', tokenResponse.status, errorText);
      
      // Spezifische Fehlerbehandlung
      if (tokenResponse.status === 400) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error === 'invalid_grant') {
            if (errorData.error_description?.includes('AADSTS9002313')) {
              return res.status(400).json({
                error: 'OAuth2 request is malformed',
                details: 'Please check your configuration and get a new authorization code',
                solution: 'Visit the authorization URL to get a fresh authorization code'
              });
            } else if (errorData.error_description?.includes('AADSTS70008')) {
              return res.status(400).json({
                error: 'Authorization code has expired',
                details: 'Authorization codes expire after 10 minutes',
                solution: 'Get a new authorization code from the authorization URL'
              });
            } else {
              return res.status(400).json({
                error: 'OAuth2 invalid_grant error',
                details: errorData.error_description
              });
            }
          }
        } catch (parseError) {
          // Fallback für nicht-JSON Fehler
        }
      }
      
      return res.status(400).json({
        error: 'OAuth2 token request failed',
        status: tokenResponse.status,
        details: errorText
      });
    }

    const tokenData = await tokenResponse.json();
    console.log('OAuth2 token received successfully');
    
    // Wenn wir einen Refresh Token erhalten haben, speichern wir ihn
    if (tokenData.refresh_token && !process.env.OAUTH_REFRESH_TOKEN) {
      console.log('Refresh token received - you can now add OAUTH_REFRESH_TOKEN to your .env file');
      console.log('Refresh token:', tokenData.refresh_token);
    }

    // Nodemailer Transporter mit OAuth2 erstellen
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: process.env.SMTP_USER,
        clientId: process.env.OAUTH_CLIENT_ID,
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expires: Date.now() + (tokenData.expires_in * 1000),
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      }
    });

    // E-Mail senden
    const result = await transporter.sendMail(mailOptions);

    console.log('Email sent successfully via OAuth2:', result.messageId);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId,
      method: 'OAuth2',
      tokenInfo: {
        access_token: tokenData.access_token ? '✓ Present' : '✗ Missing',
        refresh_token: tokenData.refresh_token ? '✓ Present' : '✗ Missing',
        expires_in: tokenData.expires_in
      }
    });

  } catch (error) {
    console.error('Error sending email via OAuth2:', error);
    
    return res.status(500).json({
      error: 'Failed to send email',
      details: error.message,
      method: 'OAuth2'
    });
  }
}
