import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getMelitaApiConnection, getMelitaToken } from '../../../../lib/melitaAuth';

/**
 * GET /api/lns/melita/offers
 * Fetches offers/contracts from Melita LoRaWAN API for the Assign LNS dropdown.
 * Uses API key + base URL from DB (mwconnections/nwconnections) or falls back to .env.
 * Melita requires an auth token from /api/iot-gateway/auth/generate (ApiKey header), then Bearer token for API calls.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const offersPath = process.env.MELITA_OFFERS_PATH || '/api/iot-gateway/contracts';

  try {
    const connection = await getMelitaApiConnection();
    if (!connection?.apiKey || !connection?.baseUrl) {
      return res.status(500).json({
        error: 'Melita API nicht konfiguriert',
        details: 'Keine Melita Verbindung in mwconnections/nwconnections gefunden und MELITA_API_KEY/MELITA_BASE_URL nicht gesetzt.',
      });
    }
    const authToken = await getMelitaToken({ apiKey: connection.apiKey, baseUrl: connection.baseUrl });
    const url = `${connection.baseUrl}${offersPath.startsWith('/') ? '' : '/'}${offersPath}`;

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
        error: 'Melita API Fehler',
        status: response.status,
        details: body,
      });
    }

    const data = await response.json();

    // Melita API returns contracts with subscriptions[]; friendly name is subscriptionLabel inside each subscription
    let list = Array.isArray(data) ? data : data?.contracts ?? data?.offers ?? data?.data ?? [];
    if (!Array.isArray(list)) list = [];

    const offers = [];
    for (const contract of list) {
      const contractId = String(contract.contractId ?? contract.id ?? contract.planNumber ?? '');
      const subs = contract.subscriptions;
      let name = null;
      if (Array.isArray(subs) && subs.length > 0) {
        const first = subs[0];
        name = first.subscriptionLabel ?? first.friendlyName ?? first.name ?? first.label;
      }
      if (name == null) {
        name = contract.friendlyName ?? contract.offerName ?? contract.name ?? contract.label;
      }
      const label = name ? `${name} (${contractId})` : contractId;
      offers.push({ value: contractId, label });
    }

    return res.status(200).json({ offers });
  } catch (err) {
    console.error('Melita offers fetch error:', err);
    return res.status(500).json({
      error: 'Fehler beim Laden der Melita Offers',
      details: err.message,
    });
  }
}
