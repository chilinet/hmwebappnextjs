import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function fetchAssetTree(customerId, tbToken) {
  try {
    // Hole zunächst alle Assets des Kunden
    const response = await fetch(
      `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/assets?pageSize=10000&page=0`,
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
        label: asset.label,
        children: [],
        parentId: null,
        hasDevices: false, // Initialisiere hasDevices mit false
        relatedDevices: [] // Initialisiere relatedDevices als leeres Array
      });
    });

    // Hole die Asset-Beziehungen und Device-Beziehungen
    const relationPromises = assets.map(asset => {
      return Promise.all([
        // Asset-Beziehungen
        fetch(`${process.env.THINGSBOARD_URL}/api/relations/info?fromId=${asset.id.id}&fromType=ASSET`, {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          }
        }).then(res => res.json()),
        // Device-Beziehungen - verwende relations/info für Entity-Informationen, aber filtere nach DEVICE
        fetch(`${process.env.THINGSBOARD_URL}/api/relations/info?fromId=${asset.id.id}&fromType=ASSET&relationType=Contains&toType=DEVICE`, {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          }
        }).then(res => res.json()).then(relations => {
          // Filtere nur Device-Entities heraus
          return relations.filter(relation => relation.to && relation.to.entityType === 'DEVICE');
        })
      ]);
    });

    const relationsResults = await Promise.all(relationPromises);

    // Sammle alle Device-IDs für Batch-Abruf
    const allDeviceIds = new Set();
    relationsResults.forEach(([assetRelations, deviceRelations]) => {
      if (deviceRelations && deviceRelations.length > 0) {
        deviceRelations.forEach(relation => {
          if (relation.to && relation.to.id) {
            allDeviceIds.add(relation.to.id);
          }
        });
      }
    });

    console.log('All device IDs found:', Array.from(allDeviceIds));

    // Hole alle Device-Details in einem Batch
    const deviceDetailsMap = new Map();
    if (allDeviceIds.size > 0) {
      console.log(`Fetching details for ${allDeviceIds.size} devices...`);
      const deviceDetailsPromises = Array.from(allDeviceIds).map(deviceId =>
        fetch(`${process.env.THINGSBOARD_URL}/api/device/${deviceId}`, {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          }
        }).then(res => res.json()).catch(err => {
          console.error(`Error fetching device ${deviceId}:`, err);
          return null;
        })
      );

      const deviceDetails = await Promise.all(deviceDetailsPromises);
      console.log('Device details received:', deviceDetails.length);
      deviceDetails.forEach(device => {
        if (device && device.id) {
          deviceDetailsMap.set(device.id.id, device);
          console.log(`Device ${device.id.id}: ${device.name} (${device.label})`);
        }
      });
    }

    console.log('Device details map size:', deviceDetailsMap.size);

    // Verarbeite die Beziehungen
    relationsResults.forEach(([assetRelations, deviceRelations], index) => {
      const asset = assets[index];
      const assetInMap = assetMap.get(asset.id.id);

      console.log(`Processing asset ${asset.name}: ${deviceRelations ? deviceRelations.length : 0} device relations`);

      // Setze hasDevices und relatedDevices nur wenn tatsächlich Devices vorhanden sind
      if (deviceRelations && deviceRelations.length > 0) {
        assetInMap.hasDevices = true;
        // Sammle Device-Informationen mit Details
        assetInMap.relatedDevices = deviceRelations.map(relation => {
          const deviceId = relation.to.id;
          const deviceDetails = deviceDetailsMap.get(deviceId);
          
          console.log(`Device relation: ${deviceId}, details:`, deviceDetails);
          
          return {
            id: deviceId,
            name: deviceDetails?.name || 'Unbekannt',
            type: deviceDetails?.type || 'Unbekannt',
            label: deviceDetails?.label || 'Unbekannt'
          };
        });
        console.log(`Asset ${asset.name} has ${assetInMap.relatedDevices.length} devices`);
      } else {
        // Keine Devices vorhanden
        assetInMap.hasDevices = false;
        assetInMap.relatedDevices = [];
      }

      // Verarbeite Asset-Beziehungen
      assetRelations.forEach(relation => {
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
    hasDevices: asset.hasDevices, // Füge hasDevices zum Node hinzu
    children: asset.children
      .map(child => buildSubTree(child, assetMap))
      .sort((a, b) => a.name.localeCompare(b.name))
  };
  
  // Füge relatedDevices nur hinzu, wenn es tatsächlich Devices gibt
  if (asset.hasDevices && asset.relatedDevices && asset.relatedDevices.length > 0) {
    node.relatedDevices = asset.relatedDevices;
  }
  
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

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }

  let pool;
  try {
    const tree = await fetchAssetTree(id, session.tbToken);

    pool = await sql.connect(config);
    
    await pool.request()
      .input('customer_id', sql.UniqueIdentifier, id)
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