import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { fetchWithTokenRefresh } from '../../../../../lib/utils/fetchWithTokenRefresh';

/**
 * GET /api/config/customers/[id]/attributes
 * Returns customer attributes from ThingsBoard (e.g. usePresenceSensor).
 * Used by heating-control to decide whether to show presence tile and "Bewegung" option.
 */
export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id: customerId } = req.query;
  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TB_API_URL = process.env.THINGSBOARD_URL;
  if (!TB_API_URL) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetchWithTokenRefresh(
      `${TB_API_URL}/api/plugins/telemetry/CUSTOMER/${customerId}/values/attributes`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      },
      session,
      req,
      res
    );

    if (!response.ok) {
      throw new Error(`Error fetching customer attributes: ${response.statusText}`);
    }

    const attributes = await response.json();
    const usePresenceSensorAttr = attributes.find(attr => attr.key === 'usePresenceSensor');
    const usePresenceSensor = usePresenceSensorAttr != null && (
      usePresenceSensorAttr.value === true ||
      usePresenceSensorAttr.value === 'true'
    );

    return res.status(200).json({
      usePresenceSensor: !!usePresenceSensor
    });
  } catch (error) {
    console.error('Error fetching customer attributes:', error);
    return res.status(500).json({
      error: 'Failed to fetch customer attributes',
      details: error.message
    });
  }
}
