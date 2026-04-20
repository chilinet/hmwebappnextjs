import { getPgConnection } from './pgdb.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function trimAlarmsQueryParam(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function validateAlarmsPgQuery(query) {
  const errors = [];
  const customerId = trimAlarmsQueryParam(query.customer_id);
  const startId = trimAlarmsQueryParam(query.start_id);

  if (!customerId) errors.push('Customer ID is required');
  else if (!UUID_REGEX.test(customerId)) errors.push('Customer ID must be a valid UUID');

  if (startId && !UUID_REGEX.test(startId)) errors.push('start_id must be a valid UUID');

  const limit = parseInt(query.limit ?? '50', 10);
  const offset = parseInt(query.offset ?? '0', 10);
  if (Number.isNaN(limit) || limit < 1 || limit > 1000) {
    errors.push('limit must be between 1 and 1000');
  }
  if (Number.isNaN(offset) || offset < 0) errors.push('offset must be a non-negative number');

  return { errors, customerId, startId, limit, offset };
}

function statusWhereFragment(status) {
  switch (String(status || 'ACTIVE').toUpperCase()) {
    case 'CLEARED':
      return '(COALESCE(a.cleared, false) = true)';
    case 'ACK':
      return '(NOT COALESCE(a.cleared, false)) AND COALESCE(a.acknowledged, false) = true';
    case 'UNACK':
    case 'ACTIVE':
    default:
      return '(NOT COALESCE(a.cleared, false)) AND (NOT COALESCE(a.acknowledged, false))';
  }
}

/** Wie reporting/window-status: rekursiver Asset-Baum + Geräte darunter. */
const SUBTREE_CTE = `
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

function buildQuery({ customerId, startId, status, limit, offset }) {
  const statusSql = statusWhereFragment(status);
  const baseFrom = `
FROM alarm a
INNER JOIN device d ON d.id = a.originator_id
LEFT JOIN LATERAL (
  SELECT r.from_id AS asset_id
  FROM relation r
  WHERE r.to_id = d.id
    AND UPPER(TRIM(r.to_type)) = 'DEVICE'
    AND UPPER(TRIM(r.from_type)) = 'ASSET'
    AND r.relation_type_group = 'COMMON'
  ORDER BY CASE WHEN r.relation_type = 'Contains' THEN 0 ELSE 1 END
  LIMIT 1
) parent_rel ON true
`;

  const selectList = `
SELECT
  COUNT(*) OVER() AS total_count,
  a.id AS alarm_id,
  a.created_time,
  a.start_ts,
  a.end_ts,
  a.ack_ts,
  a.clear_ts,
  a.type,
  a.severity,
  a.additional_info,
  a.cleared,
  a.acknowledged,
  a.customer_id AS alarm_customer_id,
  d.id AS device_id,
  d.name AS device_name,
  d.label AS device_label,
  d.type AS device_type,
  parent_rel.asset_id
`;

  if (startId) {
    return {
      text: `${SUBTREE_CTE}
${selectList}
${baseFrom}
INNER JOIN asset_devices ad ON ad.device_id = d.id
WHERE d.customer_id = $2::uuid
  AND ${statusSql}
ORDER BY a.created_time DESC
LIMIT $3
OFFSET $4`,
      values: [startId, customerId, limit, offset],
    };
  }

  return {
    text: `${selectList}
${baseFrom}
WHERE d.customer_id = $1::uuid
  AND ${statusSql}
ORDER BY a.created_time DESC
LIMIT $2
OFFSET $3`,
    values: [customerId, limit, offset],
  };
}

export function mapAlarmRow(row) {
  const deviceIdStr = row.device_id != null ? String(row.device_id) : null;
  const alarmIdStr = row.alarm_id != null ? String(row.alarm_id) : null;
  return {
    id: alarmIdStr ? { id: alarmIdStr, entityType: 'ALARM' } : { id: null, entityType: 'ALARM' },
    createdTime: row.created_time != null ? Number(row.created_time) : undefined,
    startTs: row.start_ts != null ? Number(row.start_ts) : undefined,
    endTs: row.end_ts != null ? Number(row.end_ts) : undefined,
    ackTs: row.ack_ts != null ? Number(row.ack_ts) : undefined,
    clearTs: row.clear_ts != null ? Number(row.clear_ts) : undefined,
    type: row.type,
    severity: row.severity,
    additionalInfo: row.additional_info,
    cleared: row.cleared,
    acknowledged: row.acknowledged,
    originatorName: deviceIdStr,
    originatorLabel: row.device_name,
    originator: deviceIdStr
      ? {
          id: { id: deviceIdStr, entityType: 'DEVICE' },
          entityType: 'DEVICE',
          name: row.device_name,
          customerId: row.alarm_customer_id
            ? { id: String(row.alarm_customer_id), entityType: 'CUSTOMER' }
            : undefined,
        }
      : undefined,
    customerId: row.alarm_customer_id
      ? { id: String(row.alarm_customer_id), entityType: 'CUSTOMER' }
      : undefined,
    device: deviceIdStr
      ? {
          id: deviceIdStr,
          name: row.device_name || 'Unbekanntes Gerät',
          type: row.device_type || 'Unknown',
          label: row.device_label,
        }
      : undefined,
    _assetIdForPath: row.asset_id != null ? String(row.asset_id) : null,
  };
}

/**
 * Liest Alarme aus ThingsBoard-PostgreSQL (Tabellen alarm, device, relation).
 */
export async function fetchAlarmsFromPg(options) {
  const { text, values } = buildQuery(options);
  const pool = await getPgConnection();
  const result = await pool.query(text, values);
  const totalCount = result.rows[0] != null ? Number(result.rows[0].total_count) : 0;
  const data = result.rows.map(mapAlarmRow);
  return { data, totalCount };
}
