import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../auth/[...nextauth]';
import { fetchWithTokenRefresh } from '../../../../../../lib/utils/fetchWithTokenRefresh';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id: customerId } = req.query;
  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { oldPlanName, newPlanName } = req.body;
  if (!oldPlanName || !newPlanName) {
    return res.status(400).json({ error: 'Old plan name and new plan name are required' });
  }

  const TB_API_URL = process.env.THINGSBOARD_URL;

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
        success: true,
        updatedAssets: 0,
        message: 'No assets found'
      });
    }

    const assetIds = assets.map(asset => asset.id.id);
    const updatedAssets = [];
    const failedAssets = [];

    // Process assets in batches
    const batchSize = 50;
    for (let i = 0; i < assetIds.length; i += batchSize) {
      const batch = assetIds.slice(i, i + batchSize);
      
      const updatePromises = batch.map(async (assetId) => {
        try {
          // Get current attributes
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
            return { assetId, success: false, error: 'Failed to fetch attributes' };
          }

          const attributes = await attrResponse.json();
          const schedulerPlanAttr = attributes.find(attr => attr.key === 'schedulerPlan');
          
          if (!schedulerPlanAttr || !schedulerPlanAttr.value) {
            return { assetId, success: false, skipped: true };
          }

          try {
            const planArray = JSON.parse(schedulerPlanAttr.value);
            if (!Array.isArray(planArray)) {
              return { assetId, success: false, skipped: true };
            }

            // Check if the old plan name is used and replace it
            const hasOldPlan = planArray.some(dayPlan => dayPlan === oldPlanName);
            if (!hasOldPlan) {
              return { assetId, success: false, skipped: true };
            }

            // Replace old plan name with new plan name
            const updatedPlanArray = planArray.map(dayPlan => 
              dayPlan === oldPlanName ? newPlanName : dayPlan
            );

            // Update the asset attribute
            const updateResponse = await fetchWithTokenRefresh(
              `${TB_API_URL}/api/plugins/telemetry/ASSET/${assetId}/attributes/SERVER_SCOPE`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  schedulerPlan: JSON.stringify(updatedPlanArray)
                })
              },
              session,
              req,
              res
            );

            if (!updateResponse.ok) {
              const errorText = await updateResponse.text();
              return { 
                assetId, 
                success: false, 
                error: `Failed to update: ${updateResponse.status} - ${errorText}` 
              };
            }

            const asset = assets.find(a => a.id.id === assetId);
            return { 
              assetId, 
              assetName: asset?.name || 'Unbekannt',
              success: true 
            };
          } catch (parseError) {
            return { assetId, success: false, error: 'Parse error' };
          }
        } catch (error) {
          console.error(`Error updating asset ${assetId}:`, error);
          return { assetId, success: false, error: error.message };
        }
      });

      const results = await Promise.all(updatePromises);
      
      results.forEach(result => {
        if (result.success) {
          updatedAssets.push(result);
        } else if (!result.skipped) {
          failedAssets.push(result);
        }
      });
    }

    return res.status(200).json({
      success: true,
      updatedAssets: updatedAssets.length,
      failedAssets: failedAssets.length,
      updatedAssetList: updatedAssets.map(a => ({ assetId: a.assetId, assetName: a.assetName })),
      failedAssetList: failedAssets.map(a => ({ assetId: a.assetId, error: a.error }))
    });

  } catch (error) {
    console.error('Error updating plan name in assets:', error);
    return res.status(500).json({ 
      error: 'Failed to update plan name in assets',
      details: error.message 
    });
  }
}

