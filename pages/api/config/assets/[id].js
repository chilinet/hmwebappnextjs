import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

// Funktion zum Abrufen der Asset-Attribute mit Timeout
async function fetchAssetAttributes(assetId, tbToken) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 Sekunden Timeout
    
    try {
      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/ASSET/${assetId}/values/attributes`,
        {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`Failed to fetch attributes for asset ${assetId}: ${response.status}`);
        return {};
      }

      const attributes = await response.json();

      // Extrahiere die gewünschten Attribute
      const extractedAttributes = {};
      const attributeKeys = [
        'operationalMode',
        'childLock', 
        'fixValue',
        'maxTemp',
        'minTemp',
        'extTempDevice',
        'overruleMinutes',
        'runStatus',
        'schedulerPlan',
        'windowSensor',
        'windowStates'
      ];

      attributeKeys.forEach(key => {
        const attribute = attributes.find(attr => attr.key === key);
        if (attribute) {
          extractedAttributes[key] = attribute.value;
        }
      });

      return extractedAttributes;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // Ignoriere Timeout-Fehler stillschweigend
      if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
        console.warn(`Error fetching attributes for asset ${assetId}:`, fetchError.message || fetchError);
      }
      return {};
    }
  } catch (error) {
    // Ignoriere Timeout-Fehler
    if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
      console.warn(`Error fetching attributes for asset ${assetId}:`, error.message || error);
    }
    return {};
  }
}

// Funktion zum Abrufen der Asset-Details
async function fetchAssetDetails(assetId, tbToken) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 Sekunden Timeout
    
    try {
      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/asset/${assetId}`,
        {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`Failed to fetch asset details for ${assetId}: ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
        console.warn(`Error fetching asset details for ${assetId}:`, fetchError.message || fetchError);
      }
      return null;
    }
  } catch (error) {
    if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
      console.warn(`Error fetching asset details for ${assetId}:`, error.message || error);
    }
    return null;
  }
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ message: 'Asset ID is required' });
  }

  try {
    const tbToken = session.tbToken;
    if (!tbToken) {
      return res.status(401).json({ message: 'ThingsBoard token not available' });
    }

    // Prüfe ob es ein Tree-Only-Update ist (für untergeordnete Nodes)
    const isTreeOnlyUpdate = req.headers['x-tree-only-update'] === 'true';

    if (req.method === 'GET') {
      // Hole Asset-Details und Attribute direkt aus ThingsBoard
      const [assetDetails, attributes] = await Promise.all([
        fetchAssetDetails(id, tbToken),
        fetchAssetAttributes(id, tbToken)
      ]);

      if (!assetDetails) {
        return res.status(404).json({ message: 'Asset not found' });
      }

      return res.status(200).json({
        id: assetDetails.id?.id || id,
        name: assetDetails.name,
        type: assetDetails.type,
        label: assetDetails.label,
        attributes: attributes
      });
    } else if (req.method === 'PUT') {
      const { minTemp, maxTemp, overruleMinutes, runStatus, fixValue, schedulerPlan, childLock, windowSensor } = req.body;

      // Wenn es ein Tree-Only-Update ist, überspringe ThingsBoard Update
      if (isTreeOnlyUpdate) {
        return res.status(200).json({ message: 'Tree-only update skipped' });
      }

      // Aktualisiere Attribute in ThingsBoard
      const attributesToUpdate = {};
      
      if (minTemp !== undefined) attributesToUpdate.minTemp = minTemp;
      if (maxTemp !== undefined) attributesToUpdate.maxTemp = maxTemp;
      if (overruleMinutes !== undefined) attributesToUpdate.overruleMinutes = overruleMinutes;
      if (runStatus !== undefined) attributesToUpdate.runStatus = runStatus;
      if (fixValue !== undefined) attributesToUpdate.fixValue = fixValue;
      if (schedulerPlan !== undefined) attributesToUpdate.schedulerPlan = schedulerPlan;
      if (childLock !== undefined) attributesToUpdate.childLock = childLock;
      if (windowSensor !== undefined) attributesToUpdate.windowSensor = windowSensor;

      if (Object.keys(attributesToUpdate).length === 0) {
        return res.status(400).json({ message: 'No attributes to update' });
      }

      // Sende Attribute an ThingsBoard (als JSON-Objekt, nicht als Array)
      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/ASSET/${id}/attributes/SERVER_SCOPE`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${tbToken}`
          },
          body: JSON.stringify(attributesToUpdate)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to update asset attributes: ${response.status} - ${errorText}`);
        return res.status(response.status).json({ 
          message: 'Failed to update asset attributes',
          error: errorText 
        });
      }

      // Hole aktualisierte Attribute zurück
      const updatedAttributes = await fetchAssetAttributes(id, tbToken);

      return res.status(200).json({
        success: true,
        attributes: updatedAttributes
      });
    } else {
      return res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in asset API:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
}

