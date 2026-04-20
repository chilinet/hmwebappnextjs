import {
  GRAPH_MAIL_SCOPES,
  assertAccessTokenForGraphMail,
  sendMailViaMicrosoftGraph,
} from './microsoftGraphMail';

class OAuth2Helper {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
  }

  async ensureFreshAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return;
    }
    await this.refreshAccessToken();
  }

  async refreshAccessToken() {
    try {
      const tenant = process.env.OAUTH_TENANT_ID;
      const clientId = process.env.OAUTH_CLIENT_ID;
      const clientSecret = process.env.OAUTH_CLIENT_SECRET;
      if (!tenant || !clientId || !clientSecret) {
        throw new Error('Missing OAUTH_TENANT_ID, OAUTH_CLIENT_ID, or OAUTH_CLIENT_SECRET');
      }

      const refreshToUse =
        this.refreshToken || process.env.OAUTH_REFRESH_TOKEN || null;

      let response;
      if (refreshToUse) {
        response = await fetch(
          `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: 'refresh_token',
              refresh_token: refreshToUse,
            }),
          }
        );
      } else if (process.env.OAUTH_AUTHORIZATION_CODE) {
        const redirectUri = process.env.OAUTH_REDIRECT_URI;
        if (!redirectUri) {
          throw new Error(
            'OAUTH_REDIRECT_URI is required when using OAUTH_AUTHORIZATION_CODE'
          );
        }
        response = await fetch(
          `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              scope: GRAPH_MAIL_SCOPES,
              grant_type: 'authorization_code',
              code: process.env.OAUTH_AUTHORIZATION_CODE,
              redirect_uri: redirectUri,
            }),
          }
        );
      } else {
        throw new Error(
          'Set OAUTH_REFRESH_TOKEN or OAUTH_AUTHORIZATION_CODE (Microsoft Graph mail).'
        );
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Token refresh response:', response.status, errorText);

        if (response.status === 400) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error === 'invalid_grant') {
              if (errorData.error_description?.includes('AADSTS9002313')) {
                throw new Error(
                  'OAuth2 request is malformed. Please check your configuration and get a new authorization code.'
                );
              }
              if (errorData.error_description?.includes('AADSTS70008')) {
                throw new Error(
                  'Refresh token has expired. Please get a new authorization code.'
                );
              }
              throw new Error(
                `OAuth2 invalid_grant error: ${errorData.error_description}`
              );
            }
          } catch (parseError) {
            if (parseError instanceof Error && parseError.name !== 'SyntaxError') {
              throw parseError;
            }
          }
        }

        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json();
      if (tokenData.access_token) {
        assertAccessTokenForGraphMail(tokenData.access_token);
      }
      this.accessToken = tokenData.access_token;
      this.refreshToken =
        tokenData.refresh_token || refreshToUse || this.refreshToken;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000;
    } catch (error) {
      console.error('Error refreshing OAuth2 token:', error);
      throw error;
    }
  }

  async sendMail(mailOptions) {
    await this.ensureFreshAccessToken();
    return sendMailViaMicrosoftGraph(this.accessToken, mailOptions);
  }
}

export default new OAuth2Helper();
export { GRAPH_MAIL_SCOPES } from './microsoftGraphMail';
export {
  getMailAccessTokenFromEnvironment,
  sendMailViaMicrosoftGraph,
} from './microsoftGraphMail';
