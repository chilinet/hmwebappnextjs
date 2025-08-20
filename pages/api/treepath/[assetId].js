import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import sql from 'mssql';
import { getConnection } from '../../../lib/db';

// Funktion zum Finden eines Assets und seines Pfades im Tree
function findAssetPath(tree, targetId, currentPath = []) {
  for (const node of tree) {
    // Aktuellen Knoten zum Pfad hinzufügen
    const newPath = [...currentPath, {
      id: node.id,
      label: node.label,
      type: node.type,
      name: node.name
    }];

    // Prüfen ob dies der gesuchte Knoten ist
    if (node.id === targetId) {
      return newPath;
    }

    // Rekursiv in children suchen, falls vorhanden
    if (node.children && node.children.length > 0) {
      const foundPath = findAssetPath(node.children, targetId, newPath);
      if (foundPath) {
        return foundPath;
      }
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  const isBackendCall = req.headers['x-api-source'] === 'backend';

  if (!session && !isBackendCall) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { assetId, customerId } = req.query;
  if (!assetId) {
    return res.status(400).json({ error: 'Asset ID is required' });
  }

  try {
    const pool = await getConnection();
    const customerIdToUse = isBackendCall ? customerId : session.user.customerid;

    const result = await pool.request()
      .input('customerId', sql.UniqueIdentifier, customerIdToUse)
      .query('SELECT tree FROM customer_settings WHERE customer_id = @customerId');

    if (!result.recordset[0]?.tree) {
      return res.status(404).json({ error: 'Tree not found for customer' });
    }

    // Tree aus JSON-String parsen
    const tree = JSON.parse(result.recordset[0].tree);

    // Pfad im Tree finden
    const path = findAssetPath(tree, assetId);

    if (!path) {
      return res.status(404).json({ error: 'Asset not found in tree' });
    }

    // Antwort formatieren
    const response = {
      path: path,
      pathString: path.map(node => node.label).join(' / '),
      fullPath: {
        ids: path.map(node => node.id),
        labels: path.map(node => node.label),
        types: path.map(node => node.type),
        names: path.map(node => node.name)
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in tree handler:', error);
    res.status(500).json({ 
      error: 'Failed to process tree request',
      details: error.message 
    });
  }
}

 