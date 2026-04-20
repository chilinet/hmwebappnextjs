/**
 * Raum-/Asset-Zeitreihen wie im Heating-Control-Temperatur-Chart:
 * operationalMode 2 / 10 / sonst — Reporting device_10m, Verdichtung wie in pages/heating-control.js (fetchTemperatureHistory).
 */

import { fetchReportingUpstream } from './reportingUpstream';
import { getTimeRangeInMs } from './heating-control/timeRangeUtils';
import { mergeRoomTimeseriesPoints } from './mergeRoomTimeseries';

const REPORTING_HISTORY_LIMIT = 2000;
const MAX_REPORTING_LIMIT = 15000;

function normalizeDateOnly(value) {
  if (value == null || String(value).trim() === '') return null;
  const s = String(value).trim();
  return s.includes('T') ? s.split('T')[0] : s;
}

/** Gleiche Query-Form wie /api/devices/timeseries → Reporting-Upstream */
function buildReportingQuery({ start_date, end_date, limit, offset }) {
  const q = {
    start_date,
    limit: String(
      limit != null && limit !== ''
        ? Math.min(MAX_REPORTING_LIMIT, Math.max(1, parseInt(String(limit), 10) || REPORTING_HISTORY_LIMIT))
        : REPORTING_HISTORY_LIMIT
    )
  };
  if (end_date) q.end_date = end_date;
  const off = offset != null && offset !== '' ? parseInt(String(offset), 10) : 0;
  if (!Number.isNaN(off) && off > 0) q.offset = String(off);
  return q;
}

export function normalizeDeviceId(device) {
  if (device == null) return null;
  if (typeof device === 'string') return device.trim() || null;
  if (typeof device.id === 'object' && device.id?.id) return String(device.id.id);
  if (device.id != null) return String(device.id);
  if (device.deviceId != null) return String(device.deviceId);
  return null;
}

export function findTreeNodeByAssetId(treeRoots, assetId) {
  if (!Array.isArray(treeRoots) || !assetId) return null;
  const idStr = String(assetId);
  for (const node of treeRoots) {
    const nid = node?.id != null ? String(node.id) : null;
    if (nid === idStr) return node;
    if (node?.children?.length) {
      const found = findTreeNodeByAssetId(node.children, assetId);
      if (found) return found;
    }
  }
  return null;
}

async function fetchReportingRows(entityId, reportingKey, reportQuery) {
  if (!entityId || !reportingKey) return [];
  const query = {
    key: reportingKey,
    entity_id: String(entityId),
    ...reportQuery
  };
  const { status, data } = await fetchReportingUpstream({
    query,
    method: 'GET',
    forwardHeaders: { authorization: `Bearer ${reportingKey}` }
  });
  if (status !== 200 || !data?.success || !Array.isArray(data.data)) return [];
  return data.data;
}

function filterUpToNowSorted(rows) {
  const sorted = [...rows].sort((a, b) => new Date(a.bucket_10m) - new Date(b.bucket_10m));
  const now = new Date();
  return sorted.filter((item) => new Date(item.bucket_10m) <= now);
}

function toSensorHistory(filteredData) {
  return filteredData
    .filter((item) => item.sensor_temperature != null)
    .map((item) => ({
      time: new Date(item.bucket_10m).toLocaleString('de-DE'),
      timestamp: new Date(item.bucket_10m).getTime(),
      sensor_temperature: Number(item.sensor_temperature)
    }))
    .filter(
      (item) =>
        !Number.isNaN(item.sensor_temperature) &&
        item.sensor_temperature > -50 &&
        item.sensor_temperature < 100
    );
}

function toTargetHistory(filteredData) {
  return filteredData
    .filter((item) => item.target_temperature != null)
    .map((item) => ({
      time: new Date(item.bucket_10m).toLocaleString('de-DE'),
      timestamp: new Date(item.bucket_10m).getTime(),
      target_temperature: Number(item.target_temperature)
    }))
    .filter(
      (item) =>
        !Number.isNaN(item.target_temperature) &&
        item.target_temperature > -50 &&
        item.target_temperature < 100
    );
}

/** operationalMode 2: ext für Ist+Ziel, Ventil Mittel über relatedDevices */
async function buildMode2History(extTempDevice, relatedDevices, reportingKey, reportQuery) {
  const rows = await fetchReportingRows(extTempDevice, reportingKey, reportQuery);
  if (rows.length === 0) {
    return { temperatureHistory: [], targetTemperatureHistory: [], valveOpenHistory: [] };
  }
  const filteredData = filterUpToNowSorted(rows);
  const temperatureHistory = toSensorHistory(filteredData);
  const targetTemperatureHistory = toTargetHistory(filteredData);

  const deviceIds = (relatedDevices || [])
    .map((d) => normalizeDeviceId(d))
    .filter(Boolean);

  let valveOpenHistory = [];
  if (deviceIds.length > 0) {
    const allDeviceValveData = await Promise.all(
      deviceIds.map(async (deviceId) => {
        try {
          const dr = await fetchReportingRows(deviceId, reportingKey, reportQuery);
          return dr.map((item) => ({
            timestamp: new Date(item.bucket_10m).getTime(),
            percent_valve_open:
              item.percent_valve_open != null ? Number(item.percent_valve_open) : 0
          }));
        } catch {
          return [];
        }
      })
    );
    const valveOpenTimestampMap = new Map();
    const now = new Date();
    allDeviceValveData.flat().forEach((item) => {
      const itemTime = new Date(item.timestamp);
      if (
        itemTime <= now &&
        !Number.isNaN(item.percent_valve_open) &&
        item.percent_valve_open >= 0 &&
        item.percent_valve_open <= 100
      ) {
        if (!valveOpenTimestampMap.has(item.timestamp)) {
          valveOpenTimestampMap.set(item.timestamp, []);
        }
        valveOpenTimestampMap.get(item.timestamp).push(item.percent_valve_open);
      }
    });
    valveOpenHistory = Array.from(valveOpenTimestampMap.entries())
      .map(([timestamp, valves]) => ({
        time: new Date(timestamp).toLocaleString('de-DE'),
        timestamp,
        percent_valve_open: valves.reduce((sum, v) => sum + v, 0) / valves.length
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  return { temperatureHistory, targetTemperatureHistory, valveOpenHistory };
}

/** operationalMode 10: ext nur Ist; Ziel+Ventil aus related (Logik wie heating-control — flache Liste) */
async function buildMode10History(extTempDevice, relatedDevices, reportingKey, reportQuery) {
  let temperatureHistory = [];
  if (extTempDevice) {
    const rows = await fetchReportingRows(extTempDevice, reportingKey, reportQuery);
    const filteredData = filterUpToNowSorted(rows);
    temperatureHistory = toSensorHistory(filteredData);
  }

  const deviceIds = (relatedDevices || [])
    .map((d) => normalizeDeviceId(d))
    .filter(Boolean);

  let targetTemperatureHistory = [];
  let valveOpenHistory = [];
  if (deviceIds.length > 0) {
    const deviceResults = await Promise.all(
      deviceIds.map((deviceId) => fetchReportingRows(deviceId, reportingKey, reportQuery))
    );
    const allDeviceData = deviceResults.flat();
    const currentTime = new Date();
    const filteredDeviceData = allDeviceData.filter(
      (item) => new Date(item.bucket_10m) <= currentTime
    );

    targetTemperatureHistory = filteredDeviceData
      .filter((item) => item.target_temperature != null)
      .map((item) => ({
        time: new Date(item.bucket_10m).toLocaleString('de-DE'),
        timestamp: new Date(item.bucket_10m).getTime(),
        target_temperature: Number(item.target_temperature)
      }))
      .filter(
        (item) =>
          !Number.isNaN(item.target_temperature) &&
          item.target_temperature > -50 &&
          item.target_temperature < 100
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    valveOpenHistory = filteredDeviceData
      .map((item) => ({
        time: new Date(item.bucket_10m).toLocaleString('de-DE'),
        timestamp: new Date(item.bucket_10m).getTime(),
        percent_valve_open:
          item.percent_valve_open != null ? Number(item.percent_valve_open) : 0
      }))
      .filter(
        (item) =>
          !Number.isNaN(item.percent_valve_open) &&
          item.percent_valve_open >= 0 &&
          item.percent_valve_open <= 100
      )
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  return { temperatureHistory, targetTemperatureHistory, valveOpenHistory };
}

/** Default: Durchschnitt über alle relatedDevices je bucket_10m */
async function buildDefaultAveragedHistory(relatedDevices, reportingKey, reportQuery) {
  const deviceIds = (relatedDevices || [])
    .map((d) => normalizeDeviceId(d))
    .filter(Boolean);

  if (deviceIds.length === 0) {
    return { temperatureHistory: [], targetTemperatureHistory: [], valveOpenHistory: [] };
  }

  const deviceResults = await Promise.all(
    deviceIds.map((deviceId) => fetchReportingRows(deviceId, reportingKey, reportQuery))
  );
  const allDeviceData = deviceResults.flat();
  const currentTime = new Date();
  const filteredDeviceData = allDeviceData.filter(
    (item) => new Date(item.bucket_10m) <= currentTime
  );

  const timestampMap = new Map();
  const targetTimestampMap = new Map();
  const valveOpenTimestampMap = new Map();

  filteredDeviceData.forEach((item) => {
    const bucketTime = new Date(item.bucket_10m).getTime();

    if (item.sensor_temperature != null) {
      const temp = Number(item.sensor_temperature);
      if (!Number.isNaN(temp) && temp > -50 && temp < 100) {
        if (!timestampMap.has(bucketTime)) timestampMap.set(bucketTime, []);
        timestampMap.get(bucketTime).push(temp);
      }
    }

    if (item.target_temperature != null) {
      const temp = Number(item.target_temperature);
      if (!Number.isNaN(temp) && temp > -50 && temp < 100) {
        if (!targetTimestampMap.has(bucketTime)) targetTimestampMap.set(bucketTime, []);
        targetTimestampMap.get(bucketTime).push(temp);
      }
    }

    const valve =
      item.percent_valve_open != null ? Number(item.percent_valve_open) : 0;
    if (!Number.isNaN(valve) && valve >= 0 && valve <= 100) {
      if (!valveOpenTimestampMap.has(bucketTime)) valveOpenTimestampMap.set(bucketTime, []);
      valveOpenTimestampMap.get(bucketTime).push(valve);
    }
  });

  const temperatureHistory = Array.from(timestampMap.entries())
    .map(([timestamp, temps]) => ({
      time: new Date(timestamp).toLocaleString('de-DE'),
      timestamp,
      sensor_temperature: temps.reduce((s, t) => s + t, 0) / temps.length
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const targetTemperatureHistory = Array.from(targetTimestampMap.entries())
    .map(([timestamp, temps]) => ({
      time: new Date(timestamp).toLocaleString('de-DE'),
      timestamp,
      target_temperature: temps.length > 0 ? temps.reduce((s, t) => s + t, 0) / temps.length : null
    }))
    .filter((item) => item.target_temperature !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  const valveOpenHistory = Array.from(valveOpenTimestampMap.entries())
    .map(([timestamp, valves]) => ({
      time: new Date(timestamp).toLocaleString('de-DE'),
      timestamp,
      percent_valve_open: valves.reduce((s, v) => s + v, 0) / valves.length
    }))
    .filter((item) => item.percent_valve_open != null)
    .sort((a, b) => a.timestamp - b.timestamp);

  return { temperatureHistory, targetTemperatureHistory, valveOpenHistory };
}

/**
 * @param {object} params
 * @param {number|string} params.operationalMode
 * @param {string|null} params.extTempDevice
 * @param {Array} params.relatedDevices – aus Tree-Knoten
 * @param {string} [params.timeRange] – '1d' | '7d' | … wenn kein start_date (wie heating-control)
 * @param {string} [params.start_date] – wie /api/devices/timeseries (YYYY-MM-DD)
 * @param {string} [params.end_date] – optional
 * @param {number|string} [params.limit]
 * @param {number|string} [params.offset]
 * @param {string} params.reportingKey – REPORTING_PRESHARED_KEY
 * @returns {Promise<{ startDate: string, endDate: string, startTimeMs: number, endTimeMs: number, reportingQuery: object, operationalMode: number, timeseries: Array<{ time: string, timestamp: number, sensor_temperature: number|null, target_temperature: number|null, percent_valve_open: number|null }> }>}
 */
export async function buildRoomAggregatedTimeseries({
  operationalMode,
  extTempDevice,
  relatedDevices,
  timeRange,
  start_date,
  end_date,
  limit,
  offset,
  reportingKey
}) {
  const endTimeMs = Date.now();
  const normStart = normalizeDateOnly(start_date);
  const normEnd = normalizeDateOnly(end_date);

  let startDate;
  let endDate;
  let startTimeMs;

  if (normStart) {
    startDate = normStart;
    endDate = normEnd || new Date().toISOString().split('T')[0];
    startTimeMs = new Date(`${startDate}T00:00:00.000Z`).getTime();
  } else {
    const tr = timeRange || '7d';
    startTimeMs = getTimeRangeInMs(tr);
    startDate = new Date(startTimeMs).toISOString().split('T')[0];
    endDate = normEnd || new Date().toISOString().split('T')[0];
  }

  const reportQuery = buildReportingQuery({
    start_date: startDate,
    end_date: endDate,
    limit,
    offset
  });

  const mode = Number(operationalMode);
  let result;
  if (mode === 2) {
    if (extTempDevice) {
      result = await buildMode2History(extTempDevice, relatedDevices, reportingKey, reportQuery);
    } else {
      result = {
        temperatureHistory: [],
        targetTemperatureHistory: [],
        valveOpenHistory: []
      };
    }
  } else if (mode === 10) {
    result = await buildMode10History(extTempDevice, relatedDevices, reportingKey, reportQuery);
  } else {
    result = await buildDefaultAveragedHistory(relatedDevices, reportingKey, reportQuery);
  }

  const timeseries = mergeRoomTimeseriesPoints(
    result.temperatureHistory,
    result.targetTemperatureHistory,
    result.valveOpenHistory
  );

  return {
    startDate,
    endDate,
    startTimeMs,
    endTimeMs,
    reportingQuery: reportQuery,
    operationalMode: mode,
    timeseries
  };
}
