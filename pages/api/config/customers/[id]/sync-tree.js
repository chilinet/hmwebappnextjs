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

async function fetchAssetTree(customerId, tbToken) {
  try {
    // Hole zunächst alle Assets des Kunden
    const response = await fetch(
      `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/assets?pageSize=10000`,
      {
        headers: {
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch assets');
    }

    const data = await response.json();
    const assets = data.data;

    // Erstelle eine Map für schnellen Zugriff auf Assets
    const assetMap = new Map();
    assets.forEach(asset => {
      assetMap.set(asset.id.id, {
        id: asset.id.id,
        name: asset.name,
        type: asset.type,
        label: asset.label || asset.name,
        children: [],
        parentId: null
      });
    });

    // Hole die Asset-Beziehungen
    const relationPromises = assets.map(asset =>
      fetch(`${process.env.THINGSBOARD_URL}/api/relations/info?fromId=${asset.id.id}&fromType=ASSET`, {
        headers: {
          'X-Authorization': `Bearer ${tbToken}`
        }
      }).then(res => res.json())
    );

    const relations = await Promise.all(relationPromises);

    // Verarbeite die Beziehungen
    relations.forEach((relationList, index) => {
      const asset = assets[index];
      relationList.forEach(relation => {
        if (relation.to.entityType === 'ASSET' && relation.type === 'Contains') {
          const parentAsset = assetMap.get(relation.from.id);
          const childAsset = assetMap.get(relation.to.id);
          if (parentAsset && childAsset) {
            childAsset.parentId = parentAsset.id;
            parentAsset.children.push(childAsset);
          }
        }
      });
    });

    // Baue den Baum aus Root-Assets (Assets ohne Parent)
    const tree = Array.from(assetMap.values())
      .filter(asset => !asset.parentId)
      .map(asset => buildSubTree(asset, assetMap));

    return tree;
  } catch (error) {
    console.error('Error fetching asset tree:', error);
    throw error;
  }
}

function buildSubTree(asset, assetMap) {
  const node = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    label: asset.label,
    children: asset.children
      .map(child => buildSubTree(child, assetMap))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
  return node;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { customerid } = req.query;
  if (!customerid) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }

  let pool;
  try {
    // Hole den Asset-Baum von ThingsBoard
    const tree = await fetchAssetTree(customerid, session.tbToken);

    // Speichere den Baum in der Datenbank
    pool = await sql.connect(config);
    
    await pool.request()
      .input('customer_id', sql.UniqueIdentifier, customerid)
      .input('tree', sql.NVarChar(sql.MAX), JSON.stringify(tree))
      .query(`
        UPDATE customer_settings 
        SET tree = @tree,
            tree_updated = GETDATE()
        WHERE customer_id = @customer_id;

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO customer_settings (customer_id, tree, tree_updated)
          VALUES (@customer_id, @tree, GETDATE());
        END
      `);

    return res.status(200).json({
      success: true,
      message: 'Asset tree synchronized successfully',
      tree: tree
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      message: 'Error synchronizing asset tree',
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
} 