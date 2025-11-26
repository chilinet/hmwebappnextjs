import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../auth/[...nextauth]';
import { fetchWithTokenRefresh } from '../../../../../../lib/utils/fetchWithTokenRefresh';

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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all assets for the customer
    const assetsResponse = await fetchWithTokenRefresh(
      `${TB_API_URL}/api/customer/${customerId}/assets?pageSize=10000&page=0`,
      {
        headers: {
          'accept': 'application/json',
        }
      },
      session,
      req,
      res
    );

    if (!assetsResponse.ok) {
      throw new Error(`Error fetching assets: ${assetsResponse.statusText}`);
    }

    const assetsData = await assetsResponse.json();
    const assets = assetsData.data || [];

    if (assets.length === 0) {
      return res.status(200).json({
        isUsed: false,
        usedInAssets: []
      });
    }

    // Get attributes for all assets to check schedulerPlan
    const assetIds = assets.map(asset => asset.id.id);
    const usedInAssets = [];

    // Check attributes for each asset (batch processing to avoid too many requests)
    const batchSize = 50;
    for (let i = 0; i < assetIds.length; i += batchSize) {
      const batch = assetIds.slice(i, i + batchSize);
      
      const attributePromises = batch.map(async (assetId) => {
        try {
          const attrResponse = await fetchWithTokenRefresh(
            `${TB_API_URL}/api/plugins/telemetry/ASSET/${assetId}/values/attributes`,
            {
              headers: {},
            },
            session,
            req,
            res
          );

          if (!attrResponse.ok) {
            return null;
          }

          const attributes = await attrResponse.json();
          const schedulerPlanAttr = attributes.find(attr => attr.key === 'schedulerPlan');
          
          if (schedulerPlanAttr && schedulerPlanAttr.value) {
            try {
              const planArray = JSON.parse(schedulerPlanAttr.value);
              if (Array.isArray(planArray)) {
                // Check if the plan name is used in any day of the week
                const isUsed = planArray.some(dayPlan => dayPlan === planName);
                if (isUsed) {
                  const asset = assets.find(a => a.id.id === assetId);
                  return {
                    assetId: assetId,
                    assetName: asset?.name || 'Unbekannt'
                  };
                }
              }
            } catch (parseError) {
              // Ignore parse errors
            }
          }
          return null;
        } catch (error) {
          console.error(`Error checking asset ${assetId}:`, error);
          return null;
        }
      });

      const results = await Promise.all(attributePromises);
      const validResults = results.filter(r => r !== null);
      usedInAssets.push(...validResults);
    }

    return res.status(200).json({
      isUsed: usedInAssets.length > 0,
      usedInAssets: usedInAssets
    });

  } catch (error) {
    console.error('Error checking plan usage:', error);
    return res.status(500).json({ 
      error: 'Failed to check plan usage',
      details: error.message 
    });
  }
}

