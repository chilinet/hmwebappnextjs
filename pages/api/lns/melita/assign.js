import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection, getMssqlConfig } from '../../../../lib/db';
import { getMelitaToken } from '../../../../lib/melitaAuth';
import sql from 'mssql';

/**
 * POST /api/lns/melita/assign
 * Provisions selected inventory devices to Melita LNS using addDevice (devices-controller).
 * Body: { deviceIds: number[], contractId: string }
 * Melita API: https://www.melita.io/api-documentation/#/devices-controller/addDeviceUsingPOST
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const { deviceIds, contractId, deviceProfileId, lnsAssignmentName } = req.body || {};
  if (!Array.isArray(deviceIds) || deviceIds.length === 0 || !contractId || String(contractId).trim() === '') {
    return res.status(400).json({
      error: 'deviceIds (array) und contractId sind erforderlich.',
    });
  }
  if (!deviceProfileId || String(deviceProfileId).trim() === '') {
    return res.status(400).json({
      error: 'deviceProfileId ist erforderlich (Device Profile auswählen).',
    });
  }

  const baseUrl = (process.env.MELITA_BASE_URL || '').replace(/\/+$/, '');
  const contractIdTrimmed = String(contractId).trim();
  // Melita "Create New Device": POST /api/iot-gateway/lorawan/device (singular), body: contractId, deviceProfileId, devicesRequest[]
  const addDevicePath = process.env.MELITA_ADD_DEVICE_PATH || '/api/iot-gateway/lorawan/device';

  if (!process.env.MELITA_API_KEY || !baseUrl) {
    return res.status(500).json({
      error: 'Melita API nicht konfiguriert (MELITA_API_KEY, MELITA_BASE_URL).',
    });
  }

  try {
    const pool = await getConnection();
    const db = getMssqlConfig().database;

    const ids = deviceIds.filter((id) => Number.isInteger(Number(id)) && Number(id) > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Keine gültigen Geräte-IDs.' });
    }

    const request = pool.request();
    ids.forEach((id, i) => request.input(`id${i}`, sql.BigInt, id));
    const devicesResult = await request.query(`
      SELECT id, deveui, joineui, appkey, deviceLabel
      FROM ${db}.dbo.inventory
      WHERE id IN (${ids.map((_, i) => `@id${i}`).join(',')})
    `);
    const devices = devicesResult.recordset;
    if (devices.length === 0) {
      return res.status(404).json({ error: 'Keine Geräte mit den angegebenen IDs gefunden.' });
    }

    const authToken = await getMelitaToken();
    const url = `${baseUrl}${addDevicePath.startsWith('/') ? '' : '/'}${addDevicePath}`;
    const profileId = String(deviceProfileId).trim();

    const errors = [];
    const devicesRequest = [];
    const validDevices = [];
    for (const device of devices) {
      const deviceEui = (device.deveui || '').trim().replace(/[-:\s]/g, '').toLowerCase();
      if (!deviceEui || deviceEui.length !== 16) {
        errors.push(`Gerät ${device.id} (${device.deviceLabel || device.deveui}): DevEUI fehlt oder ungültig (16 Hex-Zeichen).`);
        continue;
      }
      validDevices.push(device);
      devicesRequest.push({
        appKey: (device.appkey || '').trim() || '',
        deviceEui,
        deviceLabel: (device.deviceLabel || device.deveui || `Device ${device.id}`).trim(),
      });
    }

    if (devicesRequest.length === 0) {
      return res.status(400).json({
        success: 0,
        failed: devices.length,
        errors,
      });
    }

    const body = {
      contractId: contractIdTrimmed,
      deviceProfileId: profileId,
      devicesRequest,
    };

    const addRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!addRes.ok) {
      const errText = await addRes.text();
      let errBody;
      try {
        errBody = JSON.parse(errText);
      } catch {
        errBody = { message: errText };
      }
      const errMsg = errBody?.message || errBody?.error || addRes.status;
      validDevices.forEach((d) => {
        errors.push(`Gerät ${d.id} (${d.deveui}): ${errMsg} - ${errText.slice(0, 150)}`);
      });
      return res.status(200).json({
        success: 0,
        failed: validDevices.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    const displayName = (lnsAssignmentName && String(lnsAssignmentName).trim()) || contractIdTrimmed;
    for (const device of validDevices) {
      await pool.request()
        .input('id', sql.BigInt, device.id)
        .input('lns_id', sql.NVarChar(100), contractIdTrimmed)
        .input('lns_assignment_name', sql.NVarChar(200), displayName)
        .query(`UPDATE ${db}.dbo.inventory SET lns_id = @lns_id, lns_assignment_name = @lns_assignment_name WHERE id = @id`);
    }
    const successCount = validDevices.length;

    return res.status(200).json({
      success: successCount,
      failed: devices.length - successCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Melita assign error:', err);
    return res.status(500).json({
      error: 'Fehler beim Zuweisen zu Melita LNS',
      details: err.message,
    });
  }
}
