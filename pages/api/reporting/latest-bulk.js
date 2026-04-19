import { getPgConnection } from '../../../lib/pgdb.js';
import { debugLog, debugWarn, isAppDebugEnabled } from '../../../lib/appDebug';

const MODULE_TAG = 'pages/api/reporting/latest-bulk.js';
const PRESHARED_KEY = process.env.REPORTING_PRESHARED_KEY || 'default-reporting-key-2024';
const MAX_ENTITY_IDS = 500;

/** curl + Payload für Logs (Key nur als $REPORTING_PRESHARED_KEY, nicht im Klartext). */
function buildCurlReplay(req, entity_ids) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http')
    .split(',')[0]
    .trim();
  const host = req.headers.host || 'localhost:3000';
  const url = `${proto}://${host}/api/reporting/latest-bulk`;
  const body = JSON.stringify({ entity_ids });
  return (
    `curl -sS -X POST ${JSON.stringify(url)} \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  -H "Authorization: Bearer $REPORTING_PRESHARED_KEY" \\\n` +
    `  -d ${JSON.stringify(body)}`
  );
}

function shouldLogLatestBulkVerbose() {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.REPORTING_LATEST_BULK_LOG === '1' ||
    process.env.REPORTING_LATEST_BULK_LOG === 'true' ||
    isAppDebugEnabled()
  );
}

function logLatestBulkRequest(req, entity_ids) {
  if (!shouldLogLatestBulkVerbose()) return;

  const maxList = 40;
  const list =
    entity_ids.length <= maxList
      ? entity_ids
      : [...entity_ids.slice(0, maxList), `… +${entity_ids.length - maxList} weitere`];

  console.log(`[${MODULE_TAG}] request`);
  console.log(`[${MODULE_TAG}] entity_ids count:`, entity_ids.length);
  console.log(`[${MODULE_TAG}] entity_ids:`, list);
  console.log(`[${MODULE_TAG}] curl (im Shell zuvor: export REPORTING_PRESHARED_KEY='…'):`);
  console.log(buildCurlReplay(req, entity_ids));
}

function authenticateRequest(req) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === PRESHARED_KEY;
  }
  if (apiKey) {
    return apiKey === PRESHARED_KEY;
  }
  if (req.query.key) {
    return req.query.key === PRESHARED_KEY;
  }
  return false;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeEntityIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const s = String(item ?? '').trim();
    if (!UUID_RE.test(s) || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
}

/**
 * POST { entity_ids: string[] } — je Entity die neueste Zeile aus hmreporting.device_10m.
 * Gleiche Auth wie /api/reporting. Reduziert N Roundtrips für Heizungssteuerung-Übersicht.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!authenticateRequest(req)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Ungültiger oder fehlender API-Key'
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const entity_ids = normalizeEntityIds(body.entity_ids);

  if (entity_ids.length === 0) {
    return res.status(200).json({
      success: true,
      metadata: { total_records: 0 },
      data: []
    });
  }

  if (entity_ids.length > MAX_ENTITY_IDS) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Maximal ${MAX_ENTITY_IDS} entity_ids pro Anfrage`
    });
  }

  logLatestBulkRequest(req, entity_ids);

  let pool;
  try {
    pool = await getPgConnection();
  } catch (e) {
    debugWarn('latest-bulk: PostgreSQL Pool', e?.message);
    return res.status(503).json({
      success: false,
      error: 'Service unavailable',
      message: 'Reporting-Datenbank nicht erreichbar'
    });
  }

  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    const msg = e?.message || String(e);
    debugWarn('latest-bulk: PostgreSQL connect', msg);
    const isConn =
      /timeout|ECONNREFUSED|ECONNRESET|ENOTFOUND|connect/i.test(msg) ||
      e?.code === 'ECONNREFUSED';
    return res.status(503).json({
      success: false,
      error: 'Service unavailable',
      message: isConn
        ? 'Keine Verbindung zur Reporting-PostgreSQL (PG_* / Netzwerk). Heizungssteuerung nutzt dann Einzelabfragen.'
        : 'Reporting-Datenbank nicht erreichbar',
      details: process.env.NODE_ENV === 'development' ? msg : undefined
    });
  }

  try {
    const sql = `
      SELECT DISTINCT ON (entity_id) *
      FROM hmreporting.device_10m
      WHERE entity_id = ANY($1::uuid[])
      ORDER BY entity_id, bucket_10m DESC
    `;
    const result = await client.query(sql, [entity_ids]);
    debugLog('latest-bulk: rows', result.rows.length, 'for', entity_ids.length, 'ids');

    return res.status(200).json({
      success: true,
      metadata: {
        total_records: result.rows.length,
        requested_ids: entity_ids.length,
        query_time: new Date().toISOString()
      },
      data: result.rows
    });
  } catch (error) {
    console.error('latest-bulk error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.code === '42P01' ? 'Tabelle hmreporting.device_10m fehlt' : 'Abfrage fehlgeschlagen',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client?.release();
  }
}
