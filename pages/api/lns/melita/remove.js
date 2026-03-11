import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection, getMssqlConfig } from '../../../../lib/db';
import { getMelitaToken } from '../../../../lib/melitaAuth';
import sql from 'mssql';

/**
 * POST /api/lns/melita/remove
 * Removes selected devices from Melita LNS (DELETE /api/iot-gateway/lorawan/{deviceEui})
 * and clears lns_id / lns_assignment_name in local inventory.
 * Body: { deviceIds: number[] }
 */
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

  const baseUrl = (process.env.MELITA_BASE_URL || '').replace(/\/+$/, '');
  const removePath = process.env.MELITA_REMOVE_DEVICE_PATH || '/api/iot-gateway/lorawan';

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
      SELECT id, deveui, lns_id
      FROM ${db}.dbo.inventory
      WHERE id IN (${ids.map((_, i) => `@id${i}`).join(',')})
    `);
    const devices = devicesResult.recordset;
    if (devices.length === 0) {
      return res.status(404).json({ error: 'Keine Geräte mit den angegebenen IDs gefunden.' });
    }

    const authToken = await getMelitaToken();
    const errors = [];
    let melitaRemoved = 0;

    for (const device of devices) {
      const deviceEui = (device.deveui || '').trim().replace(/[-:\s]/g, '').toLowerCase();
      if (!deviceEui || deviceEui.length !== 16) {
        errors.push(`Gerät ${device.id}: DevEUI fehlt oder ungültig (16 Hex-Zeichen).`);
        continue;
      }
      if (!device.lns_id) {
        continue;
      }
      const url = `${baseUrl}${removePath.startsWith('/') ? '' : '/'}${removePath}/${deviceEui}`;
      const delRes = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      if (!delRes.ok) {
        const errText = await delRes.text();
        errors.push(`Gerät ${device.id} (${deviceEui}): Melita ${delRes.status} - ${errText.slice(0, 100)}`);
        continue;
      }
      melitaRemoved++;
    }

    for (const id of ids) {
      await pool.request()
        .input('id', sql.BigInt, id)
        .query(`UPDATE ${db}.dbo.inventory SET lns_id = NULL, lns_assignment_name = NULL WHERE id = @id`);
    }

    return res.status(200).json({
      success: ids.length,
      melitaRemoved,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('Melita remove error:', err);
    return res.status(500).json({
      error: 'Fehler beim Entfernen von Melita LNS',
      details: err.message,
    });
  }
}
