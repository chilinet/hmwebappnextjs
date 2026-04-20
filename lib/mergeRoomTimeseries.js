/**
 * Vereinigt Sensor-, Ziel- und Ventil-Zeilen nach timestamp (10-Min-Bucket).
 * Jede Zeile: time, timestamp, sensor_temperature | target_temperature | percent_valve_open (jeweils nullable).
 */

export function mergeRoomTimeseriesPoints(sensorHist, targetHist, valveHist) {
  const byTs = new Map();

  for (const item of sensorHist || []) {
    if (item == null || item.timestamp == null) continue;
    const ts = item.timestamp;
    if (!byTs.has(ts)) {
      byTs.set(ts, {
        time: item.time,
        timestamp: ts,
        sensor_temperature: null,
        target_temperature: null,
        percent_valve_open: null
      });
    }
    const row = byTs.get(ts);
    if (item.time) row.time = item.time;
    const v = item.sensor_temperature ?? item.temperature;
    if (v != null && !Number.isNaN(Number(v))) row.sensor_temperature = Number(v);
  }

  for (const item of targetHist || []) {
    if (item == null || item.timestamp == null) continue;
    const ts = item.timestamp;
    if (!byTs.has(ts)) {
      byTs.set(ts, {
        time: item.time,
        timestamp: ts,
        sensor_temperature: null,
        target_temperature: null,
        percent_valve_open: null
      });
    }
    const row = byTs.get(ts);
    if (item.time) row.time = item.time;
    const v = item.target_temperature ?? item.temperature;
    if (v != null && !Number.isNaN(Number(v))) row.target_temperature = Number(v);
  }

  for (const item of valveHist || []) {
    if (item == null || item.timestamp == null) continue;
    const ts = item.timestamp;
    if (!byTs.has(ts)) {
      byTs.set(ts, {
        time: item.time,
        timestamp: ts,
        sensor_temperature: null,
        target_temperature: null,
        percent_valve_open: null
      });
    }
    const row = byTs.get(ts);
    if (item.time) row.time = item.time;
    const raw = item.percent_valve_open ?? item.valveOpen;
    if (raw != null && !Number.isNaN(Number(raw))) {
      const n = Number(raw);
      if (n >= 0 && n <= 100) row.percent_valve_open = n;
    }
  }

  return Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp);
}
