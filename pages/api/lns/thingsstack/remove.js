import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection, getMssqlConfig } from '../../../../lib/db';
import sql from 'mssql';

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  return (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, '');
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

async function loadThingsstackConnection(pool, db) {
  const tableVariants = [
    `${db}.dbo.nwconnections`,
    'dbo.nwconnections',
    'nwconnections',
    `${db}.dbo.mwconnections`,
    'dbo.mwconnections',
    'mwconnections',
  ];

  const queriesByTable = [
    {
      match: /nwconnections/i,
      queries: [
        `
          SELECT TOP 1 [name], [APIkey] AS apiKey, [url], [name2], [type], [nwconnection_id] AS connection_id
          FROM __TABLE__
          WHERE LOWER(LTRIM(RTRIM([name]))) = 'thingsstack'
          ORDER BY [nwconnection_id] DESC
        `,
        `
          SELECT TOP 1 [name], [APIkey] AS apiKey, [url], [name2], [type], [nwconnection_id] AS connection_id
          FROM __TABLE__
          WHERE LOWER(LTRIM(RTRIM([name2]))) = 'thingsstack'
          ORDER BY [nwconnection_id] DESC
        `,
      ],
    },
    {
      match: /mwconnections/i,
      queries: [
        `
          SELECT TOP 1 [name], [APIkey] AS apiKey, [url], [name2], [type], [fwconnection_id] AS connection_id
          FROM __TABLE__
          WHERE LOWER(LTRIM(RTRIM([name]))) = 'thingsstack'
          ORDER BY [fwconnection_id] DESC
        `,
        `
          SELECT TOP 1 [name], [APIkey] AS apiKey, [url], [name2], [type], [fwconnection_id] AS connection_id
          FROM __TABLE__
          WHERE LOWER(LTRIM(RTRIM([name2]))) = 'thingsstack'
          ORDER BY [fwconnection_id] DESC
        `,
      ],
    },
  ];

  let lastErr = null;
  for (const tableName of tableVariants) {
    const bucket = queriesByTable.find((b) => b.match.test(tableName));
    const queries = bucket?.queries || [];
    for (const queryTpl of queries) {
      try {
        const q = queryTpl.replace('__TABLE__', tableName);
        const result = await pool.request().query(q);
        if (result.recordset?.length > 0) return result.recordset[0];
      } catch (err) {
        lastErr = err;
      }
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

async function deleteThingsstackDevice({ baseUrl, apiKey, applicationId, deviceId }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const routes = [
    `${normalizedBaseUrl}/api/v3/applications/${encodeURIComponent(applicationId)}/devices/${encodeURIComponent(deviceId)}`,
    `${normalizedBaseUrl}/api/v3/as/applications/${encodeURIComponent(applicationId)}/devices/${encodeURIComponent(deviceId)}`,
  ];

  let lastStatus = 0;
  let lastText = '';
  const tried = [];

  for (const route of routes) {
    tried.push(route);
    const response = await fetch(route, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    lastStatus = response.status;
    if (response.ok || response.status === 404) {
      return { ok: true, alreadyDeleted: response.status === 404, tried };
    }

    lastText = await response.text().catch(() => '');
    // Continue if deletion endpoint differs (or 404 handled above)
  }

  return { ok: false, error: `HTTP ${lastStatus} ${lastText}`.trim(), tried };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const { deviceIds } = req.body || {};
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return res.status(400).json({ error: 'deviceIds (array) ist erforderlich.' });
  }

  try {
    const pool = await getConnection();
    const db = getMssqlConfig().database;
    const connection = await loadThingsstackConnection(pool, db);
    if (!connection) {
      return res.status(404).json({ error: 'Thingsstack Verbindung nicht gefunden' });
    }

    const apiKey = String(connection.apiKey || '').trim();
    const baseUrl = normalizeBaseUrl(connection.url);
    if (!apiKey || !baseUrl) {
      return res.status(400).json({
        error: 'Thingsstack Verbindung unvollständig',
        details: 'APIkey und URL müssen in mw/nwconnections gesetzt sein.',
      });
    }

    const ids = deviceIds.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Keine gültigen Geräte-IDs.' });
    }

    const request = pool.request();
    ids.forEach((id, i) => request.input(`id${i}`, sql.BigInt, id));
    const devicesResult = await request.query(`
      SELECT id, deveui, deviceLabel, lns_id
      FROM ${db}.dbo.inventory
      WHERE id IN (${ids.map((_, i) => `@id${i}`).join(',')})
    `);
    const devices = devicesResult.recordset;
    if (!Array.isArray(devices) || devices.length === 0) {
      return res.status(404).json({ error: 'Keine Geräte mit den angegebenen IDs gefunden.' });
    }

    const errors = [];
    let thingsstackRemoved = 0;

    for (const device of devices) {
      const applicationId = String(device.lns_id || '').trim();
      if (!applicationId) continue;

      // Use DevEUI for deterministic device_id matching assign.js
      const deviceId = toDeviceId(device.deveui || device.deviceLabel || `device-${device.id}`);
      const del = await deleteThingsstackDevice({
        baseUrl,
        apiKey,
        applicationId,
        deviceId,
      });

      if (!del.ok) {
        errors.push(`Gerät ${device.id}: Thingsstack löschen fehlgeschlagen: ${del.error || 'unknown error'}`);
        continue;
      }

      thingsstackRemoved++;

      await pool.request()
        .input('id', sql.BigInt, device.id)
        .query(`UPDATE ${db}.dbo.inventory SET lns_id = NULL, lns_assignment_name = NULL WHERE id = @id`);
    }

    return res.status(200).json({
      success: ids.length,
      thingsstackRemoved,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Thingsstack remove error:', err);
    return res.status(500).json({
      error: 'Fehler beim Entfernen von Thingsstack LNS',
      details: err.message,
    });
  }
}

