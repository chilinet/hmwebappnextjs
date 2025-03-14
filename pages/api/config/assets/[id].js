import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';

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
        const response = await fetch(`${TB_API_URL}/api/asset/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        });

        if (!response.ok) {
          throw new Error(`Error fetching asset details: ${response.statusText}`);
        }

        const assetData = await response.json();
        return res.status(200).json({
          id: assetData.id.id,
          name: assetData.name,
          type: assetData.type,
          label: assetData.label,
          additionalInfo: assetData.additionalInfo,
          createdTime: assetData.createdTime,
          attributes: assetData.attributes || {}
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
        const getResponse = await fetch(`${TB_API_URL}/api/asset/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        });

        if (!getResponse.ok) {
          throw new Error(`Error fetching current asset: ${getResponse.statusText}`);
        }

        const currentAsset = await getResponse.json();
        
        // Aktualisierte Daten vorbereiten
        const updatedAsset = {
          ...currentAsset,
          name: req.body.name,
          type: req.body.type,
          label: req.body.label
        };

        // Asset in Thingsboard aktualisieren
        const updateResponse = await fetch(`${TB_API_URL}/api/asset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          },
          body: JSON.stringify(updatedAsset)
        });

        if (!updateResponse.ok) {
          throw new Error(`Error updating asset: ${updateResponse.statusText}`);
        }

        const updatedData = await updateResponse.json();
        return res.status(200).json({
          id: updatedData.id.id,
          name: updatedData.name,
          type: updatedData.type,
          label: updatedData.label,
          additionalInfo: updatedData.additionalInfo,
          createdTime: updatedData.createdTime,
          attributes: updatedData.attributes || {}
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