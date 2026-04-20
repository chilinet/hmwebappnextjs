import jwt from 'jsonwebtoken';
import { fetchReportingUpstream } from '../../../lib/reportingUpstream';

/**
 * GET /api/devices/timeseries
 *
 * Gleiche Datenquelle wie /api/reporting-proxy (externes REPORTING_URL/api/reporting).
 * Authentifizierung: Bearer = App-JWT (NEXTAUTH_SECRET), nicht der Reporting-Key.
 * Der Reporting-Preshared-Key wird serverseitig aus REPORTING_PRESHARED_KEY gesetzt.
 *
 * Query (Whitelist, identisch zu /api/reporting): entity_id, start_date, end_date, limit, offset
 *
 * Antwort: success, metadata (inkl. timezone = IANA der timestamp-Werte), data.
 * Override Zeitzone: REPORTING_DATA_TIMEZONE. Default UTC (bucket_10m typ. ...Z).
 * Pro Zeile: entity_id, timestamp (aus bucket_10m), sensor_temperature, target_temperature,
 * percent_valve_open, battery_voltage, relative_humidity.
 */
const ALLOWED_QUERY_KEYS = ['entity_id', 'start_date', 'end_date', 'limit', 'offset'];

/**
 * IANA-Zeitzone, der die Felder data[].timestamp entsprechen (Semantik der Reporting-Daten).
 * Nicht die Node-Prozess-Zeitzone.
 */
function getDataTimestampTimeZone(sampleRawBucket) {
  const fromEnv = process.env.REPORTING_DATA_TIMEZONE?.trim();
  if (fromEnv) return fromEnv;

  if (sampleRawBucket != null && typeof sampleRawBucket === 'string') {
    const s = sampleRawBucket.trim();
    if (s.endsWith('Z')) return 'UTC';
  }
  return 'UTC';
}

function mapReportingRow(row) {
  if (!row || typeof row !== 'object') {
    return {
      entity_id: null,
      timestamp: null,
      sensor_temperature: null,
      target_temperature: null,
      percent_valve_open: null,
      battery_voltage: null,
      relative_humidity: null
    };
  }
  const ts = row.bucket_10m ?? row.timestamp ?? null;
  return {
    entity_id: row.entity_id ?? null,
    timestamp: ts,
    sensor_temperature: row.sensor_temperature ?? null,
    target_temperature: row.target_temperature ?? null,
    percent_valve_open: row.percent_valve_open ?? null,
    battery_voltage: row.battery_voltage ?? null,
    relative_humidity: row.relative_humidity ?? null
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur GET ist erlaubt'
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authorization: Bearer <JWT> erforderlich'
    });
  }

  const token = authHeader.slice(7).trim();
  try {
    jwt.verify(token, process.env.NEXTAUTH_SECRET);
  } catch (err) {
    console.error('devices/timeseries JWT verification failed:', err.message);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Ungültiger oder abgelaufener Token'
    });
  }

  const reportingKey = process.env.REPORTING_PRESHARED_KEY;
  if (!reportingKey) {
    console.error('REPORTING_PRESHARED_KEY is not set');
    return res.status(503).json({
      success: false,
      error: 'Service unavailable',
      message: 'Reporting-Zugang ist nicht konfiguriert'
    });
  }

  const query = { key: reportingKey };
  for (const key of ALLOWED_QUERY_KEYS) {
    if (req.query[key] !== undefined && req.query[key] !== '') {
      query[key] = req.query[key];
    }
  }

  try {
    const { status, data } = await fetchReportingUpstream({
      query,
      method: 'GET',
      forwardHeaders: {
        authorization: `Bearer ${reportingKey}`
      }
    });

    if (
      status === 200 &&
      data &&
      typeof data === 'object' &&
      data.success === true &&
      Array.isArray(data.data)
    ) {
      const sampleBucket = data.data[0]?.bucket_10m ?? data.data[0]?.timestamp;
      const upstreamMeta =
        data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
          ? { ...data.metadata }
          : {};
      upstreamMeta.timezone = getDataTimestampTimeZone(sampleBucket);
      return res.status(200).json({
        success: true,
        metadata: upstreamMeta,
        data: data.data.map(mapReportingRow)
      });
    }

    return res.status(status).json(data);
  } catch (error) {
    console.error('devices/timeseries upstream error:', error);
    return res.status(502).json({
      success: false,
      error: 'Bad gateway',
      message: 'Reporting-Dienst nicht erreichbar',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
