import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import sql from 'mssql';
import { getConnection } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authentifizierung prüfen
  let isAuthenticated = false;

  // Versuche zuerst den Bearer Token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
      isAuthenticated = true;
      console.log('Mobile token verified for user:', decoded.username);
    } catch (err) {
      console.error('JWT verification failed:', err);
    }
  }

  // Wenn kein gültiger Bearer Token, versuche Session
  if (!isAuthenticated) {
    const session = await getServerSession(req, res, authOptions);
    if (session?.user) {
      isAuthenticated = true;
      console.log('Session verified for user:', session.user.name);
    }
  }

  // Wenn keine Authentifizierung gefunden wurde
  if (!isAuthenticated) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
      message: 'Kein gültiger Token gefunden'
    });
  }

  let connection;
  try {
    // Get MSSQL connection
    connection = await getConnection();
    
    // Get customer ID from session or token
    let customerId = null;
    
    // Try to get customer ID from Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
        customerId = decoded.customerid;
        console.log('Customer ID from token:', customerId);
      } catch (err) {
        console.error('JWT verification failed:', err);
      }
    }
    
    // If no customer ID from token, try session
    if (!customerId) {
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.customerid) {
        customerId = session.user.customerid;
        console.log('Customer ID from session:', customerId);
      }
    }
    
    // Fallback to default customer ID if none found
    if (!customerId) {
      customerId = '2EA4BA70-647A-11EF-8CD8-8B580D9AA086';
      console.log('Using default customer ID:', customerId);
    }
    
    // Load the tree structure from customer_settings table for specific customer
    const treeData = await loadTreeData(connection, customerId);
    
    // Gib den kompletten Tree mit allen Daten aus
    return res.status(200).json({
      success: true,
      data: {
        tree: treeData,
        totalNodes: countNodes(treeData),
        maxDepth: getMaxDepth(treeData)
      }
    });

  } catch (error) {
    console.error('Error in tree API:', error);
    res.status(500).json({ 
      success: false,
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
 * Count total nodes in tree
 * @param {Array} tree - Tree structure
 * @returns {number} Total node count
 */
function countNodes(tree) {
  let count = 0;
  tree.forEach(node => {
    count++;
    if (node.children) {
      count += countNodes(node.children);
    }
  });
  return count;
}

/**
 * Get maximum depth of tree
 * @param {Array} tree - Tree structure
 * @param {number} currentDepth - Current depth
 * @returns {number} Maximum depth
 */
function getMaxDepth(tree, currentDepth = 0) {
  let maxDepth = currentDepth;
  tree.forEach(node => {
    if (node.children && node.children.length > 0) {
      const childDepth = getMaxDepth(node.children, currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  });
  return maxDepth;
}
