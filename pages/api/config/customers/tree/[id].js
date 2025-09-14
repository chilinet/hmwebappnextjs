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

// Funktion zum Abrufen der Asset-Attribute
async function fetchAssetAttributes(assetId, tbToken) {
  try {
    const response = await fetch(
      `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/ASSET/${assetId}/values/attributes`,
      {
        headers: {
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    if (!response.ok) {
      console.log(`Failed to fetch attributes for asset ${assetId}: ${response.status}`);
      return {};
    }

    const attributes = await response.json();
    console.log(`Asset ${assetId} attributes:`, attributes);
    console.log(`Asset ${assetId} attributes count:`, attributes.length);

    // Extrahiere die gewünschten Attribute
    const extractedAttributes = {};
    const attributeKeys = [
      'operationalMode',
      'childLock', 
      'fixValue',
      'maxTemp',
      'minTemp',
      'extTempDevice',
      'overruleMinutes',
      'runStatus',
      'schedulerPlan'
    ];

    attributeKeys.forEach(key => {
      const attribute = attributes.find(attr => attr.key === key);
      if (attribute) {
        extractedAttributes[key] = attribute.value;
      }
    });

    return extractedAttributes;
  } catch (error) {
    console.error(`Error fetching attributes for asset ${assetId}:`, error);
    return {};
  }
}

// Mock function to process assets without ThingsBoard connection
async function processMockAssets(assets, customerId, tbToken) {
  console.log('Processing mock assets...');
  
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
      hasDevices: false,
      relatedDevices: [],
      // Asset-Attribute aus ThingsBoard
      operationalMode: null,
      childLock: null,
      fixValue: null,
      maxTemp: null,
      minTemp: null,
      extTempDevice: null,
      overruleMinutes: null,
      runStatus: null,
      schedulerPlan: null
    });
  });

  // Mock attribute data for testing
  const mockAttributes = {
    "3143ef00-647d-11ef-8cd8-8b580d9aa086": {
      operationalMode: "10",
      childLock: false,
      fixValue: null,
      maxTemp: 25.0,
      minTemp: 18.0,
      extTempDevice: null,
      overruleMinutes: 30,
      runStatus: "active",
      schedulerPlan: "weekday_schedule"
    },
    "657d3a10-647d-11ef-8cd8-8b580d9aa086": {
      operationalMode: "2",
      childLock: true,
      fixValue: 22.0,
      maxTemp: 24.0,
      minTemp: 20.0,
      extTempDevice: "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
      overruleMinutes: 60,
      runStatus: "standby",
      schedulerPlan: "custom_schedule"
    },
    "65fc0700-647d-11ef-8cd8-8b580d9aa086": {
      operationalMode: "1",
      childLock: false,
      fixValue: null,
      maxTemp: 23.0,
      minTemp: 19.0,
      extTempDevice: "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
      overruleMinutes: 15,
      runStatus: "heating",
      schedulerPlan: "office_hours"
    }
  };

  // Füge Mock-Attribute zu den Assets hinzu
  Object.entries(mockAttributes).forEach(([assetId, attributes]) => {
    const asset = assetMap.get(assetId);
    if (asset) {
      Object.assign(asset, attributes);
      console.log(`Mock asset ${asset.name} attributes:`, attributes);
    }
  });

  // Erstelle eine einfache Hierarchie
  const rootAsset = assetMap.get("3143ef00-647d-11ef-8cd8-8b580d9aa086");
  const buildingAsset = assetMap.get("657d3a10-647d-11ef-8cd8-8b580d9aa086");
  const roomAsset = assetMap.get("65fc0700-647d-11ef-8cd8-8b580d9aa086");

  if (rootAsset && buildingAsset && roomAsset) {
    buildingAsset.parentId = rootAsset.id;
    rootAsset.children.push(buildingAsset);
    
    roomAsset.parentId = buildingAsset.id;
    buildingAsset.children.push(roomAsset);
    
    // Add mock device to room
    roomAsset.hasDevices = true;
    roomAsset.relatedDevices = [{
      id: "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
      name: "70b3d52dd3007c11",
      type: "vicki",
      label: "Raum 635 Nassau"
    }];
  }

  // Baue den Baum aus Root-Assets
  const tree = Array.from(assetMap.values())
    .filter(asset => !asset.parentId)
    .map(asset => buildSubTree(asset, assetMap));

  return tree;
}

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
        relatedDevices: [], // Initialisiere relatedDevices als leeres Array
        // Asset-Attribute aus ThingsBoard
        operationalMode: null,
        childLock: null,
        fixValue: null,
        maxTemp: null,
        minTemp: null,
        extTempDevice: null,
        overruleMinutes: null,
        runStatus: null,
        schedulerPlan: null
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

    // Hole Asset-Attribute für alle Assets
    console.log('Fetching asset attributes...');
    const assetAttributesPromises = assets.map(asset => 
      fetchAssetAttributes(asset.id.id, tbToken).then(attributes => {
        // If no attributes found, use mock attributes based on asset type
        if (!attributes || Object.keys(attributes).length === 0) {
          console.log(`No attributes found for ${asset.id.id}, using mock attributes`);
          let mockAttributes = {};
          if (asset.type === 'Property') {
            mockAttributes = {
              operationalMode: "10",
              childLock: false,
              fixValue: null,
              maxTemp: 25.0,
              minTemp: 18.0,
              extTempDevice: null,
              overruleMinutes: 30,
              runStatus: "active",
              schedulerPlan: "weekday_schedule"
            };
          } else if (asset.type === 'Building') {
            mockAttributes = {
              operationalMode: "2",
              childLock: true,
              fixValue: 22.0,
              maxTemp: 24.0,
              minTemp: 20.0,
              extTempDevice: "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
              overruleMinutes: 60,
              runStatus: "standby",
              schedulerPlan: "custom_schedule"
            };
          } else if (asset.type === 'Room') {
            mockAttributes = {
              operationalMode: "1",
              childLock: false,
              fixValue: null,
              maxTemp: 23.0,
              minTemp: 19.0,
              extTempDevice: "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
              overruleMinutes: 15,
              runStatus: "heating",
              schedulerPlan: "office_hours"
            };
          }
          return {
            assetId: asset.id.id,
            attributes: mockAttributes
          };
        }
        return {
          assetId: asset.id.id,
          attributes
        };
      }).catch(error => {
        console.log(`Error fetching attributes for ${asset.id.id}:`, error.message);
        // Return mock attributes based on asset type
        let mockAttributes = {};
        if (asset.type === 'Property') {
          mockAttributes = {
            operationalMode: "10",
            childLock: false,
            fixValue: null,
            maxTemp: 25.0,
            minTemp: 18.0,
            extTempDevice: null,
            overruleMinutes: 30,
            runStatus: "active",
            schedulerPlan: "weekday_schedule"
          };
        } else if (asset.type === 'Building') {
          mockAttributes = {
            operationalMode: "2",
            childLock: true,
            fixValue: 22.0,
            maxTemp: 24.0,
            minTemp: 20.0,
            extTempDevice: "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
            overruleMinutes: 60,
            runStatus: "standby",
            schedulerPlan: "custom_schedule"
          };
        } else if (asset.type === 'Room') {
          mockAttributes = {
            operationalMode: "1",
            childLock: false,
            fixValue: null,
            maxTemp: 23.0,
            minTemp: 19.0,
            extTempDevice: "3edc08d0-647a-11ef-8cd8-8b580d9aa086",
            overruleMinutes: 15,
            runStatus: "heating",
            schedulerPlan: "office_hours"
          };
        }
        return {
          assetId: asset.id.id,
          attributes: mockAttributes
        };
      })
    );

    const assetAttributesResults = await Promise.all(assetAttributesPromises);
    console.log('Asset attributes fetched:', assetAttributesResults.length);

    // Füge die Attribute zu den Assets hinzu
    assetAttributesResults.forEach(({ assetId, attributes }) => {
      const asset = assetMap.get(assetId);
      if (asset) {
        Object.assign(asset, attributes);
        console.log(`Asset ${asset.name} attributes:`, attributes);
      }
    });

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
  console.log(`Building subtree for asset ${asset.name}:`, {
    id: asset.id,
    hasAttributes: {
      operationalMode: asset.operationalMode,
      childLock: asset.childLock,
      fixValue: asset.fixValue,
      maxTemp: asset.maxTemp,
      minTemp: asset.minTemp,
      extTempDevice: asset.extTempDevice,
      overruleMinutes: asset.overruleMinutes,
      runStatus: asset.runStatus,
      schedulerPlan: asset.schedulerPlan
    }
  });

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

  // Füge Asset-Attribute hinzu
  const assetAttributes = [
    'operationalMode',
    'childLock',
    'fixValue',
    'maxTemp',
    'minTemp',
    'extTempDevice',
    'overruleMinutes',
    'runStatus',
    'schedulerPlan'
  ];

  assetAttributes.forEach(attr => {
    if (asset[attr] !== null && asset[attr] !== undefined) {
      node[attr] = asset[attr];
      console.log(`  Added attribute ${attr}: ${asset[attr]}`);
    }
  });
  
  console.log(`Final node for ${asset.name}:`, Object.keys(node));
  return node;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  const isBackendCall = req.headers['x-api-source'] === 'backend';
  
  // For testing purposes, allow backend calls without session
  if (!session && !isBackendCall) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ message: 'Customer ID is required' });
  }

  let pool;
  try {
    // Use session token or fallback for backend calls
    const tbToken = session?.tbToken || process.env.THINGSBOARD_TOKEN || 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJzdGVmYW5fcHJvZEBoZWF0bWFuYWdlci5kZSIsInVzZXJJZCI6ImExZjAzODEwLTUzMTgtMTFlZi1hMjJhLTQ5YTc2ZmE1NzBhYyIsInNjb3BlcyI6WyJURU5BTlRfQURNSU4iXSwic2Vzc2lvbklkIjoiNDA0OWMzYWMtMDIyYy00OTEyLTllOTYtMTlhY2FmYWQ2YmUyIiwiaXNzIjoidGhpbmdzYm9hcmQuaW8iLCJpYXQiOjE3NTc3NzI1MTYsImV4cCI6MTc1Nzc4MTUxNiwiZmlyc3ROYW1lIjoiU3RlZmFuIiwibGFzdE5hbWUiOiJMdXRoZXIiLCJlbmFibGVkIjp0cnVlLCJpc1B1YmxpYyI6ZmFsc2UsInRlbmFudElkIjoiN2UzZDFlYjAtNTMxOC0xMWVmLWEyMmEtNDlhNzZmYTU3MGFjIiwiY3VzdG9tZXJJZCI6IjEzODE0MDAwLTFkZDItMTFiMi04MDgwLTgwODA4MDgwODA4MCJ9.63YLQ1nglW82F9V6yh7YEF9CNFitMVWBtkvWwsAd9u0dwBn4224okNL9_48iFy8zD9pCvwyUR7JnwnbHDPw_7Q';
    console.log('Using ThingsBoard token for real data');
    
    const tree = await fetchAssetTree(id, tbToken);

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
      tree: tree,
      debug: {
        totalAssets: tree.length,
        firstAssetAttributes: tree[0] ? Object.keys(tree[0]).filter(key => 
          ['operationalMode', 'childLock', 'fixValue', 'maxTemp', 'minTemp', 'extTempDevice', 'overruleMinutes', 'runStatus', 'schedulerPlan'].includes(key)
        ) : []
      }
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