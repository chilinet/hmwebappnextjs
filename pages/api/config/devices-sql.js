import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getPgConnection } from '../../../lib/pgdb.js';
import { withPoolRetry } from '../../../lib/db';
import sql from 'mssql';
import {
  SUBTREE_CTE,
  DEVICE_SELECT_BODY,
  normalizeUuid,
  fetchDefaultEntryAssetId
} from '../../../lib/config/devicesSqlShared.js';

/** MSSQL inventory: tbconnectionid → serialnbr (wie pages/api/config/devices/index.js) */
async function getSerialNumbersByTbConnectionIds(deviceIds) {
  const uniqueIds = [...new Set((deviceIds || []).filter(Boolean).map((id) => String(id)))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  return withPoolRetry(async (pool) => {
    const map = new Map();
    const chunkSize = 400;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const request = pool.request();
      const placeholders = chunk.map((_, idx) => {
        const name = `id${i + idx}`;
        request.input(name, sql.VarChar, chunk[idx]);
        return `@${name}`;
      });
      const result = await request.query(`
        SELECT tbconnectionid, serialnbr
        FROM dbo.inventory
        WHERE tbconnectionid IN (${placeholders.join(', ')})
      `);
      for (const row of result.recordset) {
        if (row.tbconnectionid != null && row.serialnbr != null) {
          map.set(String(row.tbconnectionid), row.serialnbr);
        }
      }
    }
    return map;
  });
}

function mapRowToDevice(row, serialById) {
  const id = row.device_id;
  const maxTs = row.max_telemetry_ts != null ? Number(row.max_telemetry_ts) : 0;
  const attrTs = row.last_activity_attr != null ? Number(row.last_activity_attr) : 0;
  const lastMs = Math.max(maxTs, attrTs);

  const telemetry = {
    batteryVoltage: row.battery_voltage != null ? Number(row.battery_voltage) : null,
    fCnt: row.fcnt != null ? Number(row.fcnt) : null,
    PercentValveOpen:
      row.percent_valve_open != null ? Math.round(Number(row.percent_valve_open)) : null,
    motorPosition: row.motor_position != null ? Number(row.motor_position) : null,
    motorRange: row.motor_range != null ? Number(row.motor_range) : null,
    rssi: row.rssi != null ? Number(row.rssi) : null,
    snr: row.snr != null ? Number(row.snr) : null,
    sf: row.sf != null ? Number(row.sf) : null,
    signalQuality: row.signal_quality != null ? row.signal_quality : null,
    gatewayId: row.gateway_id != null ? row.gateway_id : null,
    lastActivityTime: lastMs > 0 ? String(lastMs) : null
  };

  const serialNumber = serialById.get(String(id)) ?? null;

  return {
    id,
    name: row.device_name,
    type: row.device_type,
    active: row.device_active,
    lastActivityTime: telemetry.lastActivityTime,
    label: row.device_label || '',
    additionalInfo: {},
    asset: row.asset_id ? { id: row.asset_id } : null,
    telemetry,
    serverAttributes: telemetry,
    serialNumber
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.customerid) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const customerId = normalizeUuid(session.user.customerid);
  if (!customerId) {
    return res.status(400).json({
      message: 'Ungültige Customer-ID in der Session',
      error: 'invalid_customer_id'
    });
  }

  try {
    const startId = await fetchDefaultEntryAssetId(session.user.userid);

    const pool = await getPgConnection();
    const client = await pool.connect();

    let rows;
    try {
      if (startId) {
        const query =
          SUBTREE_CTE +
          DEVICE_SELECT_BODY.replace('__JOIN_ASSET_DEVICES__', 'INNER JOIN asset_devices ad ON ad.device_id = d.id').replace(
            '__CUSTOMER_PARAM__',
            '$2'
          );
        const result = await client.query(query, [startId, customerId]);
        rows = result.rows;
      } else {
        const query = DEVICE_SELECT_BODY.replace('__JOIN_ASSET_DEVICES__', '').replace(
          '__CUSTOMER_PARAM__',
          '$1'
        );
        const result = await client.query(query, [customerId]);
        rows = result.rows;
      }
    } finally {
      client.release();
    }

    let serialById = new Map();
    try {
      serialById = await getSerialNumbersByTbConnectionIds(rows.map((r) => r.device_id));
    } catch (e) {
      console.warn('devices-sql: inventory (MSSQL) skipped:', e.message);
    }

    const devices = rows.map((row) => mapRowToDevice(row, serialById));

    return res.json(devices);
  } catch (error) {
    console.error('devices-sql API error:', error);
    const dev = process.env.NODE_ENV === 'development';
    return res.status(500).json({
      message: 'Error fetching devices (SQL)',
      error: error.message,
      code: error.code,
      detail: dev ? error.detail : undefined,
      hint: dev ? error.hint : undefined,
      position: dev ? error.position : undefined
    });
  }
}
