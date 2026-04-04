import jwt from 'jsonwebtoken';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/authOptions';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';
import {
  findTreeNodeByAssetId,
  buildRoomAggregatedTimeseries
} from '../../../../lib/roomAggregatedTimeseries';

async function resolveTbTokenAndCustomer(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim();
    try {
      const decoded = jwt.verify(raw, process.env.NEXTAUTH_SECRET);
      if (decoded.tbToken && decoded.customerid != null) {
        return { tbToken: decoded.tbToken, customerId: String(decoded.customerid) };
      }
    } catch {
      /* Session versuchen */
    }
  }
  const session = await getServerSession(req, res, authOptions);
  if (session?.tbToken && session?.user?.customerid != null) {
    return { tbToken: session.tbToken, customerId: String(session.user.customerid) };
  }
  return null;
}

async function fetchAssetOperationalFields(assetId, tbToken) {
  const TB = process.env.THINGSBOARD_URL;
  if (!TB || !tbToken) return { operationalMode: null, extTempDevice: null };
  const keys = 'operationalMode,extTempDevice';
  const url = `${TB}/api/plugins/telemetry/ASSET/${assetId}/values/attributes/SERVER_SCOPE?keys=${encodeURIComponent(keys)}`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Authorization': `Bearer ${tbToken}` }
    });
    if (!res.ok) return { operationalMode: null, extTempDevice: null };
    const arr = await res.json();
    const out = { operationalMode: null, extTempDevice: null };
    for (const row of arr || []) {
      if (row.key === 'operationalMode') out.operationalMode = row.value;
      if (row.key === 'extTempDevice') out.extTempDevice = row.value;
    }
    return out;
  } catch {
    return { operationalMode: null, extTempDevice: null };
  }
}

function metadataTimezone(sampleBucket) {
  const fromEnv = process.env.REPORTING_DATA_TIMEZONE?.trim();
  if (fromEnv) return fromEnv;
  if (sampleBucket != null && typeof sampleBucket === 'string' && sampleBucket.trim().endsWith('Z')) {
    return 'UTC';
  }
  return 'UTC';
}

/**
 * GET /api/asset/:assetId/timeseries
 *
 * Verdichtete Zeitreihen auf Raum-/Asset-Ebene (wie Temperatur-Chart in heating-control.js).
 * Antwort **timeseries**: sortiert nach timestamp; pro Eintrag optional sensor_temperature, target_temperature, percent_valve_open.
 * Query: start_date, end_date, limit, offset — wie /api/devices/timeseries.
 * entity_id optional, muss sonst der assetId im Pfad entsprechen.
 * Ohne start_date: range bzw. time_range (1d … 90d, Default 7d) bestimmt start_date.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const auth = await resolveTbTokenAndCustomer(req, res);
  if (!auth) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated',
      error: 'Session oder Bearer-JWT mit tbToken und customerid erforderlich'
    });
  }

  const { assetId } = req.query;
  if (!assetId || String(assetId).trim() === '') {
    return res.status(400).json({ success: false, message: 'assetId fehlt' });
  }

  const assetIdNorm = String(assetId).replace(/-/g, '').toLowerCase();
  const entityQ = req.query.entity_id;
  if (entityQ != null && String(entityQ).trim() !== '') {
    const entityNorm = String(entityQ).replace(/-/g, '').toLowerCase();
    if (entityNorm !== assetIdNorm) {
      return res.status(400).json({
        success: false,
        message: 'entity_id muss der assetId im Pfad entsprechen oder weggelassen werden'
      });
    }
  }

  const reportingKey = process.env.REPORTING_PRESHARED_KEY;
  if (!reportingKey) {
    return res.status(503).json({
      success: false,
      message: 'REPORTING_PRESHARED_KEY nicht gesetzt'
    });
  }

  const startDateParam =
    req.query.start_date != null && String(req.query.start_date).trim() !== ''
      ? String(req.query.start_date).trim()
      : null;
  const endDateParam =
    req.query.end_date != null && String(req.query.end_date).trim() !== ''
      ? String(req.query.end_date).trim()
      : null;
  const limitParam =
    req.query.limit != null && String(req.query.limit).trim() !== ''
      ? req.query.limit
      : null;
  const offsetParam =
    req.query.offset != null && String(req.query.offset).trim() !== ''
      ? req.query.offset
      : null;

  const rangeRaw = req.query.range || req.query.time_range || '7d';
  const timeRange = String(rangeRaw);

  let pool;
  try {
    pool = await getConnection();
    const treeResult = await pool.request()
      .input('customer_id', sql.UniqueIdentifier, auth.customerId)
      .query(`
        SELECT tree
        FROM customer_settings
        WHERE customer_id = @customer_id
      `);

    if (treeResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Keine Struktur für diesen Kunden'
      });
    }

    const tree = JSON.parse(treeResult.recordset[0].tree);
    const treeNode = findTreeNodeByAssetId(tree, assetId);
    if (!treeNode) {
      return res.status(404).json({
        success: false,
        message: 'Asset nicht in der Kundenstruktur gefunden',
        asset_id: String(assetId)
      });
    }

    const tbFields = await fetchAssetOperationalFields(assetId, auth.tbToken);
    const operationalMode =
      tbFields.operationalMode ??
      treeNode.data?.operationalMode ??
      treeNode.operationalMode ??
      0;
    const extTempDevice =
      tbFields.extTempDevice ??
      treeNode.data?.extTempDevice ??
      treeNode.extTempDevice ??
      null;

    const relatedDevices =
      treeNode.relatedDevices ?? treeNode.data?.relatedDevices ?? [];

    const aggregated = await buildRoomAggregatedTimeseries({
      operationalMode,
      extTempDevice: extTempDevice != null && String(extTempDevice).trim() !== ''
        ? String(extTempDevice).trim()
        : null,
      relatedDevices,
      timeRange: startDateParam ? undefined : timeRange,
      start_date: startDateParam || undefined,
      end_date: endDateParam || undefined,
      limit: limitParam != null ? limitParam : undefined,
      offset: offsetParam != null ? offsetParam : undefined,
      reportingKey
    });

    return res.status(200).json({
      success: true,
      asset_id: String(assetId),
      customer_id: auth.customerId,
      operational_mode: aggregated.operationalMode,
      ext_temp_device: aggregated.operationalMode === 2 || aggregated.operationalMode === 10
        ? extTempDevice
        : null,
      time_range: startDateParam ? null : timeRange,
      query: {
        ...aggregated.reportingQuery,
        entity_id: String(assetId)
      },
      range: {
        start_date: aggregated.startDate,
        end_date: aggregated.endDate,
        start_time_ms: aggregated.startTimeMs,
        end_time_ms: aggregated.endTimeMs
      },
      metadata: {
        timezone: metadataTimezone(null)
      },
      timeseries: aggregated.timeseries
    });
  } catch (error) {
    console.error('[asset/timeseries]', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler bei der Verdichtung',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
