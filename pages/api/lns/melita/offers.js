import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getMelitaToken } from '../../../../lib/melitaAuth';

/**
 * GET /api/lns/melita/offers
 * Fetches offers/contracts from Melita LoRaWAN API for the Assign LNS dropdown.
 * Uses MELITA_API_KEY and MELITA_BASE_URL from .env.
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

  const baseUrl = (process.env.MELITA_BASE_URL || '').replace(/\/+$/, '');
  const offersPath = process.env.MELITA_OFFERS_PATH || '/api/iot-gateway/contracts';

  if (!process.env.MELITA_API_KEY || !baseUrl) {
    return res.status(500).json({
      error: 'Melita API nicht konfiguriert',
      details: 'MELITA_API_KEY und MELITA_BASE_URL müssen in .env gesetzt sein.',
    });
  }

  try {
    const authToken = await getMelitaToken();
    const url = `${baseUrl}${offersPath.startsWith('/') ? '' : '/'}${offersPath}`;

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

    // Normalize: accept array or { contracts: [...] } (contract-controller) or { data: [...] } or { offers: [...] }
    let list = Array.isArray(data) ? data : data?.contracts ?? data?.offers ?? data?.data ?? [];
    if (!Array.isArray(list)) list = [];

    if (list.length > 0) {
      console.log('Melita contracts API – sample item keys:', Object.keys(list[0]));
      console.log('Melita contracts API – first item:', JSON.stringify(list[0], null, 2));
    }

    const offers = list.map((item) => {
      const id = item.id ?? item.planNumber ?? item.offerId ?? item.contractId ?? item.planId ?? item.value;
      const name =
        item.friendlyName ??
        item.friendly_name ??
        item.offerName ??
        item.name ??
        item.label ??
        item.title ??
        item.contractName ??
        item.planName ??
        item.productName ??
        item.displayName ??
        item.offer_name ??
        item.contract_name ??
        item.contractLabel ??
        item.offerLabel;
      const label = name && String(id) !== String(name)
        ? `${name} (${id})`
        : (name || String(id));
      return { value: String(id), label };
    });

    return res.status(200).json({ offers });
  } catch (err) {
    console.error('Melita offers fetch error:', err);
    return res.status(500).json({
      error: 'Fehler beim Laden der Melita Offers',
      details: err.message,
    });
  }
}
