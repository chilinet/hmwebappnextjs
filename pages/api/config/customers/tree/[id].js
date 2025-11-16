import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import sql from 'mssql';
import { logInfo, logWarn, logError, startStructureCreationLog, endStructureCreationLog } from '../../../../../lib/utils/structureLogger';

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

// Funktion zum Abrufen der Asset-Attribute mit Timeout
async function fetchAssetAttributes(assetId, tbToken) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 Sekunden Timeout
    
    try {
      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/ASSET/${assetId}/values/attributes`,
        {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

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
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // Ignoriere Timeout-Fehler stillschweigend
      if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
        console.warn(`Error fetching attributes for asset ${assetId}:`, fetchError.message || fetchError);
      }
      return {};
    }
  } catch (error) {
    // Ignoriere Timeout-Fehler
    if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
      console.warn(`Error fetching attributes for asset ${assetId}:`, error.message || error);
    }
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
  const sessionId = startStructureCreationLog(customerId);
  
  try {
    logInfo(`Starting asset tree fetch for customer ${customerId}`, { sessionId });

    // Hole zunächst alle Assets des Kunden mit Timeout
    logInfo('Fetching assets list from ThingsBoard', { sessionId });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 Sekunden für Assets-Liste
    
    let response;
    try {
      response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/assets?pageSize=10000&page=0`,
        {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
        logError('Timeout beim Abrufen der Assets', fetchError);
        throw new Error('Timeout beim Abrufen der Assets');
      }
      logError('Error fetching assets', fetchError);
      throw fetchError;
    }

    if (!response.ok) {
      logError(`Failed to fetch assets: HTTP ${response.status}`);
      throw new Error('Failed to fetch assets');
    }

    const data = await response.json();
    const assets = data.data;
    logInfo(`Fetched ${assets.length} assets`, { sessionId, assetCount: assets.length });

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

    // Hole die Asset-Beziehungen und Device-Beziehungen mit Timeouts
    const relationPromises = assets.map(asset => {
      return Promise.allSettled([
        // Asset-Beziehungen mit Timeout
        (async () => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 Sekunden
            try {
              const res = await fetch(`${process.env.THINGSBOARD_URL}/api/relations/info?fromId=${asset.id.id}&fromType=ASSET`, {
                headers: {
                  'X-Authorization': `Bearer ${tbToken}`
                },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              return res.ok ? await res.json() : [];
            } catch (fetchError) {
              clearTimeout(timeoutId);
              if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
                console.warn(`Error fetching asset relations for ${asset.id.id}:`, fetchError.message || fetchError);
              }
              return [];
            }
          } catch (error) {
            return [];
          }
        })(),
        // Device-Beziehungen mit Timeout
        (async () => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 Sekunden
            try {
              const res = await fetch(`${process.env.THINGSBOARD_URL}/api/relations/info?fromId=${asset.id.id}&fromType=ASSET&relationType=Contains&toType=DEVICE`, {
                headers: {
                  'X-Authorization': `Bearer ${tbToken}`
                },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (res.ok) {
                const relations = await res.json();
                // Filtere nur Device-Entities heraus
                return relations.filter(relation => relation.to && relation.to.entityType === 'DEVICE');
              }
              return [];
            } catch (fetchError) {
              clearTimeout(timeoutId);
              if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
                console.warn(`Error fetching device relations for ${asset.id.id}:`, fetchError.message || fetchError);
              }
              return [];
            }
          } catch (error) {
            return [];
          }
        })()
      ]);
    });

    const relationsResults = await Promise.allSettled(relationPromises);
    
    // Extrahiere erfolgreiche Ergebnisse und behalte die Asset-Index-Zuordnung
    const validRelationsResults = relationsResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        const [assetResult, deviceResult] = result.value;
        return {
          index,
          assetRelations: assetResult.status === 'fulfilled' ? assetResult.value : [],
          deviceRelations: deviceResult.status === 'fulfilled' ? deviceResult.value : []
        };
      } else {
        // Bei Fehler gebe leere Relations zurück
        return {
          index,
          assetRelations: [],
          deviceRelations: []
        };
      }
    });

    // Sammle alle Device-IDs für Batch-Abruf
    const allDeviceIds = new Set();
    validRelationsResults.forEach(result => {
      if (result.deviceRelations && result.deviceRelations.length > 0) {
        result.deviceRelations.forEach(relation => {
          if (relation.to && relation.to.id) {
            allDeviceIds.add(relation.to.id);
          }
        });
      }
    });

    logInfo(`Found ${allDeviceIds.size} unique device IDs`, { sessionId, deviceIds: Array.from(allDeviceIds) });

    // Hole alle Device-Details in einem Batch mit Timeouts
    const deviceDetailsMap = new Map();
    if (allDeviceIds.size > 0) {
      logInfo(`Fetching details for ${allDeviceIds.size} devices`, { sessionId, deviceCount: allDeviceIds.size });
      const deviceDetailsPromises = Array.from(allDeviceIds).map(deviceId =>
        (async () => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 Sekunden
            try {
              const res = await fetch(`${process.env.THINGSBOARD_URL}/api/device/${deviceId}`, {
                headers: {
                  'X-Authorization': `Bearer ${tbToken}`
                },
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              return res.ok ? await res.json() : null;
            } catch (fetchError) {
              clearTimeout(timeoutId);
              if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
                console.warn(`Error fetching device ${deviceId}:`, fetchError.message || fetchError);
              }
              return null;
            }
          } catch (error) {
            return null;
          }
        })()
      );

      const deviceDetailsResults = await Promise.allSettled(deviceDetailsPromises);
      const deviceDetails = deviceDetailsResults
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => result.value);
      
      const failedDevices = deviceDetailsResults.filter(result => result.status === 'rejected' || result.value === null).length;
      logInfo(`Device details received: ${deviceDetails.length} successful, ${failedDevices} failed`, { 
        sessionId, 
        successful: deviceDetails.length, 
        failed: failedDevices 
      });
      
      deviceDetails.forEach(device => {
        if (device && device.id) {
          deviceDetailsMap.set(device.id.id, device);
        }
      });
    }

    logInfo(`Device details map size: ${deviceDetailsMap.size}`, { sessionId, mapSize: deviceDetailsMap.size });

    // Hole Asset-Attribute für alle Assets mit Promise.allSettled
    logInfo(`Fetching attributes for ${assets.length} assets`, { sessionId, assetCount: assets.length });
    const assetAttributesResults = await Promise.allSettled(
      assets.map(asset => fetchAssetAttributes(asset.id.id, tbToken))
    );
    
    // Verarbeite Asset-Attribute
    let attributesSuccessCount = 0;
    let attributesFailedCount = 0;
    assetAttributesResults.forEach((result, index) => {
      const asset = assets[index];
      const assetInMap = assetMap.get(asset.id.id);
      
      if (result.status === 'fulfilled') {
        const attributes = result.value;
        // If no attributes found, use empty attributes (keine Mock-Attribute mehr)
        if (attributes && Object.keys(attributes).length > 0) {
          Object.assign(assetInMap, attributes);
          attributesSuccessCount++;
          logInfo(`Asset ${asset.name} attributes loaded`, { sessionId, assetId: asset.id.id, attributeCount: Object.keys(attributes).length });
        } else {
          logWarn(`No attributes found for asset ${asset.name}`, { sessionId, assetId: asset.id.id });
        }
      } else {
        // Bei Fehler verwende leere Attribute
        attributesFailedCount++;
        logWarn(`Failed to fetch attributes for asset ${asset.id.id}`, { 
          sessionId, 
          assetId: asset.id.id, 
          error: result.reason?.message || 'Unknown error' 
        });
      }
    });
    
    logInfo(`Asset attributes processed: ${attributesSuccessCount} successful, ${attributesFailedCount} failed`, { 
      sessionId, 
      successful: attributesSuccessCount, 
      failed: attributesFailedCount 
    });

    // Verarbeite die Beziehungen
    validRelationsResults.forEach(result => {
      const asset = assets[result.index];
      if (!asset) return; // Skip wenn Asset nicht gefunden
      
      const assetInMap = assetMap.get(asset.id.id);
      if (!assetInMap) return; // Skip wenn Asset nicht in Map

      const { assetRelations, deviceRelations } = result;
      logInfo(`Processing asset ${asset.name}`, { 
        sessionId, 
        assetId: asset.id.id, 
        deviceRelationsCount: deviceRelations ? deviceRelations.length : 0,
        assetRelationsCount: assetRelations ? assetRelations.length : 0
      });

      // Setze hasDevices und relatedDevices nur wenn tatsächlich Devices vorhanden sind
      if (deviceRelations && deviceRelations.length > 0) {
        assetInMap.hasDevices = true;
        // Sammle Device-Informationen mit Details
        assetInMap.relatedDevices = deviceRelations.map(relation => {
          const deviceId = relation.to.id;
          const deviceDetails = deviceDetailsMap.get(deviceId);
          
          return {
            id: deviceId,
            name: deviceDetails?.name || 'Unbekannt',
            type: deviceDetails?.type || 'Unbekannt',
            label: deviceDetails?.label || 'Unbekannt'
          };
        });
        logInfo(`Asset ${asset.name} has ${assetInMap.relatedDevices.length} devices`, { 
          sessionId, 
          assetId: asset.id.id, 
          deviceCount: assetInMap.relatedDevices.length 
        });
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
    const rootAssets = Array.from(assetMap.values()).filter(asset => !asset.parentId);
    logInfo(`Building tree from ${rootAssets.length} root assets`, { sessionId, rootAssetCount: rootAssets.length });
    
    const tree = rootAssets.map(asset => buildSubTree(asset, assetMap));

    const summary = {
      totalAssets: assets.length,
      rootAssets: rootAssets.length,
      totalDevices: allDeviceIds.size,
      devicesWithDetails: deviceDetailsMap.size,
      attributesSuccessful: attributesSuccessCount,
      attributesFailed: attributesFailedCount
    };
    
    endStructureCreationLog(sessionId, summary);
    logInfo(`Tree structure created successfully`, { sessionId, summary });

    return tree;
  } catch (error) {
    logError('Error fetching asset tree', error);
    endStructureCreationLog(sessionId, { error: error.message });
    throw error;
  }
}

function buildSubTree(asset, assetMap) {
  // Logging für buildSubTree ist optional, da es sehr viele Aufrufe geben kann
  // Nur bei Bedarf aktivieren
  // logInfo(`Building subtree for asset ${asset.name}`, { assetId: asset.id, childrenCount: asset.children.length });

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
    }
  });
  
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