/**
 * Melita.io API authentication.
 * Obtains an auth token via POST /api/iot-gateway/auth/generate with ApiKey header.
 * Used by Melita API calls (contracts, downlink, etc.) which require Bearer token, not raw API key.
 */

const MELITA_AUTH_ENDPOINT = '/api/iot-gateway/auth/generate';

let tokenCache = {
  authToken: null,
  expiry: 0,
};

/**
 * Get a valid Melita auth token (cached). Uses MELITA_API_KEY and MELITA_BASE_URL from env.
 * @returns {Promise<string>} authToken
 */
export async function getMelitaToken() {
  const apiKey = process.env.MELITA_API_KEY;
  const baseUrl = (process.env.MELITA_BASE_URL || '').replace(/\/+$/, '');

  if (!apiKey || !baseUrl) {
    throw new Error('MELITA_API_KEY and MELITA_BASE_URL must be set in .env');
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.authToken && tokenCache.expiry > now) {
    return tokenCache.authToken;
  }

  const authUrl = `${baseUrl}${MELITA_AUTH_ENDPOINT}`;
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'accept': '*/*',
      'ApiKey': apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Melita auth failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const authToken = data.authToken;
  const expiry = data.expiry;

  if (!authToken) {
    throw new Error('Melita auth response missing authToken');
  }

  tokenCache = { authToken, expiry: expiry || now + 3600 };
  return authToken;
}
