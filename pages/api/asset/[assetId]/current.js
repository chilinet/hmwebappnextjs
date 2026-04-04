import jwt from 'jsonwebtoken';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../lib/authOptions';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';
import { findTreeNodeByAssetId } from '../../../../lib/roomAggregatedTimeseries';
import { fetchTbHeatingSnapshotAttributes } from '../../../../lib/tbAssetHeatingSnapshotAttributes';
import {
  buildAssetRoomDevicesSnapshot,
  parseWeeklyScheduleJson,
  parseWindowStatesObject,
  summarizeWindows
} from '../../../../lib/assetRoomDevicesSnapshot';

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

/**
 * GET /api/asset/:assetId/current
 *
 * Aktuelle Werte wie Heating-Control (Raum, Geräte, run_status, Fenster, Wochenplan).
 * Alle Live-Felder stehen unter **current** im JSON (success, asset_id, customer_id bleiben oben).
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

  const reportingKey = process.env.REPORTING_PRESHARED_KEY;
  if (!reportingKey) {
    return res.status(503).json({
      success: false,
      message: 'REPORTING_PRESHARED_KEY nicht gesetzt'
    });
  }

  try {
    const pool = await getConnection();
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

    const extNorm =
      extTempDevice != null && String(extTempDevice).trim() !== ''
        ? String(extTempDevice).trim()
        : null;

    const [tbAttrs, snapshot] = await Promise.all([
      fetchTbHeatingSnapshotAttributes(assetId, auth.tbToken),
      buildAssetRoomDevicesSnapshot({
        operationalMode,
        extTempDevice: extNorm,
        relatedDevices,
        reportingKey
      })
    ]);

    const windowStatesRaw = tbAttrs.windowStates;
    const windowStates = parseWindowStatesObject(windowStatesRaw);

    return res.status(200).json({
      success: true,
      asset_id: String(assetId),
      customer_id: auth.customerId,
      current: {
        operational_mode: Number(operationalMode),
        ext_temp_device:
          Number(operationalMode) === 2 || Number(operationalMode) === 10 ? extNorm : null,
        room: snapshot.room,
        devices: snapshot.devices,
        external_temperature_device: snapshot.external_temperature_device,
        run_status: tbAttrs.runStatus ?? null,
        window_sensor:
          typeof tbAttrs.windowSensor === 'boolean'
            ? tbAttrs.windowSensor
            : tbAttrs.windowSensor != null
              ? Boolean(tbAttrs.windowSensor)
              : null,
        windows: {
          states: windowStates,
          summary: summarizeWindows(windowStates)
        },
        weekly_schedule: {
          standard: parseWeeklyScheduleJson(tbAttrs.schedulerPlan),
          pir: parseWeeklyScheduleJson(tbAttrs.schedulerPlanPIR)
        }
      }
    });
  } catch (error) {
    console.error('[asset/current]', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Ermitteln des aktuellen Snapshots',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
