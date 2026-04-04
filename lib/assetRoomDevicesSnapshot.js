/**
 * Aktuelle Reporting-Werte pro Gerät und Raum verdichtet — Logik wie pages/heating-control.js (fetchTemperature).
 */

import { fetchReportingUpstream } from './reportingUpstream';
import { normalizeDeviceId } from './roomAggregatedTimeseries';

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function validTemp(n) {
  return n != null && !Number.isNaN(n) && n > -50 && n < 100;
}

function validValve(n) {
  return n != null && !Number.isNaN(n) && n >= 0 && n <= 100;
}

export async function fetchReportingLatestRow(entityId, reportingKey) {
  if (!entityId || !reportingKey) return null;
  const { status, data } = await fetchReportingUpstream({
    query: { entity_id: String(entityId), limit: '1' },
    method: 'GET',
    forwardHeaders: { authorization: `Bearer ${reportingKey}` }
  });
  if (status !== 200 || !data?.success || !Array.isArray(data.data) || data.data.length === 0) {
    return null;
  }
  return data.data[0];
}

function mapRowToTelemetry(row) {
  if (!row || typeof row !== 'object') {
    return {
      sensor_temperature: null,
      target_temperature: null,
      percent_valve_open: null,
      battery_voltage: null,
      relative_humidity: null
    };
  }
  return {
    sensor_temperature: numOrNull(row.sensor_temperature),
    target_temperature: numOrNull(row.target_temperature),
    percent_valve_open: numOrNull(row.percent_valve_open),
    battery_voltage: numOrNull(row.battery_voltage),
    relative_humidity: numOrNull(row.relative_humidity)
  };
}

function average(nums) {
  const v = nums.filter((n) => n != null && !Number.isNaN(n));
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export async function buildAssetRoomDevicesSnapshot({
  operationalMode,
  extTempDevice,
  relatedDevices,
  reportingKey
}) {
  const related = Array.isArray(relatedDevices) ? relatedDevices : [];
  const deviceIds = related.map((d) => normalizeDeviceId(d)).filter(Boolean);

  const devices = await Promise.all(
    deviceIds.map(async (device_id) => {
      const row = await fetchReportingLatestRow(device_id, reportingKey);
      return { device_id, ...mapRowToTelemetry(row) };
    })
  );

  const mode = Number(operationalMode);
  const ext = extTempDevice != null && String(extTempDevice).trim() !== '' ? String(extTempDevice).trim() : null;

  let external_temperature_device = null;
  if (ext && (mode === 2 || mode === 10)) {
    const row = await fetchReportingLatestRow(ext, reportingKey);
    external_temperature_device = { device_id: ext, ...mapRowToTelemetry(row) };
  }

  const room = {
    sensor_temperature: null,
    target_temperature: null,
    percent_valve_open: null,
    sensor_temperature_source: null,
    target_temperature_source: null,
    percent_valve_open_source: null,
    device_count_for_average: null
  };

  if (mode === 2 && ext && external_temperature_device) {
    const row = external_temperature_device;
    if (validTemp(row.sensor_temperature)) {
      room.sensor_temperature = row.sensor_temperature;
      room.sensor_temperature_source = 'external';
    }
    if (validTemp(row.target_temperature)) {
      room.target_temperature = row.target_temperature;
      room.target_temperature_source = 'external';
    }

    const valveVals = devices.map((d) => d.percent_valve_open).filter((n) => validValve(n));
    const avgV = average(valveVals);
    if (avgV != null) {
      room.percent_valve_open = avgV;
      room.percent_valve_open_source = 'average';
      room.device_count_for_average = valveVals.length;
    } else {
      room.percent_valve_open = 0;
      room.percent_valve_open_source = 'average';
      room.device_count_for_average = 0;
    }
  } else if (mode === 10 && ext && external_temperature_device) {
    const row = external_temperature_device;
    if (validTemp(row.sensor_temperature)) {
      room.sensor_temperature = row.sensor_temperature;
      room.sensor_temperature_source = 'external';
    }

    const targets = devices.map((d) => d.target_temperature).filter((t) => validTemp(t));
    const valves = devices.map((d) => d.percent_valve_open).filter((v) => validValve(v));
    const avgT = average(targets);
    const avgV = average(valves);
    if (avgT != null) {
      room.target_temperature = avgT;
      room.target_temperature_source = 'average';
    }
    if (avgV != null) {
      room.percent_valve_open = avgV;
      room.percent_valve_open_source = 'average';
    }
  } else if (deviceIds.length > 0) {
    const sensors = devices.map((d) => d.sensor_temperature).filter((t) => validTemp(t));
    const targets = devices.map((d) => d.target_temperature).filter((t) => validTemp(t));
    const valves = devices.map((d) => d.percent_valve_open).filter((v) => validValve(v));
    const avgS = average(sensors);
    const avgT = average(targets);
    const avgV = average(valves);
    if (avgS != null) {
      room.sensor_temperature = avgS;
      room.sensor_temperature_source = 'average';
    }
    if (avgT != null) {
      room.target_temperature = avgT;
      room.target_temperature_source = 'average';
    }
    if (avgV != null) {
      room.percent_valve_open = avgV;
      room.percent_valve_open_source = 'average';
    }
    room.device_count_for_average = devices.length;
  }

  return { devices, room, external_temperature_device };
}

export function parseWeeklyScheduleJson(raw) {
  if (raw == null || raw === '') return null;
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

export function parseWindowStatesObject(raw) {
  if (raw == null) return null;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch {
    /* ignore */
  }
  return null;
}

export function summarizeWindows(statesObj) {
  if (!statesObj || typeof statesObj !== 'object') return null;
  const keys = Object.keys(statesObj);
  const total = keys.length;
  if (total === 0) return { total: 0, closed: 0, open: 0 };
  const closed = Object.values(statesObj).filter((v) => v === true).length;
  return { total, closed, open: total - closed };
}
