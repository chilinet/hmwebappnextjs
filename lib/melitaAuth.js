/**
 * Melita.io API authentication.
 * Obtains an auth token via POST /api/iot-gateway/auth/generate with ApiKey header.
 * Used by Melita API calls (contracts, downlink, etc.) which require Bearer token, not raw API key.
 */

import { getConnection, getMssqlConfig } from './db';

const MELITA_AUTH_ENDPOINT = '/api/iot-gateway/auth/generate';

// Cache per baseUrl+apiKey to avoid mixing tenants/connections.
const tokenCache = new Map(); // key => { authToken, expiry }

async function loadMelitaApiConnectionFromDb() {
  const pool = await getConnection();
  const db = getMssqlConfig().database;

  const tables = [
    { table: `${db}.dbo.nwconnections`, idCol: 'nwconnection_id' },
    { table: `${db}.dbo.mwconnections`, idCol: 'fwconnection_id' },
    { table: 'dbo.nwconnections', idCol: 'nwconnection_id' },
    { table: 'dbo.mwconnections', idCol: 'fwconnection_id' },
    { table: 'nwconnections', idCol: 'nwconnection_id' },
    { table: 'mwconnections', idCol: 'fwconnection_id' },
  ];

  let lastErr = null;

  for (const t of tables) {
    try {
      const result = await pool.request().query(`
        SELECT TOP 1
          [APIkey] AS apiKey,
          [url] AS url
        FROM ${t.table}
        WHERE (
          LOWER(LTRIM(RTRIM([name]))) = 'melita'
          OR LOWER(LTRIM(RTRIM([name2]))) = 'melita'
          OR LOWER(LTRIM(RTRIM([name]))) LIKE '%melita%'
          OR LOWER(LTRIM(RTRIM([name2]))) LIKE '%melita%'
        )
          AND [APIkey] IS NOT NULL
          AND LTRIM(RTRIM([APIkey])) <> ''
          AND [url] IS NOT NULL
          AND LTRIM(RTRIM([url])) <> ''
        ORDER BY ${t.idCol} DESC
      `);

      if (result.recordset?.length > 0) {
        const row = result.recordset[0];
        const apiKey = String(row.apiKey || '').trim();
        const baseUrl = String(row.url || '').trim().replace(/\/+$/, '');
        if (apiKey && baseUrl) return { apiKey, baseUrl };
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    // Keep fallback to env.
    console.warn('Melita DB connection lookup failed:', lastErr.message);
  }
  return null;
}

function loadMelitaApiConnectionFromEnv() {
  const apiKey = process.env.MELITA_API_KEY ? String(process.env.MELITA_API_KEY).trim() : '';
  const baseUrl = process.env.MELITA_BASE_URL ? String(process.env.MELITA_BASE_URL).trim().replace(/\/+$/, '') : '';
  if (!apiKey || !baseUrl) return null;
  return { apiKey, baseUrl };
}

export async function getMelitaApiConnection() {
  const fromDb = await loadMelitaApiConnectionFromDb();
  return fromDb || loadMelitaApiConnectionFromEnv();
}

/**
 * Get a valid Melita auth token (cached).
 * Uses DB credentials from mw/nwconnections (preferred), falling back to env.
 *
 * @param {Object} [opts]
 * @param {string} [opts.apiKey]
 * @param {string} [opts.baseUrl]
 * @returns {Promise<string>} authToken
 */
export async function getMelitaToken(opts = {}) {
  const connection = (opts?.apiKey && opts?.baseUrl) ? { apiKey: opts.apiKey, baseUrl: opts.baseUrl } : await getMelitaApiConnection();
  if (!connection) {
    throw new Error('Melita API credentials missing (DB mw/nwconnections or MELITA_API_KEY/MELITA_BASE_URL in .env)');
  }

  const apiKey = String(connection.apiKey || '').trim();
  const baseUrl = String(connection.baseUrl || '').trim().replace(/\/+$/, '');

  const cacheKey = `${baseUrl}::${apiKey}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached?.authToken && cached.expiry > now) {
    return cached.authToken;
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

  const data = await response.json().catch(() => ({}));
  const authToken = data.authToken;
  const expiry = data.expiry;

  if (!authToken) {
    throw new Error('Melita auth response missing authToken');
  }

  tokenCache.set(cacheKey, { authToken, expiry: expiry || now + 3600 });
  return authToken;
}

