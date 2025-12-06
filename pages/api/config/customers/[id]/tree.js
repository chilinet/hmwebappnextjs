import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import sql from 'mssql';

// Determine if this is a local connection
const isLocalConnection = process.env.MSSQL_SERVER === '127.0.0.1' || 
                          process.env.MSSQL_SERVER === 'localhost' ||
                          process.env.MSSQL_SERVER?.includes('localhost');

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: !isLocalConnection, // Disable encryption for local connections
    trustServerCertificate: true
  }
};

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }

  let pool;

  switch (req.method) {
    case 'GET':
      try {
        pool = await sql.connect(config);
        
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

        const tree = JSON.parse(result.recordset[0].tree);
        return res.status(200).json(tree);

      } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
          message: 'Error fetching tree data',
          error: error.message
        });
      } finally {
        if (pool) {
          try {
            await pool.close();
          } catch (err) {
            console.error('Error closing connection:', err);
          }
        }
      }

    case 'PUT':
      try {
        const { nodeId, name, type, label, operationalMode, operationalDevice } = req.body;
        if (!nodeId) {
          return res.status(400).json({ message: 'Node ID is required' });
        }

        pool = await sql.connect(config);
          
        // Aktuellen Tree laden
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

        // Tree-Daten parsen
        const treeData = JSON.parse(currentTree.recordset[0].tree);

        // Hilfsfunktion zum Aktualisieren des Nodes
        const updateNode = (nodes) => {
          return nodes.map(node => {
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

        // Tree aktualisieren
          const updatedTree = updateNode(treeData);

        // Aktualisierten Tree speichern
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
      } finally {
        if (pool) {
          try {
            await pool.close();
          } catch (err) {
            console.error('Error closing connection:', err);
          }
        }
      }

    case 'POST':
      try {
        const { parentId, nodeData } = req.body;
        
        pool = await sql.connect(config);
        
        // Aktuellen Tree laden
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

        // Tree-Daten parsen
        const treeData = JSON.parse(currentTree.recordset[0].tree);

        // Hilfsfunktion zum Hinzufügen des neuen Nodes
        const addNodeToParent = (nodes) => {
          return nodes.map(node => {
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
                    operationalMode: nodeData.operationalMode || '0',
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

        // Tree aktualisieren
        const updatedTree = addNodeToParent(treeData);

        // Aktualisierten Tree speichern
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
      } finally {
        if (pool) {
          try {
            await pool.close();
          } catch (err) {
            console.error('Error closing connection:', err);
          }
        }
      }

    default:
      return res.status(405).json({ message: 'Method not allowed' });
  }
} 