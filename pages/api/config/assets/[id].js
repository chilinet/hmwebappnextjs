import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';
import thingsboardAuth from '../../thingsboard/auth';

// Hilfsfunktion zum Finden eines Nodes in der Tree-Struktur
function findNodeInTree(nodes, nodeId) {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeInTree(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
}

// Hilfsfunktion zum Laden der Tree-Daten aus customer_settings
async function loadTreeDataFromCustomerSettings(customerId) {
  const connection = await getConnection();
  try {
    const result = await connection.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query('SELECT tree FROM customer_settings WHERE customer_id = @customerId');
    
    if (result.recordset.length === 0) {
      return null;
    }
    
    return JSON.parse(result.recordset[0].tree);
  } catch (error) {
    console.error('Error loading tree data:', error);
    return null;
  } finally {
    await connection.close();
  }
}

// Hilfsfunktion zum Aktualisieren der Tree-Daten in customer_settings
async function updateTreeDataInCustomerSettings(customerId, treeData) {
  const connection = await getConnection();
  try {
    await connection.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .input('treeData', sql.NVarChar, JSON.stringify(treeData))
      .query('UPDATE customer_settings SET tree = @treeData WHERE customer_id = @customerId');
    
    console.log('Tree data updated successfully in customer_settings');
    return true;
  } catch (error) {
    console.error('Error updating tree data:', error);
    return false;
  } finally {
    await connection.close();
  }
}

// Hilfsfunktion zum Aktualisieren eines Nodes in der Tree-Struktur
function updateNodeInTree(nodes, nodeId, updates) {
  return nodes.map(node => {
    if (node.id === nodeId) {
      return {
        ...node,
        ...updates
      };
    }
    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateNodeInTree(node.children, nodeId, updates)
      };
    }
    return node;
  });
}

// Hilfsfunktion für ThingsBoard-API-Calls mit Token-Erneuerung
async function makeThingsBoardRequest(url, options, session) {
  try {
    const response = await fetch(url, options);
    
    // Wenn der Token abgelaufen ist, versuche ihn zu erneuern
    if (response.status === 401) {
      console.log('Token expired, attempting to refresh...');
      
      try {
        // Hole neue Anmeldedaten aus der Session
        const newToken = await thingsboardAuth(
          process.env.THINGSBOARD_USERNAME,
          process.env.THINGSBOARD_PASSWORD
        );
        
        // Aktualisiere den Token in der Session
        session.tbToken = newToken;
        
        // Wiederhole den ursprünglichen Request mit dem neuen Token
        const newOptions = {
          ...options,
          headers: {
            ...options.headers,
            'X-Authorization': `Bearer ${newToken}`
          }
        };
        
        const retryResponse = await fetch(url, newOptions);
        if (!retryResponse.ok) {
          throw new Error(`Request failed after token refresh: ${retryResponse.statusText}`);
        }
        
        return retryResponse;
      } catch (refreshError) {
        console.error('Failed to refresh token:', refreshError);
        throw new Error('Token refresh failed');
      }
    }
    
    return response;
  } catch (error) {
    throw error;
  }
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Asset ID is required' });
  }

  const TB_API_URL = process.env.THINGSBOARD_URL;

  switch (req.method) {
    case 'GET':
      try {
        const response = await makeThingsBoardRequest(`${TB_API_URL}/api/asset/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        }, session);

        if (!response.ok) {
          throw new Error(`Error fetching asset details: ${response.statusText}`);
        }

        const assetData = await response.json();
        
        // Asset-Attribute separat abrufen
        let assetAttributes = {};
        try {
          const attributesResponse = await makeThingsBoardRequest(`${TB_API_URL}/api/plugins/telemetry/ASSET/${id}/values/attributes`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${session.tbToken}`
            }
          }, session);

          if (attributesResponse.ok) {
            const attributesData = await attributesResponse.json();
            if (Array.isArray(attributesData)) {
              attributesData.forEach(attr => {
                assetAttributes[attr.key] = attr.value;
              });
            }
          }
        } catch (error) {
          console.error('Error fetching asset attributes:', error);
        }

        // Lade operationalMode und extTempDevice aus der customer_settings.tree Tabelle
        let operationalMode = '0';
        let extTempDevice = '';
        
        try {
          const customerId = session.user?.customerid || '2EA4BA70-647A-11EF-8CD8-8B580D9AA086';
          const treeData = await loadTreeDataFromCustomerSettings(customerId);
          
          if (treeData) {
            const nodeInTree = findNodeInTree(treeData, id);
            if (nodeInTree) {
              operationalMode = nodeInTree.operationalMode || '0';
              extTempDevice = nodeInTree.extTempDevice || '';
              console.log(`Found operationalMode in tree for ${id}:`, operationalMode, 'extTempDevice:', extTempDevice);
            } else {
              console.log(`Node ${id} not found in tree data`);
            }
          }
        } catch (error) {
          console.error('Error loading operationalMode from tree:', error);
          // Fallback zu ThingsBoard Attributen
          operationalMode = assetAttributes.operationalMode || '0';
          extTempDevice = assetAttributes.extTempDevice || '';
        }

        return res.status(200).json({
          id: assetData.id.id,
          name: assetData.name,
          type: assetData.type,
          label: assetData.label,
          additionalInfo: assetData.additionalInfo,
          createdTime: assetData.createdTime,
          attributes: assetAttributes,
          operationalMode: operationalMode,
          extTempDevice: extTempDevice
        });
      } catch (error) {
        console.error('Error in asset details API:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch asset details',
          details: error.message 
        });
      }

    case 'PUT':
      try {
        // Aktuelle Asset-Daten abrufen
        const getResponse = await makeThingsBoardRequest(`${TB_API_URL}/api/asset/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        }, session);

        if (!getResponse.ok) {
          throw new Error(`Error fetching current asset: ${getResponse.statusText}`);
        }

        const currentAsset = await getResponse.json();
        
        // Wenn nur Attribute gesetzt werden, aktualisiere nur die Attribute
        if ((req.body.runStatus || req.body.fixValue || req.body.schedulerPlan || req.body.childLock !== undefined || req.body.minTemp !== undefined || req.body.maxTemp !== undefined || req.body.overruleMinutes !== undefined || req.body.operationalMode !== undefined || req.body.extTempDevice !== undefined) && !req.body.name && !req.body.type && !req.body.label) {
          try {
            // Trenne operationalMode und extTempDevice von anderen Attributen
            const treeUpdates = {};
            const attributesBody = {};
            
            if (req.body.operationalMode !== undefined) {
              treeUpdates.operationalMode = req.body.operationalMode;
            }
            if (req.body.extTempDevice !== undefined) {
              treeUpdates.extTempDevice = req.body.extTempDevice;
            }
            
            // Andere Attribute für ThingsBoard
            if (req.body.runStatus) attributesBody.runStatus = req.body.runStatus;
            if (req.body.fixValue) attributesBody.fixValue = req.body.fixValue;
            if (req.body.schedulerPlan) attributesBody.schedulerPlan = req.body.schedulerPlan;
            if (req.body.childLock !== undefined) attributesBody.childLock = req.body.childLock;
            if (req.body.minTemp !== undefined) attributesBody.minTemp = req.body.minTemp;
            if (req.body.maxTemp !== undefined) attributesBody.maxTemp = req.body.maxTemp;
            if (req.body.overruleMinutes !== undefined) attributesBody.overruleMinutes = req.body.overruleMinutes;
              
            // Aktualisiere operationalMode und extTempDevice in der Tree-Struktur
            if (Object.keys(treeUpdates).length > 0) {
              const customerId = session.user?.customerid || '2EA4BA70-647A-11EF-8CD8-8B580D9AA086';
              const treeData = await loadTreeDataFromCustomerSettings(customerId);
              
              if (treeData) {
                const updatedTreeData = updateNodeInTree(treeData, id, treeUpdates);
                const treeUpdateSuccess = await updateTreeDataInCustomerSettings(customerId, updatedTreeData);
                
                if (!treeUpdateSuccess) {
                  console.error('Failed to update tree data');
                } else {
                  console.log('Tree data updated successfully:', treeUpdates);
                }
              } else {
                console.error('Could not load tree data for update');
              }
            }
            
            // Aktualisiere andere Attribute in ThingsBoard (nur wenn welche vorhanden sind)
            if (Object.keys(attributesBody).length > 0) {
              console.log('Updating asset attributes with:', attributesBody);
              
              const attributesResponse = await makeThingsBoardRequest(`${TB_API_URL}/api/plugins/telemetry/ASSET/${id}/attributes/SERVER_SCOPE`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Authorization': `Bearer ${session.tbToken}`
                },
                body: JSON.stringify(attributesBody)
              }, session);

              if (!attributesResponse.ok) {
                const errorText = await attributesResponse.text();
                console.error('Error updating asset attributes:', attributesResponse.status, errorText);
                throw new Error(`Failed to update asset attributes: ${attributesResponse.statusText}`);
              } else {
                console.log('Asset attributes updated successfully in ThingsBoard');
                console.log('Response status:', attributesResponse.status);
              }
            }
            
            // Hole die aktualisierten Asset-Daten zurück
            const getResponse = await makeThingsBoardRequest(`${TB_API_URL}/api/asset/${id}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            }, session);

            if (!getResponse.ok) {
              throw new Error(`Error fetching updated asset: ${getResponse.statusText}`);
            }

            const assetData = await getResponse.json();
            
            // Asset-Attribute separat abrufen
            let assetAttributes = {};
            try {
              const attributesResponse = await makeThingsBoardRequest(`${TB_API_URL}/api/plugins/telemetry/ASSET/${id}/values/attributes`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Authorization': `Bearer ${session.tbToken}`
                }
              }, session);

              if (attributesResponse.ok) {
                const attributesData = await attributesResponse.json();
                if (Array.isArray(attributesData)) {
                  attributesData.forEach(attr => {
                    assetAttributes[attr.key] = attr.value;
                  });
                }
              }
            } catch (error) {
              console.error('Error fetching asset attributes:', error);
            }

            // Lade operationalMode und extTempDevice aus der Tree-Struktur
            let operationalMode = '0';
            let extTempDevice = '';
            
            try {
              const customerId = session.user?.customerid || '2EA4BA70-647A-11EF-8CD8-8B580D9AA086';
              const treeData = await loadTreeDataFromCustomerSettings(customerId);
              
              if (treeData) {
                const nodeInTree = findNodeInTree(treeData, id);
                if (nodeInTree) {
                  operationalMode = nodeInTree.operationalMode || '0';
                  extTempDevice = nodeInTree.extTempDevice || '';
                }
              }
            } catch (error) {
              console.error('Error loading operationalMode from tree:', error);
              // Fallback zu ThingsBoard Attributen
              operationalMode = assetAttributes.operationalMode || '0';
              extTempDevice = assetAttributes.extTempDevice || '';
            }

            return res.status(200).json({
              id: assetData.id.id,
              name: assetData.name,
              type: assetData.type,
              label: assetData.label,
              additionalInfo: assetData.additionalInfo,
              createdTime: assetData.createdTime,
              attributes: assetAttributes,
              operationalMode: operationalMode,
              extTempDevice: extTempDevice
            });
          } catch (error) {
            console.error('Error updating asset attributes:', error);
            return res.status(500).json({ 
              error: 'Failed to update asset attributes',
              details: error.message 
            });
          }
        }

        // Wenn andere Felder aktualisiert werden, aktualisiere das Asset
        const updatedAsset = {
          ...currentAsset,
          name: req.body.name || currentAsset.name,
          type: req.body.type || currentAsset.type,
          label: req.body.label || currentAsset.label
        };

        // Aktualisiere operationalMode und extTempDevice in der Tree-Struktur
        const treeUpdates = {};
        if (req.body.operationalMode !== undefined) {
          treeUpdates.operationalMode = req.body.operationalMode;
        }
        if (req.body.extTempDevice !== undefined) {
          treeUpdates.extTempDevice = req.body.extTempDevice;
        }
        
        if (Object.keys(treeUpdates).length > 0) {
          try {
            const customerId = session.user?.customerid || '2EA4BA70-647A-11EF-8CD8-8B580D9AA086';
            const treeData = await loadTreeDataFromCustomerSettings(customerId);
            
            if (treeData) {
              const updatedTreeData = updateNodeInTree(treeData, id, treeUpdates);
              const treeUpdateSuccess = await updateTreeDataInCustomerSettings(customerId, updatedTreeData);
              
              if (!treeUpdateSuccess) {
                console.error('Failed to update tree data');
              } else {
                console.log('Tree data updated successfully:', treeUpdates);
              }
            } else {
              console.error('Could not load tree data for update');
            }
          } catch (error) {
            console.error('Error updating tree data:', error);
          }
        }

        // Asset in Thingsboard aktualisieren
        const updateResponse = await makeThingsBoardRequest(`${TB_API_URL}/api/asset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          },
          body: JSON.stringify(updatedAsset)
        }, session);

        if (!updateResponse.ok) {
          throw new Error(`Error updating asset: ${updateResponse.statusText}`);
        }

        const updatedData = await updateResponse.json();

        // Wenn das Label aktualisiert wurde, muss auch der Tree-Cache in der Datenbank aktualisiert werden
        if (req.body.label) {
          try {
            // Hole die customer_id des Users
            const pool = await getConnection();
            const userResult = await pool.request()
              .input('userid', sql.Int, session.user.userid)
              .query(`
                SELECT customerid
                FROM hm_users
                WHERE userid = @userid
              `);

            if (userResult.recordset.length > 0) {
              const customerId = userResult.recordset[0].customerid;

              // Hole den aktuellen Tree-Cache
              const treeResult = await pool.request()
                .input('customer_id', sql.UniqueIdentifier, customerId)
                .query(`
                  SELECT tree
                  FROM customer_settings
                  WHERE customer_id = @customer_id
                `);

              if (treeResult.recordset.length > 0) {
                const tree = JSON.parse(treeResult.recordset[0].tree);
                
                // Funktion zum Aktualisieren des Labels im Tree
                function updateNodeLabel(nodes, nodeId, newLabel) {
                  return nodes.map(node => {
                    if (node.id === nodeId) {
                      return { ...node, label: newLabel, name: newLabel };
                    }
                    if (node.children) {
                      return { ...node, children: updateNodeLabel(node.children, nodeId, newLabel) };
                    }
                    return node;
                  });
                }

                // Aktualisiere das Label im Tree
                const updatedTree = updateNodeLabel(tree, id, req.body.label);

                // Speichere den aktualisierten Tree zurück in die Datenbank
                await pool.request()
                  .input('customer_id', sql.UniqueIdentifier, customerId)
                  .input('tree', sql.NVarChar(sql.MAX), JSON.stringify(updatedTree))
                  .query(`
                    UPDATE customer_settings 
                    SET tree = @tree,
                        tree_updated = GETDATE()
                    WHERE customer_id = @customer_id
                  `);

                console.log('Tree cache updated with new label');
              }
            }
          } catch (error) {
            console.error('Error updating tree cache:', error);
            // Nicht kritisch - das Asset wurde bereits aktualisiert
          }
        }

        // Hole die aktualisierten Attribute
        let assetAttributes = {};
        try {
          const attributesResponse = await makeThingsBoardRequest(`${TB_API_URL}/api/plugins/telemetry/ASSET/${id}/values/attributes`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${session.tbToken}`
            }
          }, session);

          if (attributesResponse.ok) {
            const attributesData = await attributesResponse.json();
            if (Array.isArray(attributesData)) {
              attributesData.forEach(attr => {
                assetAttributes[attr.key] = attr.value;
              });
            }
          }
        } catch (error) {
          console.error('Error fetching updated asset attributes:', error);
        }

        // Lade operationalMode und extTempDevice aus der Tree-Struktur
        let operationalMode = '0';
        let extTempDevice = '';
        
        try {
          const customerId = session.user?.customerid || '2EA4BA70-647A-11EF-8CD8-8B580D9AA086';
          const treeData = await loadTreeDataFromCustomerSettings(customerId);
          
          if (treeData) {
            const nodeInTree = findNodeInTree(treeData, id);
            if (nodeInTree) {
              operationalMode = nodeInTree.operationalMode || '0';
              extTempDevice = nodeInTree.extTempDevice || '';
            }
          }
        } catch (error) {
          console.error('Error loading operationalMode from tree:', error);
          // Fallback zu ThingsBoard Attributen
          operationalMode = assetAttributes.operationalMode || '0';
          extTempDevice = assetAttributes.extTempDevice || '';
        }

        return res.status(200).json({
          id: updatedData.id.id,
          name: updatedData.name,
          type: updatedData.type,
          label: updatedData.label,
          additionalInfo: updatedData.additionalInfo,
          createdTime: updatedData.createdTime,
          attributes: assetAttributes,
          operationalMode: operationalMode,
          extTempDevice: extTempDevice
        });

      } catch (error) {
        console.error('Error updating asset:', error);
        return res.status(500).json({ 
          error: 'Failed to update asset',
          details: error.message 
        });
      }

    case 'DELETE':
      try {
        // 1. Hole die customer_id des Users
        const pool = await getConnection();
        const userResult = await pool.request()
          .input('userid', sql.Int, session.user.userid)
          .query(`
            SELECT customerid
            FROM hm_users
            WHERE userid = @userid
          `);

        if (userResult.recordset.length === 0) {
          throw new Error('User not found');
        }

        const customerId = userResult.recordset[0].customerid;

        // 2. Prüfe ob der Node Kinder hat
        const treeResult = await pool.request()
          .input('customer_id', sql.UniqueIdentifier, customerId)
          .query(`
            SELECT tree
            FROM customer_settings
            WHERE customer_id = @customer_id
          `);

        if (treeResult.recordset.length > 0) {
          const tree = JSON.parse(treeResult.recordset[0].tree);
          const hasChildren = tree.some(node => node.parent === id);
          
          if (hasChildren) {
            return res.status(400).json({ 
              message: 'Cannot delete node with children. Please delete or move children first.' 
            });
          }
        }

        // 3. Lösche den Asset in ThingsBoard
        const deleteAssetResponse = await fetch(
          `${process.env.THINGSBOARD_URL}/api/asset/${id}`,
          {
            method: 'DELETE',
            headers: {
              'X-Authorization': `Bearer ${session.tbToken}`
            }
          }
        );

        if (!deleteAssetResponse.ok) {
          throw new Error('Failed to delete asset in ThingsBoard');
        }

        // 4. Aktualisiere den Tree in der Datenbank
        function removeNode(tree, nodeId) {
          return tree
            .filter(node => node.id !== nodeId) // Entfernt das Element auf oberster Ebene
            .map(node => ({
              ...node,
              children: removeNode(node.children || [], nodeId) // Durchsucht rekursiv `children`
            }));
        }
        
        const updatedTree = removeNode(JSON.parse(treeResult.recordset[0].tree), id);
        
        await pool.request()
          .input('customer_id', sql.UniqueIdentifier, customerId)
          .input('tree', sql.NVarChar(sql.MAX), JSON.stringify(updatedTree))
          .query(`
            UPDATE customer_settings 
            SET tree = @tree,
                tree_updated = GETDATE()
            WHERE customer_id = @customer_id
          `);

        return res.status(200).json({ 
          success: true,
          message: 'Asset successfully deleted'
        });

      } catch (error) {
        console.error('Error deleting asset:', error);
        return res.status(500).json({
          message: 'Error deleting asset',
          error: error.message
        });
      }

    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
} 