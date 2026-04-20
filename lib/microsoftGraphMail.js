/**
 * Microsoft Graph mail send (delegated). Use this instead of SMTP XOAUTH2 when
 * tokens are issued for https://graph.microsoft.com (Mail.Send).
 * SMTP expects outlook.office.com tokens — mixing causes 535 AUTH XOAUTH2 failures.
 */

export const GRAPH_MAIL_SCOPES = 'https://graph.microsoft.com/Mail.Send offline_access';

const GRAPH_AUDIENCE_MARKERS = ['graph.microsoft.com', '00000003-0000-0000-c000-000000000000'];

export function assertAccessTokenForGraphMail(accessToken) {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    const aud = payload.aud;
    const audOk =
      aud && GRAPH_AUDIENCE_MARKERS.some((m) => String(aud).includes(m));
    if (!audOk) {
      throw new Error(
        `Access token is not for Microsoft Graph (aud: ${aud ?? 'missing'}). ` +
          'Re-authorize with Microsoft Graph Mail.Send via /api/email/oauth2-authorize.'
      );
    }
    const scp = String(payload.scp || '');
    if (scp && !scp.includes('Mail.Send')) {
      throw new Error(
        'Access token does not include Mail.Send. Add delegated Mail.Send in Azure and re-authorize.'
      );
    }
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes('not for Microsoft Graph') ||
        e.message.includes('does not include Mail.Send'))
    ) {
      throw e;
    }
  }
}

export async function getMailAccessTokenFromEnvironment() {
  const tenant = process.env.OAUTH_TENANT_ID;
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error('Missing OAUTH_TENANT_ID, OAUTH_CLIENT_ID, or OAUTH_CLIENT_SECRET');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

  let body;
  if (process.env.OAUTH_REFRESH_TOKEN) {
    body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: process.env.OAUTH_REFRESH_TOKEN,
    });
  } else if (process.env.OAUTH_AUTHORIZATION_CODE) {
    const redirectUri = process.env.OAUTH_REDIRECT_URI;
    if (!redirectUri) {
      throw new Error('OAUTH_REDIRECT_URI is required when using OAUTH_AUTHORIZATION_CODE');
    }
    body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: GRAPH_MAIL_SCOPES,
      grant_type: 'authorization_code',
      code: process.env.OAUTH_AUTHORIZATION_CODE,
      redirect_uri: redirectUri,
    });
  } else {
    throw new Error(
      'Set OAUTH_REFRESH_TOKEN or OAUTH_AUTHORIZATION_CODE. Graph needs an Azure AD access token for the mailbox.'
    );
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token request failed: ${response.status} ${errorText}`);
  }

  const tokenJson = await response.json();
  if (tokenJson.access_token) {
    assertAccessTokenForGraphMail(tokenJson.access_token);
  }
  return tokenJson;
}

export async function sendMailViaMicrosoftGraph(accessToken, mailOptions) {
  assertAccessTokenForGraphMail(accessToken);
  const mailboxUser = process.env.SMTP_USER;
  if (!mailboxUser) {
    throw new Error('SMTP_USER must be the mailbox UPN that authorized the app');
  }

  const { to, subject, text, html, from } = mailOptions;
  if (!to || !subject || (!text && !html)) {
    throw new Error('Missing to, subject, and either text or html');
  }

  const toRecipients = String(to)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));

  const contentType = html ? 'HTML' : 'Text';
  const content = html || text || '';

  const message = {
    subject,
    body: { contentType, content },
    toRecipients,
  };

  const effectiveFrom = from || process.env.SMTP_FROM || mailboxUser;
  if (effectiveFrom && effectiveFrom.toLowerCase() !== mailboxUser.toLowerCase()) {
    message.from = { emailAddress: { address: effectiveFrom } };
  }

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUser)}/sendMail`;

  const graphResponse = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      saveToSentItems: true,
    }),
  });

  if (!graphResponse.ok) {
    const errText = await graphResponse.text();
    let detail = errText;
    try {
      const j = JSON.parse(errText);
      detail = j.error?.message || errText;
    } catch (_) {
      /* keep raw */
    }
    throw new Error(`Microsoft Graph sendMail failed (${graphResponse.status}): ${detail}`);
  }

  return {
    messageId: null,
    status: graphResponse.status,
  };
}
