import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { getConnection } from "../../../../lib/db";
import sql from 'mssql';

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
        'operationalDevice',
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

// Funktion zum Entfernen eines Assets aus dem Tree (rekursiv)
function removeNodeFromTree(tree, nodeId) {
  if (!Array.isArray(tree)) {
    return tree;
  }

  // Entferne das Asset direkt aus dem Array
  const filteredTree = tree.filter(node => {
    // Prüfe ob es das zu löschende Asset ist
    if (node.id === nodeId) {
      return false;
    }
    
    // Wenn es Kinder hat, entferne das Asset auch rekursiv aus den Kindern
    if (node.children && Array.isArray(node.children)) {
      node.children = removeNodeFromTree(node.children, nodeId);
    }
    
    return true;
  });

  return filteredTree;
}

// Funktion zum Aktualisieren des Trees in customer_settings
async function removeAssetFromTree(customerId, assetId) {
  const pool = await getConnection();
  
  // Tree aus der Datenbank laden
  const treeResult = await pool.request()
    .input('customer_id', sql.UniqueIdentifier, customerId)
    .query('SELECT tree FROM customer_settings WHERE customer_id = @customer_id');

  if (treeResult.recordset.length === 0) {
    throw new Error('No tree found for customer');
  }

  const currentTree = JSON.parse(treeResult.recordset[0].tree);
  
  // Asset aus dem Tree entfernen
  const updatedTree = removeNodeFromTree(currentTree, assetId);

  // Aktualisierten Tree in der Datenbank speichern
  await pool.request()
    .input('customer_id', sql.UniqueIdentifier, customerId)
    .input('tree', sql.NVarChar(sql.MAX), JSON.stringify(updatedTree))
    .query(`
      UPDATE customer_settings 
      SET tree = @tree, tree_updated = GETDATE()
      WHERE customer_id = @customer_id;

      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO customer_settings (customer_id, tree, tree_updated)
        VALUES (@customer_id, @tree, GETDATE());
      END
    `);

  return updatedTree;
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
      const { minTemp, maxTemp, overruleMinutes, runStatus, fixValue, schedulerPlan, childLock, windowSensor, operationalMode, operationalDevice, extTempDevice } = req.body;

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
      if (operationalMode !== undefined) attributesToUpdate.operationalMode = operationalMode;
      if (operationalDevice !== undefined) attributesToUpdate.operationalDevice = operationalDevice;
      if (extTempDevice !== undefined) {
        // Wenn extTempDevice null ist, entferne das Attribut (setze es auf null)
        attributesToUpdate.extTempDevice = extTempDevice;
      }

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
    } else if (req.method === 'DELETE') {
      // Lösche Asset aus ThingsBoard
      const deleteResponse = await fetch(
        `${process.env.THINGSBOARD_URL}/api/asset/${id}`,
        {
          method: 'DELETE',
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          }
        }
      );

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        
        // Wenn Asset nicht gefunden wurde, ist es bereits in ThingsBoard gelöscht
        if (deleteResponse.status === 404) {
          console.log(`Asset ${id} not found in ThingsBoard, removing from tree only...`);
          
          // Nur aus dem Tree entfernen, nicht aus ThingsBoard löschen
          try {
            const customerId = session.user?.customerid;
            if (!customerId) {
              return res.status(400).json({ message: 'Customer ID not found in session' });
            }

            await removeAssetFromTree(customerId, id);
            
            // Bereinige zugehörige Bilder aus der Datenbank
            try {
              const pool = await getConnection();
              if (pool) {
                const deleteImagesResult = await pool.request()
                  .input('assetId', sql.NVarChar, id)
                  .query('DELETE FROM asset_images WHERE asset_id = @assetId');
                
                console.log(`Deleted ${deleteImagesResult.rowsAffected[0]} image(s) for asset ${id}`);
              }
            } catch (dbError) {
              console.warn(`Failed to clean up asset images from database:`, dbError.message);
            }

            return res.status(200).json({
              success: true,
              message: 'Asset removed from tree (already deleted in ThingsBoard)'
            });
          } catch (treeError) {
            console.error(`Failed to remove asset from tree:`, treeError);
            return res.status(500).json({
              message: 'Failed to remove asset from tree',
              error: treeError.message
            });
          }
        } else {
          // Andere Fehler von ThingsBoard
          console.error(`Failed to delete asset from ThingsBoard: ${deleteResponse.status} - ${errorText}`);
          return res.status(deleteResponse.status).json({
            message: 'Failed to delete asset from ThingsBoard',
            error: errorText
          });
        }
      }

      // Asset wurde erfolgreich aus ThingsBoard gelöscht
      // Jetzt auch aus dem Tree entfernen
      try {
        const customerId = session.user?.customerid;
        if (customerId) {
          await removeAssetFromTree(customerId, id);
          console.log(`Asset ${id} removed from tree after successful ThingsBoard deletion`);
        }
      } catch (treeError) {
        // Logge Fehler, aber breche nicht ab, da ThingsBoard-Löschung erfolgreich war
        console.warn(`Failed to remove asset from tree:`, treeError.message);
      }

      // Bereinige zugehörige Bilder aus der Datenbank
      try {
        const pool = await getConnection();
        if (pool) {
          const deleteImagesResult = await pool.request()
            .input('assetId', sql.NVarChar, id)
            .query('DELETE FROM asset_images WHERE asset_id = @assetId');
          
          console.log(`Deleted ${deleteImagesResult.rowsAffected[0]} image(s) for asset ${id}`);
        }
      } catch (dbError) {
        // Logge Datenbankfehler, aber breche nicht ab, wenn ThingsBoard-Löschung erfolgreich war
        console.warn(`Failed to clean up asset images from database:`, dbError.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Asset successfully deleted'
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

