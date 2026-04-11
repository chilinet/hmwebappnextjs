import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../lib/authOptions';
import sql from 'mssql';
import { getConnection } from '../../../../../lib/db';
import {
  extractSubtreeRootedAtAssetId,
  normAssetId
} from '../../../../../lib/heating-control/treeUtils';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }

  switch (req.method) {
    case 'GET':
      try {
        const pool = await getConnection();

        const result = await pool.request()
          .input('customer_id', sql.UniqueIdentifier, id)
          .query(`
            SELECT tree
            FROM customer_settings
            WHERE customer_id = @customer_id
          `);

        if (result.recordset.length === 0) {
          return res.status(404).json({ message: 'Tree not found' });
        }

        let tree = JSON.parse(result.recordset[0].tree);
        if (!Array.isArray(tree)) {
          tree = [];
        }

        // Nur Mandanten-Benutzer (Rolle 3): gekürzte Struktur. Superadmin/Customer Admin brauchen volle Daten (Struktur, User-Bearbeitung).
        const sessionCustomer = session.user?.customerid;
        const userRole = Number(session.user?.role);
        if (
          userRole === 3 &&
          sessionCustomer &&
          normAssetId(sessionCustomer) === normAssetId(id)
        ) {
          const userRow = await pool.request()
            .input('userid', sql.Int, session.user.userid)
            .query(`
              SELECT default_entry_asset_id
              FROM hm_users
              WHERE userid = @userid
            `);
          const entry = userRow.recordset[0]?.default_entry_asset_id;
          if (entry) {
            tree = extractSubtreeRootedAtAssetId(tree, entry.toString());
          }
        }

        return res.status(200).json(tree);
      } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
          message: 'Error fetching tree data',
          error: error.message
        });
      }

    case 'PUT':
      try {
        const { nodeId, name, type, label, operationalMode, operationalDevice } = req.body;
        if (!nodeId) {
          return res.status(400).json({ message: 'Node ID is required' });
        }

        const pool = await getConnection();

        const currentTree = await pool.request()
          .input('customer_id', sql.UniqueIdentifier, id)
          .query(`
            SELECT tree
            FROM customer_settings
            WHERE customer_id = @customer_id
          `);

        if (currentTree.recordset.length === 0) {
          return res.status(404).json({ message: 'Tree not found' });
        }

        const treeData = JSON.parse(currentTree.recordset[0].tree);

        const updateNode = (nodes) => {
          return nodes.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                text: name || node.text,
                name: name || node.name,
                type: type || node.type,
                label: label || node.label,
                data: {
                  ...node.data,
                  type: type || node.data?.type,
                  label: label || node.data?.label,
                  operationalMode: operationalMode !== undefined ? operationalMode : node.data?.operationalMode,
                  operationalDevice: operationalDevice !== undefined ? operationalDevice : node.data?.operationalDevice
                }
              };
            }
            if (node.children) {
              return {
                ...node,
                children: updateNode(node.children)
              };
            }
            return node;
          });
        };

        const updatedTree = updateNode(treeData);

        await pool.request()
          .input('customer_id', sql.UniqueIdentifier, id)
          .input('tree', sql.NVarChar(sql.MAX), JSON.stringify(updatedTree))
          .query(`
            UPDATE customer_settings
            SET tree = @tree
            WHERE customer_id = @customer_id
          `);

        return res.status(200).json(updatedTree);
      } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
          message: 'Error updating tree node',
          error: error.message
        });
      }

    case 'POST':
      try {
        const { parentId, nodeData } = req.body;

        const pool = await getConnection();

        const currentTree = await pool.request()
          .input('customer_id', sql.UniqueIdentifier, id)
          .query(`
            SELECT tree
            FROM customer_settings
            WHERE customer_id = @customer_id
          `);

        if (currentTree.recordset.length === 0) {
          return res.status(404).json({ message: 'Tree not found' });
        }

        const treeData = JSON.parse(currentTree.recordset[0].tree);

        const addNodeToParent = (nodes) => {
          return nodes.map((node) => {
            if (node.id === parentId) {
              return {
                ...node,
                children: [...(node.children || []), {
                  id: nodeData.id,
                  text: nodeData.name,
                  name: nodeData.name,
                  type: nodeData.type,
                  label: nodeData.label,
                  children: [],
                  data: {
                    type: nodeData.type,
                    label: nodeData.label,
                    operationalMode: nodeData.operationalMode || '1',
                    operationalDevice: nodeData.operationalDevice || ''
                  }
                }]
              };
            }
            if (node.children) {
              return {
                ...node,
                children: addNodeToParent(node.children)
              };
            }
            return node;
          });
        };

        const updatedTree = addNodeToParent(treeData);

        await pool.request()
          .input('customer_id', sql.UniqueIdentifier, id)
          .input('tree', sql.NVarChar(sql.MAX), JSON.stringify(updatedTree))
          .query(`
            UPDATE customer_settings
            SET tree = @tree
            WHERE customer_id = @customer_id
          `);

        return res.status(200).json(updatedTree);
      } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
          message: 'Error adding node to tree',
          error: error.message
        });
      }

    default:
      return res.status(405).json({ message: 'Method not allowed' });
  }
}
