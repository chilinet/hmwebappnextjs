import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../auth/[...nextauth]';

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
        //console.log('Customer attributes:', attributes);
        
        // Look for the plans attribute
        const plansAttribute = attributes.find(attr => attr.key === 'plans');
        if (!plansAttribute) {
          return res.status(404).json({ error: 'No plans found for this customer' });
        }

        let plans;
        try {
          plans = JSON.parse(plansAttribute.value);
        } catch (error) {
          console.error('Error parsing plans:', error);
          return res.status(500).json({ error: 'Invalid plans data format' });
        }

        //console.log('Parsed plans:', plans);

        return res.status(200).json({
          plans: plans
        });

      } catch (error) {
        console.error('Error fetching plans:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch plans',
          details: error.message 
        });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
} 