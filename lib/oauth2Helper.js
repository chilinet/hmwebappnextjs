import nodemailer from 'nodemailer';

class OAuth2Helper {
  constructor() {
    this.transporter = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
  }

  async getTransporter() {
    // Prüfe, ob der aktuelle Token noch gültig ist
    if (this.transporter && this.accessToken && Date.now() < this.tokenExpiry) {
      return this.transporter;
    }

    // Erneuere den Token
    await this.refreshAccessToken();
    
    return this.transporter;
  }

  async refreshAccessToken() {
    try {
      let response;
      
      // Wenn wir einen Refresh Token haben, verwende ihn
      if (this.refreshToken) {
        console.log('Using refresh token to get new access token');
        response = await fetch(`https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: process.env.OAUTH_CLIENT_ID,
            client_secret: process.env.OAUTH_CLIENT_SECRET,
            scope: 'https://outlook.office.com/SMTP.Send offline_access',
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken,
          }),
        });
      } else {
        // Erste Authentifizierung mit Authorization Code
        console.log('Using authorization code to get initial tokens');
        response = await fetch(`https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID}/oauth2/v2.0/token`, {
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token refresh response:', response.status, errorText);
        
        // Spezifische Fehlerbehandlung
        if (response.status === 400) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error === 'invalid_grant') {
              if (errorData.error_description?.includes('AADSTS9002313')) {
                throw new Error('OAuth2 request is malformed. Please check your configuration and get a new authorization code.');
              } else if (errorData.error_description?.includes('AADSTS70008')) {
                throw new Error('Refresh token has expired. Please get a new authorization code.');
              } else {
                throw new Error(`OAuth2 invalid_grant error: ${errorData.error_description}`);
              }
            }
          } catch (parseError) {
            // Fallback für nicht-JSON Fehler
          }
        }
        
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();
      console.log('Token response received');
      
      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000; // 1 Minute Puffer

      // Erstelle den Transporter mit dem neuen Token
      this.transporter = nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
          type: 'OAuth2',
          user: process.env.SMTP_USER,
          clientId: process.env.OAUTH_CLIENT_ID,
          clientSecret: process.env.OAUTH_CLIENT_SECRET,
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          expires: this.tokenExpiry,
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false
        }
      });

      console.log('OAuth2 token refreshed successfully');
      
    } catch (error) {
      console.error('Error refreshing OAuth2 token:', error);
      throw error;
    }
  }

  async sendMail(mailOptions) {
    const transporter = await this.getTransporter();
    return transporter.sendMail(mailOptions);
  }
}

export default new OAuth2Helper();
