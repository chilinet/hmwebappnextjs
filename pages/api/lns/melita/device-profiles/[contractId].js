import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { getMelitaToken } from '../../../../../lib/melitaAuth';

/**
 * GET /api/lns/melita/device-profiles/[contractId]
 * Same as device-profiles: fetches device profiles from Melita (contractId in path is optional for Melita API).
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const baseUrl = (process.env.MELITA_BASE_URL || '').replace(/\/+$/, '');
  const contractId = req.query?.contractId;
  const profilesPath = process.env.MELITA_DEVICE_PROFILES_PATH || '/api/iot-gateway/lorawan/profiles';
  const pathTemplate = process.env.MELITA_DEVICE_PROFILES_PATH_CONTRACT || '';
  const urlPath = pathTemplate && contractId
    ? pathTemplate.replace('{contractId}', encodeURIComponent(contractId))
    : profilesPath;

  if (!process.env.MELITA_API_KEY || !baseUrl) {
    return res.status(500).json({
      error: 'Melita API nicht konfiguriert (MELITA_API_KEY, MELITA_BASE_URL).',
    });
  }

  try {
    const authToken = await getMelitaToken();
    const url = `${baseUrl}${urlPath.startsWith('/') ? '' : '/'}${urlPath}`;

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
