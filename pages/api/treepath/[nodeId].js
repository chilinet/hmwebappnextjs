import { getConnection } from '../../../lib/db.js';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  // Validate required parameters
  if (!id) {
    return res.status(400).json({ error: 'Node ID parameter is required' });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Node ID must be a valid UUID' });
  }

  // Get customer ID from session
  const session = await getServerSession(req, res, authOptions);
  const customerId = session?.user?.customerid || '2EA4BA70-647A-11EF-8CD8-8B580D9AA086';

  let connection;
  try {
    // Get MSSQL connection
    connection = await getConnection();
    
    // Load the tree structure from customer_settings table for specific customer
    const treeData = await loadTreeData(connection, customerId);
    
    // Find the node with the given ID
    const targetNode = findNodeById(treeData, id);
    
    if (!targetNode) {
      return res.status(404).json({ 
        error: 'Node not found',
        message: `No node found with ID: ${id}`
      });
    }

    // Extract all related devices recursively
    const relatedDevices = extractRelatedDevices(targetNode, []);
    
    // Build response
    const response = {
      success: true,
      node_id: id,
      node_name: targetNode.name || 'Unknown',
      node_type: targetNode.type || 'Unknown',
      node_label: targetNode.label || 'Unknown',
      total_devices: relatedDevices.length,
      devices: relatedDevices
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in treepath API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

/**
 * Load tree data from customer_settings table for specific customer
 * @param {Object} connection - MSSQL connection
 * @param {string} customerId - Customer ID to filter by
 * @returns {Array} Tree structure data
 */
async function loadTreeData(connection, customerId) {
  try {
    const query = `
      SELECT tree 
      FROM customer_settings 
      WHERE customer_id = @customerId 
        AND tree IS NOT NULL
    `;
    
    const result = await connection.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(query);
    
    if (result.recordset.length === 0) {
      throw new Error(`No tree data found for customer ID: ${customerId}`);
    }
    
    const treeJson = result.recordset[0].tree;
    
    // Parse JSON if it's stored as string
    if (typeof treeJson === 'string') {
      return JSON.parse(treeJson);
    }
    
    return treeJson;
    
  } catch (error) {
    console.error('Error loading tree data:', error);
    throw new Error(`Failed to load tree data: ${error.message}`);
  }
}

/**
 * Find a node by ID in the tree structure
 * @param {Array} treeData - Array of root nodes
 * @param {string} nodeId - ID to search for
 * @returns {Object|null} Found node or null
 */
function findNodeById(treeData, nodeId) {
  for (const node of treeData) {
    if (node.id === nodeId) {
      return node;
    }
    
    // Search in children recursively
    const found = findNodeInChildren(node.children, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Recursively search for a node in children
 * @param {Array} children - Array of child nodes
 * @param {string} nodeId - ID to search for
 * @returns {Object|null} Found node or null
 */
function findNodeInChildren(children, nodeId) {
  if (!children || !Array.isArray(children)) {
    return null;
  }
  
  for (const child of children) {
    if (child.id === nodeId) {
      return child;
    }
    
    // Search recursively in this child's children
    const found = findNodeInChildren(child.children, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Recursively extract all related devices from a node and its children
 * @param {Object} node - The current node
 * @param {Array} path - Current path to this node
 * @returns {Array} Array of related devices with path information
 */
function extractRelatedDevices(node, path = []) {
  const devices = [];
  
  // Add current node to path
  const currentPath = [...path, {
    id: node.id,
    name: node.name,
    type: node.type,
    label: node.label
  }];

  // Add related devices from current node
  if (node.relatedDevices && Array.isArray(node.relatedDevices)) {
    node.relatedDevices.forEach(device => {
      devices.push({
        device_id: device.id,
        device_name: device.name,
        device_type: device.type,
        device_label: device.label,
        path: currentPath.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          label: p.label
        })),
        path_string: currentPath.map(p => p.label).join(' > ')
      });
    });
  }

  // Recursively process children
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(child => {
      const childDevices = extractRelatedDevices(child, currentPath);
      devices.push(...childDevices);
    });
  }

  return devices;
}
