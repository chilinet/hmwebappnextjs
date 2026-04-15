import { withPoolRetry } from '../db';
import sql from 'mssql';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeUuid(value) {
  if (value == null || String(value).trim() === '') return null;
  const s = String(value).trim();
  return UUID_REGEX.test(s) ? s : null;
}

/** Rekursiver Asset-Teilbaum + Geräte unterhalb start_id (wie reporting/window-status). */
export const SUBTREE_CTE = `
WITH RECURSIVE asset_tree AS (
    SELECT a.id
    FROM asset a
    WHERE a.id = $1::uuid

    UNION ALL

    SELECT child.id
    FROM relation r
    JOIN asset child
        ON r.to_id = child.id
       AND r.to_type = 'ASSET'
    JOIN asset_tree at
        ON r.from_id = at.id
       AND r.from_type = 'ASSET'
    WHERE r.relation_type = 'Contains'
      AND r.relation_type_group = 'COMMON'
),

asset_devices AS (
    SELECT DISTINCT
        r.to_id AS device_id
    FROM asset_tree at
    JOIN relation r
        ON r.from_id = at.id
       AND r.from_type = 'ASSET'
       AND r.to_type = 'DEVICE'
       AND r.relation_type = 'Contains'
       AND r.relation_type_group = 'COMMON'
)
`;

/** Vollständige Geräteliste (ts_kv_dictionary für Telemetrie-Keys) — siehe /api/config/devices-sql */
export const DEVICE_SELECT_BODY = `
SELECT
    d.id AS device_id,
    d.name AS device_name,
    COALESCE(d.label, '') AS device_label,
    d.type AS device_type,
    CASE
      WHEN GREATEST(COALESCE(MAX(t.ts), 0), COALESCE(MAX(ak_dev.long_v), 0))
        > EXTRACT(EPOCH FROM (NOW() AT TIME ZONE 'UTC') - INTERVAL '24 hours') * 1000
      THEN true
      ELSE false
    END AS device_active,
    MIN(r.from_id::text)::uuid AS asset_id,
    MAX(CASE WHEN kd_t.key = 'batteryVoltage'
             THEN COALESCE(t.dbl_v, t.long_v::double precision) END) AS battery_voltage,
    MAX(CASE WHEN kd_t.key = 'fCnt' THEN t.long_v END) AS fcnt,
    MAX(CASE WHEN kd_t.key = 'PercentValveOpen'
             THEN COALESCE(t.dbl_v, t.long_v::double precision) END) AS percent_valve_open,
    MAX(CASE WHEN kd_t.key = 'motorPosition'
             THEN COALESCE(t.dbl_v, t.long_v::double precision) END) AS motor_position,
    MAX(CASE WHEN kd_t.key = 'motorRange'
             THEN COALESCE(t.dbl_v, t.long_v::double precision) END) AS motor_range,
    MAX(CASE WHEN kd_t.key = 'rssi'
             THEN COALESCE(t.long_v::double precision, t.dbl_v) END) AS rssi,
    MAX(CASE WHEN kd_t.key = 'snr'
             THEN COALESCE(t.dbl_v, t.long_v::double precision) END) AS snr,
    MAX(CASE WHEN kd_t.key = 'sf'
             THEN COALESCE(t.long_v::double precision, t.dbl_v) END) AS sf,
    MAX(CASE WHEN kd_t.key = 'signalQuality'
             THEN COALESCE(t.str_v, t.long_v::text, t.dbl_v::text) END) AS signal_quality,
    MAX(CASE WHEN kd_t.key = 'gatewayId' THEN t.str_v END) AS gateway_id,
    MAX(t.ts) AS max_telemetry_ts,
    MAX(ak_dev.long_v) AS last_activity_attr
FROM device d
__JOIN_ASSET_DEVICES__
LEFT JOIN relation r
    ON r.to_id = d.id
   AND r.to_type = 'DEVICE'
   AND r.from_type = 'ASSET'
   AND r.relation_type_group = 'COMMON'
LEFT JOIN ts_kv_latest t
    ON t.entity_id = d.id
LEFT JOIN ts_kv_dictionary kd_t
    ON kd_t.key_id = t.key
LEFT JOIN attribute_kv ak_dev
    ON ak_dev.entity_id = d.id
   AND ak_dev.attribute_key = 'lastActivityTime'
WHERE d.customer_id = __CUSTOMER_PARAM__
GROUP BY d.id, d.name, d.label, d.type
ORDER BY d.name
`;

const DEVICE_ACTIVE_SCOPE_INNER = `
SELECT
    d.id,
    CASE
      WHEN GREATEST(COALESCE(MAX(t.ts), 0), COALESCE(MAX(ak_dev.long_v), 0))
        > EXTRACT(EPOCH FROM (NOW() AT TIME ZONE 'UTC') - INTERVAL '24 hours') * 1000
      THEN true
      ELSE false
    END AS device_active
FROM device d
__JOIN_ASSET_DEVICES__
LEFT JOIN ts_kv_latest t
    ON t.entity_id = d.id
LEFT JOIN attribute_kv ak_dev
    ON ak_dev.entity_id = d.id
   AND ak_dev.attribute_key = 'lastActivityTime'
WHERE d.customer_id = __CUSTOMER_PARAM__
GROUP BY d.id
`;

const DEVICE_COUNT_OUTER = `
SELECT
  COALESCE(COUNT(*), 0)::int AS devices,
  COALESCE(COUNT(*) FILTER (WHERE device_active), 0)::int AS active_devices,
  COALESCE(COUNT(*) FILTER (WHERE NOT device_active), 0)::int AS inactive_devices
FROM (__INNER__) _device_scope
`;

/**
 * Zähler für Kachel „aktive Geräte“ — gleicher Mandant, gleicher Teilbaum (default_entry_asset_id), gleiche Aktiv-Definition wie Geräteseite.
 * @returns {{ text: string, values: string[] }}
 */
export function getDeviceSqlCountsQuery(startId, customerId) {
  const wrap = (innerSql) => DEVICE_COUNT_OUTER.replace('__INNER__', innerSql.trim());

  if (startId) {
    const inner = DEVICE_ACTIVE_SCOPE_INNER.replace(
      '__JOIN_ASSET_DEVICES__',
      'INNER JOIN asset_devices ad ON ad.device_id = d.id'
    ).replace('__CUSTOMER_PARAM__', '$2');
    return { text: SUBTREE_CTE + wrap(inner), values: [startId, customerId] };
  }

  const inner = DEVICE_ACTIVE_SCOPE_INNER.replace('__JOIN_ASSET_DEVICES__', '').replace(
    '__CUSTOMER_PARAM__',
    '$1'
  );
  return { text: wrap(inner), values: [customerId] };
}

export async function fetchDefaultEntryAssetId(userid) {
  if (userid == null) return null;
  try {
    return await withPoolRetry(async (pool) => {
      const result = await pool
        .request()
        .input('userid', sql.Int, userid)
        .query(`
          SELECT default_entry_asset_id
          FROM hm_users
          WHERE userid = @userid
        `);
      const raw = result.recordset[0]?.default_entry_asset_id;
      if (raw == null || String(raw).trim() === '') return null;
      return normalizeUuid(raw);
    });
  } catch (e) {
    console.warn('devicesSqlShared: default_entry_asset_id (MSSQL) skipped:', e.message);
    return null;
  }
}
