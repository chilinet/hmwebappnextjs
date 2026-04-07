import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection, getMssqlConfig } from '../../../../lib/db';
import sql from 'mssql';

const FETCH_TIMEOUT_MS = 5000;

async function loadThingsstackConnection(pool, db) {
  const tableVariants = [
    `${db}.dbo.mwconnections`,
    'dbo.mwconnections',
    `${db}.dbo.nwconnections`,
    'dbo.nwconnections',
    'mwconnections',
    'nwconnections',
  ];

  const queries = [
    `
      SELECT TOP 1 [nwconnection_id] AS connection_id, [name], [APIkey] AS apiKey, [url], [name2], [type]
      FROM __TABLE__
      WHERE LOWER(LTRIM(RTRIM([name]))) = 'thingsstack'
      ORDER BY [nwconnection_id] DESC
    `,
    `
      SELECT TOP 1 [name], [APIkey] AS apiKey, [url], [name2], [type]
      FROM __TABLE__
      WHERE LOWER(LTRIM(RTRIM([name]))) = 'thingsstack'
      ORDER BY [name] DESC
    `,
  ];

  let lastErr = null;
  let hadSuccessfulQuery = false;
  for (const tableName of tableVariants) {
    for (const queryTpl of queries) {
      try {
        const result = await pool.request().query(queryTpl.replace('__TABLE__', tableName));
        hadSuccessfulQuery = true;
        if (result.recordset?.length > 0) return result.recordset[0];
      } catch (err) {
        lastErr = err;
      }
    }
  }
  if (!hadSuccessfulQuery && lastErr) {
    throw new Error(`Thingsstack connection query failed: ${lastErr.message}`);
  }
  return null;
}

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw}`.replace(/\/+$/, '');
}

function buildCandidateBaseUrls(url) {
  const input = String(url || '').trim();
  if (!input) return [];

  const candidates = new Set();
  const add = (u) => {
    if (!u) return;
    candidates.add(String(u).replace(/\/+$/, ''));
  };

  const normalized = normalizeBaseUrl(input);
  add(normalized);

  let converted = input;
  if (/^mqtts?:\/\//i.test(converted)) {
    converted = converted.replace(/^mqtts?:\/\//i, 'https://');
    add(converted);
  }
  if (/^wss?:\/\//i.test(converted)) {
    converted = converted.replace(/^wss?:\/\//i, 'https://');
    add(converted);
  }

  try {
    const u = new URL(normalized);
    add(`${u.protocol}//${u.host}`);
    add(`${u.protocol}//${u.hostname}`);
    add(`http://${u.host}`);
    add(`http://${u.hostname}`);
    add(`https://${u.host}`);
    add(`https://${u.hostname}`);
  } catch (_) {}

  return Array.from(candidates).slice(0, 4);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeHex(value) {
  return String(value || '').trim().replace(/[-:\s]/g, '').toLowerCase();
}

function toDeviceId(raw) {
  let id = String(raw || '').trim().toLowerCase();
  id = id.replace(/[^a-z0-9-]/g, '-');
  id = id.replace(/-+/g, '-').replace(/^-+/, '').replace(/-+$/, '');
  if (!id) id = 'device';
  if (id.length < 2) id = `${id}-01`;
  if (id.length > 36) id = id.slice(0, 36);
  return id;
}

function deriveLoRaSettingsFromDevice(device, thingsstackConfig) {
  // Fallbacks come from the UI settings.
  let frequencyPlanId = String(thingsstackConfig?.frequencyPlanId || 'EU_863_870').trim();
  let macVersion = String(thingsstackConfig?.macVersion || 'MAC_V1_0_3').trim();
  let phyVersion = String(thingsstackConfig?.phyVersion || 'PHY_V1_0_3_REV_A').trim();

  const loraversion = String(device?.loraversion || '').toLowerCase();
  const regionalversion = String(device?.regionalversion || '').toLowerCase();

  // Frequency plan heuristic.
  if (regionalversion.includes('902') || regionalversion.includes('us') || regionalversion.includes('america')) {
    frequencyPlanId = 'US_902_928_FSB_2';
  } else if (regionalversion.includes('863') || regionalversion.includes('eu') || regionalversion.includes('europe')) {
    frequencyPlanId = 'EU_863_870';
  }

  // LoRaWAN version + regional revision heuristic.
  if (loraversion.includes('1.0.2')) {
    macVersion = 'MAC_V1_0_2';
    phyVersion = regionalversion.includes('revision a') ? 'PHY_V1_0_2_REV_B' : 'PHY_V1_0_2_REV_B';
  } else if (loraversion.includes('1.0.3')) {
    macVersion = 'MAC_V1_0_3';
    // For 1.0.3 we default to revision A (matches your example).
    if (regionalversion.includes('revision a')) {
      phyVersion = 'PHY_V1_0_3_REV_A';
    } else if (regionalversion.includes('revision b')) {
      phyVersion = 'PHY_V1_0_3_REV_A';
    } else {
      phyVersion = 'PHY_V1_0_3_REV_A';
    }
  }

  return { frequencyPlanId, macVersion, phyVersion };
}

async function createThingsstackDevice({ baseUrl, apiKey, applicationId, device, thingsstackConfig = {} }) {
  const deviceEui = normalizeHex(device.deveui);
  const joinEui = normalizeHex(device.joineui);
  const appKey = normalizeHex(device.appkey);
  // Use DevEUI for deterministic device_id across runs/clusters.
  const deviceId = toDeviceId(device.deveui || device.deviceLabel || `device-${device.id}`);

  if (!deviceEui || deviceEui.length !== 16) {
    return { ok: false, error: `DevEUI ungültig (${device.deveui || 'leer'})` };
  }
  if (!joinEui || joinEui.length !== 16) {
    return { ok: false, error: `JoinEUI ungültig (${device.joineui || 'leer'})` };
  }
  if (!appKey || appKey.length !== 32) {
    return { ok: false, error: 'AppKey fehlt oder ist ungültig (32 Hex-Zeichen erforderlich).' };
  }

  const loRaSettings = deriveLoRaSettingsFromDevice(device, thingsstackConfig);

  const payload = {
    end_device: {
      ids: {
        device_id: deviceId,
        dev_eui: deviceEui,
        join_eui: joinEui,
        application_ids: {
          application_id: applicationId,
        },
      },
      name: (device.deviceLabel || device.deveui || `Device ${device.id}`).trim(),
      supports_join: true,
      root_keys: {
        app_key: { key: appKey },
      },
      frequency_plan_id: loRaSettings.frequencyPlanId,
      lorawan_version_ids: {
        mac_version: loRaSettings.macVersion,
        phy_version: loRaSettings.phyVersion,
      },
    },
    field_mask: {
      paths: [
        'ids.device_id',
        'ids.dev_eui',
        'ids.join_eui',
        'ids.application_ids.application_id',
        'name',
        'supports_join',
        'root_keys.app_key.key',
        'frequency_plan_id',
        'lorawan_version_ids.mac_version',
        'lorawan_version_ids.phy_version',
      ],
    },
  };

  const mode = String(thingsstackConfig?.inputMethod || 'manual').toLowerCase();
  if (mode === 'repository' && thingsstackConfig?.brandId && thingsstackConfig?.modelId) {
    payload.end_device.version_ids = {
      brand_id: String(thingsstackConfig.brandId),
      model_id: String(thingsstackConfig.modelId),
    };
    payload.field_mask.paths.push('version_ids.brand_id', 'version_ids.model_id');
  }

  const baseCandidates = buildCandidateBaseUrls(baseUrl);
  const tried = [];
  let lastStatus = 0;
  let lastText = '';
  let lastErr = null;

  for (const candidate of baseCandidates) {
    const routes = [
      // Prefer canonical application endpoint first.
      `${candidate}/api/v3/applications/${encodeURIComponent(applicationId)}/devices`,
      `${candidate}/api/v3/as/applications/${encodeURIComponent(applicationId)}/devices`,
    ];
    for (const route of routes) {
      tried.push(route);
      try {
        const response = await fetchWithTimeout(route, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          redirect: 'follow',
        });
        if (response.ok) {
          return { ok: true, alreadyExists: false };
        }
        const text = await response.text();
        if (response.status === 409 || /already exists/i.test(text)) {
          return { ok: true, alreadyExists: true };
        }
        lastStatus = response.status;
        lastText = text || response.statusText;
        if (![400, 401, 403, 404, 405].includes(response.status)) {
          return { ok: false, error: `Thingsstack ${lastStatus} ${lastText}`.trim(), tried };
        }
      } catch (err) {
        lastErr = err?.name === 'AbortError'
          ? new Error(`Timeout after ${FETCH_TIMEOUT_MS}ms`)
          : err;
      }
    }
  }

  return {
    ok: false,
    error: lastStatus ? `Thingsstack ${lastStatus} ${lastText}`.trim() : `Fetch failed: ${lastErr?.message || 'unknown error'}`,
    tried,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const { deviceIds, applicationId, lnsAssignmentName, thingsstackConfig } = req.body || {};
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(400).json({ error: 'deviceIds (array) ist erforderlich.' });
  }
  if (!applicationId || String(applicationId).trim() === '') {
    return res.status(400).json({ error: 'applicationId ist erforderlich.' });
  }

  try {
    const pool = await getConnection();
    const db = getMssqlConfig().database;
    const connection = await loadThingsstackConnection(pool, db);

    if (!connection) {
      return res.status(404).json({
        error: 'Thingsstack Verbindung nicht gefunden',
        details: 'Kein Eintrag mit name = "Thingsstack" in mwconnections/nwconnections gefunden.',
      });
    }

    const apiKey = String(connection.apiKey || '').trim();
    const baseUrl = normalizeBaseUrl(connection.url);
    if (!apiKey || !baseUrl) {
      return res.status(400).json({
        error: 'Thingsstack Verbindung unvollständig',
        details: 'APIkey und URL müssen in mwconnections/nwconnections gesetzt sein.',
      });
    }

    const ids = deviceIds.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Keine gültigen Geräte-IDs.' });
    }

    const request = pool.request();
    ids.forEach((id, i) => request.input(`id${i}`, sql.BigInt, id));
    const devicesResult = await request.query(`
      SELECT id, deveui, joineui, appkey, deviceLabel, loraversion, regionalversion
      FROM ${db}.dbo.inventory
      WHERE id IN (${ids.map((_, i) => `@id${i}`).join(',')})
    `);
    const devices = devicesResult.recordset;
    if (devices.length === 0) {
      return res.status(404).json({ error: 'Keine Geräte mit den angegebenen IDs gefunden.' });
    }

    const appId = String(applicationId).trim();
    const displayName = (lnsAssignmentName && String(lnsAssignmentName).trim()) || `Thingsstack (${appId})`;
    const errors = [];
    let created = 0;
    let alreadyExisted = 0;

    for (const device of devices) {
      const result = await createThingsstackDevice({
        baseUrl,
        apiKey,
        applicationId: appId,
        device,
        thingsstackConfig: thingsstackConfig || {},
      });
      if (!result.ok) {
        const attempted = Array.isArray(result.tried) && result.tried.length > 0
          ? ` [tried: ${result.tried.slice(0, 2).join(', ')}${result.tried.length > 2 ? ', ...' : ''}]`
          : '';
        errors.push(`Gerät ${device.id} (${device.deveui || device.deviceLabel || 'unbekannt'}): ${result.error}${attempted}`);
        continue;
      }

      await pool.request()
        .input('id', sql.BigInt, device.id)
        .input('lns_id', sql.NVarChar(100), appId)
        .input('lns_assignment_name', sql.NVarChar(200), displayName)
        .query(`UPDATE ${db}.dbo.inventory SET lns_id = @lns_id, lns_assignment_name = @lns_assignment_name WHERE id = @id`);

      if (result.alreadyExists) alreadyExisted += 1;
      else created += 1;
    }

    const failed = devices.length - created - alreadyExisted;
    const success = created + alreadyExisted;

    return res.status(200).json({
      created,
      alreadyExisted,
      failed,
      success,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Thingsstack assign error:', err);
    return res.status(500).json({
      error: 'Fehler beim Zuweisen zu Thingsstack',
      details: err.message,
    });
  }
}