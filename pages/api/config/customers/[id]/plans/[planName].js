import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../auth/[...nextauth]';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id: customerId, planName } = req.query;
  if (!customerId || !planName) {
    return res.status(400).json({ error: 'Customer ID and plan name are required' });
  }

  const TB_API_URL = process.env.THINGSBOARD_URL;

  switch (req.method) {
    case 'GET':
      try {
        // Get customer attributes containing the plans
        const response = await fetch(`${TB_API_URL}/api/plugins/telemetry/CUSTOMER/${customerId}/values/attributes`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        });

        if (!response.ok) {
          throw new Error(`Error fetching customer attributes: ${response.statusText}`);
        }

        const attributes = await response.json();
        //console.log(attributes);
        // Look for the plans attribute
        const plansAttribute = attributes.find(attr => attr.key === 'plans');
        if (!plansAttribute) {
          return res.status(404).json({ error: 'No plans found for this customer' });
        }

        let plans;
        try {
          plans = JSON.parse(plansAttribute.value);
        } catch (error) {
          return res.status(500).json({ error: 'Invalid plans data format' });
        }

        // Find the specific plan
        const requestedPlan = plans[planName];
        if (!requestedPlan) {
          return res.status(404).json({ error: `Plan '${planName}' not found` });
        }

        return res.status(200).json({
          planName: planName,
          plan: requestedPlan
        });

      } catch (error) {
        console.error('Error fetching plan:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch plan',
          details: error.message 
        });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
} 