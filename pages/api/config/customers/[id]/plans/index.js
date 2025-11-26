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
          // Return empty array if no plans exist yet
          return res.status(200).json({
            plans: []
          });
        }

        let plans;
        try {
          plans = JSON.parse(plansAttribute.value);
          // Ensure plans is an array
          if (!Array.isArray(plans)) {
            plans = [];
          }
        } catch (error) {
          console.error('Error parsing plans:', error);
          // Return empty array on parse error
          return res.status(200).json({
            plans: []
          });
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

    case 'PUT':
      try {
        // Get current plans
        const getResponse = await fetch(`${TB_API_URL}/api/plugins/telemetry/CUSTOMER/${customerId}/values/attributes`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        });

        if (!getResponse.ok) {
          throw new Error(`Error fetching customer attributes: ${getResponse.statusText}`);
        }

        const attributes = await getResponse.json();
        const plansAttribute = attributes.find(attr => attr.key === 'plans');
        
        let plans = [];
        if (plansAttribute) {
          try {
            const parsedPlans = JSON.parse(plansAttribute.value);
            plans = Array.isArray(parsedPlans) ? parsedPlans : [];
          } catch (error) {
            console.error('Error parsing existing plans:', error);
            plans = [];
          }
        }

        // Update plans with new data
        const { plans: newPlans } = req.body;
        if (!Array.isArray(newPlans)) {
          return res.status(400).json({ error: 'Plans must be an array' });
        }

        // Validate plan structure: each plan should be [name, [24 temperatures]]
        for (const plan of newPlans) {
          if (!Array.isArray(plan) || plan.length !== 2) {
            return res.status(400).json({ error: 'Invalid plan structure. Each plan must be [name, [temperatures]]' });
          }
          if (typeof plan[0] !== 'string') {
            return res.status(400).json({ error: 'Plan name must be a string' });
          }
          if (!Array.isArray(plan[1]) || plan[1].length !== 24) {
            return res.status(400).json({ error: 'Plan temperatures must be an array of 24 values' });
          }
        }

        // Save updated plans
        const updateResponse = await fetch(
          `${TB_API_URL}/api/plugins/telemetry/CUSTOMER/${customerId}/attributes/SERVER_SCOPE`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${session.tbToken}`
            },
            body: JSON.stringify({
              plans: JSON.stringify(newPlans)
            })
          }
        );

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          throw new Error(`Error updating plans: ${updateResponse.statusText} - ${errorText}`);
        }

        return res.status(200).json({
          success: true,
          plans: newPlans
        });

      } catch (error) {
        console.error('Error updating plans:', error);
        return res.status(500).json({ 
          error: 'Failed to update plans',
          details: error.message 
        });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
} 