import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, html, from } = req.body;

    // Validierung der E-Mail-Parameter
    if (!to || !subject || !html) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, and html are required' 
      });
    }

    // OAuth2-Konfiguration prüfen
    const requiredEnvVars = [
      'OAUTH_TENANT_ID',
      'OAUTH_CLIENT_ID', 
      'OAUTH_CLIENT_SECRET',
      'SMTP_USER'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing OAuth2 environment variables:', missingVars);
      return res.status(400).json({
        error: 'Missing OAuth2 environment variables',
        missing: missingVars
      });
    }

    // E-Mail-Optionen vorbereiten
    const mailOptions = {
      from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to,
      subject: subject,
      html: html,
    };

    console.log('Sending password reset email via OAuth2:', {
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
    } else if (process.env.OAUTH_AUTHORIZATION_CODE) {
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
          redirect_uri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/email/oauth2-callback',
        }),
      });
    } else {
      return res.status(400).json({
        error: 'No OAuth2 authentication method available',
        details: 'Either OAUTH_REFRESH_TOKEN or OAUTH_AUTHORIZATION_CODE must be set'
      });
    }

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token acquisition failed:', tokenResponse.status, errorText);
      
      let errorDetails = 'Token acquisition failed';
      let solution = 'Check your OAuth2 configuration';
      
      if (tokenResponse.status === 400) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error === 'invalid_grant') {
            if (process.env.OAUTH_REFRESH_TOKEN) {
              errorDetails = 'Refresh token has expired or is invalid';
              solution = 'Get a new authorization code and refresh token';
            } else {
              errorDetails = 'Authorization code has expired or is invalid';
              solution = 'Get a new authorization code';
            }
          }
        } catch (parseError) {
          // Fallback für nicht-JSON Fehler
        }
      }
      
      return res.status(400).json({
        error: errorDetails,
        details: errorText,
        solution: solution
      });
    }

    const tokenData = await tokenResponse.json();
    console.log('OAuth2 token acquired successfully');

    // Prüfen, ob wir einen neuen Refresh Token erhalten haben
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
        tenantId: process.env.OAUTH_TENANT_ID,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || process.env.OAUTH_REFRESH_TOKEN,
        expires: Date.now() + (tokenData.expires_in * 1000),
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      }
    });

    // E-Mail senden
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully:', info.messageId);

    return res.status(200).json({
      success: true,
      message: 'Password reset email sent successfully',
      messageId: info.messageId,
      method: 'OAuth2',
      tokenInfo: {
        accessToken: tokenData.access_token ? '✓ Present' : '✗ Missing',
        refreshToken: tokenData.refresh_token ? '✓ Present' : '✗ Missing',
        expiresIn: tokenData.expires_in,
        tokenType: tokenData.token_type
      }
    });

  } catch (error) {
    console.error('Error sending password reset email:', error);
    
    return res.status(500).json({
      error: 'Failed to send password reset email',
      details: error.message
    });
  }
}
