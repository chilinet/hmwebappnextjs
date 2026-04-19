import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { fetchWithTokenRefresh } from '../../../../../lib/utils/fetchWithTokenRefresh';

function parseAttrBool(attributes, key) {
  const attr = attributes.find((a) => a.key === key);
  if (attr == null) return false;
  return attr.value === true || attr.value === 'true';
}

/**
 * GET /api/config/customers/[id]/attributes — ThingsBoard-Kundenattribute
 * POST — SERVER_SCOPE setzen (z. B. heatplan_on_level)
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

  const TB_API_URL = process.env.THINGSBOARD_URL;
  if (!TB_API_URL) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (req.method === 'GET') {
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
      const usePresenceSensor = parseAttrBool(attributes, 'usePresenceSensor');
      const heatplan_on_level = parseAttrBool(attributes, 'heatplan_on_level');

      return res.status(200).json({
        usePresenceSensor: !!usePresenceSensor,
        heatplan_on_level: !!heatplan_on_level
      });
    } catch (error) {
      console.error('Error fetching customer attributes:', error);
      return res.status(500).json({
        error: 'Failed to fetch customer attributes',
        details: error.message
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const { heatplan_on_level } = req.body;
      if (typeof heatplan_on_level !== 'boolean') {
        return res.status(400).json({ error: 'heatplan_on_level must be a boolean' });
      }

      const updateResponse = await fetchWithTokenRefresh(
        `${TB_API_URL}/api/plugins/telemetry/CUSTOMER/${customerId}/attributes/SERVER_SCOPE`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ heatplan_on_level })
        },
        session,
        req,
        res
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(
          `Error updating customer attributes: ${updateResponse.statusText} — ${errorText}`
        );
      }

      return res.status(200).json({ success: true, heatplan_on_level });
    } catch (error) {
      console.error('Error updating customer attributes:', error);
      return res.status(500).json({
        error: 'Failed to update customer attributes',
        details: error.message
      });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
