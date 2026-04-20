import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { getMelitaApiConnection, getMelitaToken } from '../../../../../lib/melitaAuth';

/**
 * GET /api/lns/melita/device-profiles
 * Fetches device profiles from Melita for the Assign LNS dropdown.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  // Melita API: GET /api/iot-gateway/lorawan/profiles (see https://www.melita.io/api-documentation/#/)
  const profilesPath = process.env.MELITA_DEVICE_PROFILES_PATH || '/api/iot-gateway/lorawan/profiles';

  try {
    const melitaConn = await getMelitaApiConnection();
    if (!melitaConn?.apiKey || !melitaConn?.baseUrl) {
      return res.status(500).json({
        error: 'Melita API nicht konfiguriert',
        details: 'Keine Melita Verbindung in mw/nwconnections gefunden (und MELITA_API_KEY/MELITA_BASE_URL nicht gesetzt).',
      });
    }
    const authToken = await getMelitaToken({ apiKey: melitaConn.apiKey, baseUrl: melitaConn.baseUrl });
    const url = `${melitaConn.baseUrl}${profilesPath.startsWith('/') ? '' : '/'}${profilesPath}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text || response.statusText };
      }
      return res.status(response.status).json({
        error: 'Melita API Fehler (Device Profiles)',
        status: response.status,
        details: body,
      });
    }

    const data = await response.json();
    const list = Array.isArray(data) ? data : data?.deviceProfiles ?? data?.profiles ?? data?.data ?? [];
    const profiles = (Array.isArray(list) ? list : []).map((item) => {
      const id = item.id ?? item.deviceProfileId ?? item.profileId ?? item.value;
      const name = item.name ?? item.label ?? item.profileName ?? item.title ?? String(id);
      return { value: String(id), label: name };
    });

    return res.status(200).json({ profiles });
  } catch (err) {
    console.error('Melita device-profiles fetch error:', err);
    return res.status(500).json({
      error: 'Fehler beim Laden der Device Profiles',
      details: err.message,
    });
  }
}
