import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { getConnection, getMssqlConfig } from '../../../../../lib/db';

const FETCH_TIMEOUT_MS = 5000;

async function loadThingsstackConnection(pool, db) {
  const tableVariants = [`${db}.dbo.nwconnections`, 'dbo.nwconnections', 'nwconnections'];
  let lastErr = null;
  for (const tableName of tableVariants) {
    try {
      const result = await pool.request().query(`
        SELECT TOP 1 [APIkey] AS apiKey, [url]
        FROM ${tableName}
        WHERE LOWER(LTRIM(RTRIM([name]))) = 'thingsstack'
        ORDER BY [nwconnection_id] DESC
      `);
      if (result.recordset?.length > 0) return result.recordset[0];
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, '');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session?.token) return res.status(401).json({ error: 'Nicht authentifiziert' });

  try {
    const pool = await getConnection();
    const db = getMssqlConfig().database;
    const connection = await loadThingsstackConnection(pool, db);
    if (!connection) return res.status(404).json({ error: 'Thingsstack Verbindung nicht gefunden' });

    const apiKey = String(connection.apiKey || '').trim();
    const baseUrl = normalizeBaseUrl(connection.url);
    if (!apiKey || !baseUrl) return res.status(400).json({ error: 'Thingsstack Verbindung unvollständig' });

    const url = `${baseUrl}/api/v3/dr/brands?page=1&limit=200`;
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Thingsstack Device Repository Fehler', details: text || response.statusText });
    }

    const body = await response.json().catch(() => ({}));
    const brands = Array.isArray(body?.brands) ? body.brands : [];
    const options = brands
      .map((b) => {
        const brandId = b?.brand_id;
        if (!brandId) return null;
        const name = b?.name || brandId;
        return { value: brandId, label: `${name} (${brandId})` };
      })
      .filter(Boolean);

    return res.status(200).json({ brands: options });
  } catch (err) {
    return res.status(500).json({ error: 'Fehler beim Laden der Device Repository Brands', details: err.message });
  }
}

