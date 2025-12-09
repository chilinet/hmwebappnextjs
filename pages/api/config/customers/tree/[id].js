import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import sql from 'mssql';
import { logInfo, logWarn, logError, startStructureCreationLog, endStructureCreationLog } from '../../../../../lib/utils/structureLogger';

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

// Funktion zum Abrufen der Asset-Attribute mit Timeout
async function fetchAssetAttributes(assetId, tbToken, sessionId = null) {
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
        logWarn(`Failed to fetch attributes for asset ${assetId}: HTTP ${response.status}`, { sessionId, assetId, status: response.status });
        return {};
      }

      const attributes = await response.json();
      logInfo(`Asset ${assetId} attributes fetched`, { sessionId, assetId, attributeCount: attributes.length });

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
        logWarn(`Error fetching attributes for asset ${assetId}`, { sessionId, assetId, error: fetchError.message || fetchError });
      }
      return {};
    }
  } catch (error) {
    // Ignoriere Timeout-Fehler
    if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
      logWarn(`Error fetching attributes for asset ${assetId}`, { sessionId, assetId, error: error.message || error });
    }
    return {};
  }
}

// Mock function to process assets without ThingsBoard connection
async function processMockAssets(assets, customerId, tbToken, sessionId = null) {
  logInfo('Processing mock assets...', { sessionId, customerId, assetCount: assets.length });
  
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
      logInfo(`Mock asset ${asset.name} attributes loaded`, { sessionId, assetId: asset.id, assetName: asset.name, attributes });
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

async function fetchAssetTree(customerId, tbToken, providedSessionId = null) {
  const sessionId = providedSessionId || startStructureCreationLog(customerId);
  
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

    // Hole die Asset-Beziehungen und Device-Beziehungen mit Timeouts und Retry-Logik
    // Wir holen beide Richtungen: von diesem Asset ausgehend UND zu diesem Asset hinführend
    // Rate Limiting: Verarbeite Assets in Batches, um die API nicht zu überlasten
    const BATCH_SIZE = 50; // Verarbeite 50 Assets gleichzeitig
    const allRelationsResults = [];
    
    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
      const batch = assets.slice(i, i + BATCH_SIZE);
      logInfo(`Processing relations batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(assets.length / BATCH_SIZE)}`, { 
        sessionId, 
        batchStart: i, 
        batchEnd: Math.min(i + BATCH_SIZE, assets.length),
        batchSize: batch.length
      });
      
      const batchPromises = batch.map((asset, batchIndex) => {
        const originalIndex = i + batchIndex; // Behalte den ursprünglichen Asset-Index
      return Promise.allSettled([
        // Asset-Beziehungen VON diesem Asset ausgehend (was enthält dieses Asset?)
        (async () => {
          const maxRetries = 2;
          let lastError = null;
          
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              const controller = new AbortController();
              // Erhöhe Timeout bei Retries: 15s, 20s, 25s
              const timeout = 15000 + (attempt * 5000);
              const timeoutId = setTimeout(() => controller.abort(), timeout);
              
              try {
                const res = await fetch(`${process.env.THINGSBOARD_URL}/api/relations/info?fromId=${asset.id.id}&fromType=ASSET`, {
                  headers: {
                    'X-Authorization': `Bearer ${tbToken}`
                  },
                  signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (res.ok) {
                  const relations = await res.json();
                  if (attempt > 0) {
                    logInfo(`Asset relations (from) erfolgreich nach ${attempt} Retry(s) für ${asset.name}`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt,
                      relationsCount: relations.length
                    });
                  }
                  return relations;
                }
                return [];
              } catch (fetchError) {
                clearTimeout(timeoutId);
                lastError = fetchError;
                
                if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
                  if (attempt < maxRetries) {
                    logWarn(`Timeout beim Abrufen der Asset-Relations (from) für ${asset.name} (Versuch ${attempt + 1}/${maxRetries + 1}), retry...`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt: attempt + 1,
                      timeout
                    });
                    // Warte kurz vor dem Retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                  } else {
                    logWarn(`Timeout beim Abrufen der Asset-Relations (from) für ${asset.name} nach ${maxRetries + 1} Versuchen`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      maxRetries: maxRetries + 1
                    });
                    return [];
                  }
                } else {
                  // "fetch failed" oder andere Netzwerkfehler - retry
                  const isNetworkError = fetchError.message?.includes('fetch failed') || 
                                        fetchError.message?.includes('ECONNRESET') ||
                                        fetchError.message?.includes('ENOTFOUND') ||
                                        fetchError.message?.includes('ETIMEDOUT') ||
                                        fetchError.cause?.code === 'ECONNRESET';
                  
                  if (isNetworkError && attempt < maxRetries) {
                    logWarn(`Network error beim Abrufen der Asset-Relations (from) für ${asset.name} (Versuch ${attempt + 1}/${maxRetries + 1}), retry...`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt: attempt + 1,
                      error: fetchError.message || fetchError
                    });
                    // Warte länger bei Netzwerkfehlern
                    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                    continue;
                  } else {
                    logWarn(`Error fetching asset relations (from) for ${asset.name}:`, { 
                      sessionId,
                      assetId: asset.id.id,
                      assetName: asset.name,
                      error: fetchError.message || fetchError,
                      attempt: attempt + 1,
                      willRetry: isNetworkError && attempt < maxRetries
                    });
                    if (!isNetworkError || attempt >= maxRetries) {
                      return [];
                    }
                  }
                }
              }
            } catch (error) {
              lastError = error;
              if (attempt < maxRetries) {
                continue;
              }
              return [];
            }
          }
          return [];
        })(),
        // Asset-Beziehungen ZU diesem Asset hinführend (welches Asset enthält dieses Asset?)
        (async () => {
          const maxRetries = 2;
          let lastError = null;
          
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              const controller = new AbortController();
              // Erhöhe Timeout bei Retries: 15s, 20s, 25s
              const timeout = 15000 + (attempt * 5000);
              const timeoutId = setTimeout(() => controller.abort(), timeout);
              
              try {
                const res = await fetch(`${process.env.THINGSBOARD_URL}/api/relations/info?toId=${asset.id.id}&toType=ASSET&relationType=Contains`, {
                  headers: {
                    'X-Authorization': `Bearer ${tbToken}`
                  },
                  signal: controller.signal
                });
                clearTimeout(timeoutId);
                
                if (res.ok) {
                  const relations = await res.json();
                  if (attempt > 0) {
                    logInfo(`Asset relations (to) erfolgreich nach ${attempt} Retry(s) für ${asset.name}`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt,
                      relationsCount: relations.length
                    });
                  }
                  return relations;
                }
                return [];
              } catch (fetchError) {
                clearTimeout(timeoutId);
                lastError = fetchError;
                
                if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
                  if (attempt < maxRetries) {
                    logWarn(`Timeout beim Abrufen der Asset-Relations (to) für ${asset.name} (Versuch ${attempt + 1}/${maxRetries + 1}), retry...`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt: attempt + 1,
                      timeout
                    });
                    // Warte kurz vor dem Retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                  } else {
                    logWarn(`Timeout beim Abrufen der Asset-Relations (to) für ${asset.name} nach ${maxRetries + 1} Versuchen`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      maxRetries: maxRetries + 1
                    });
                    return [];
                  }
                } else {
                  // "fetch failed" oder andere Netzwerkfehler - retry
                  const isNetworkError = fetchError.message?.includes('fetch failed') || 
                                        fetchError.message?.includes('ECONNRESET') ||
                                        fetchError.message?.includes('ENOTFOUND') ||
                                        fetchError.message?.includes('ETIMEDOUT') ||
                                        fetchError.cause?.code === 'ECONNRESET';
                  
                  if (isNetworkError && attempt < maxRetries) {
                    logWarn(`Network error beim Abrufen der Asset-Relations (to) für ${asset.name} (Versuch ${attempt + 1}/${maxRetries + 1}), retry...`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt: attempt + 1,
                      error: fetchError.message || fetchError
                    });
                    // Warte länger bei Netzwerkfehlern
                    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                    continue;
                  } else {
                    logWarn(`Error fetching asset relations (to) for ${asset.name}:`, { 
                      sessionId,
                      assetId: asset.id.id,
                      assetName: asset.name,
                      error: fetchError.message || fetchError,
                      attempt: attempt + 1,
                      willRetry: isNetworkError && attempt < maxRetries
                    });
                    if (!isNetworkError || attempt >= maxRetries) {
                      return [];
                    }
                  }
                }
              }
            } catch (error) {
              lastError = error;
              if (attempt < maxRetries) {
                continue;
              }
              return [];
            }
          }
          return [];
        })(),
        // Device-Beziehungen mit Timeout und Retry
        (async () => {
          const maxRetries = 2;
          let lastError = null;
          
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
              const controller = new AbortController();
              // Erhöhe Timeout bei Retries: 15s, 20s, 25s
              const timeout = 15000 + (attempt * 5000);
              const timeoutId = setTimeout(() => controller.abort(), timeout);
              
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
                  const deviceRelations = relations.filter(relation => relation.to && relation.to.entityType === 'DEVICE');
                  if (attempt > 0) {
                    logInfo(`Device relations erfolgreich nach ${attempt} Retry(s) für ${asset.name}`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt,
                      relationsCount: deviceRelations.length
                    });
                  }
                  return deviceRelations;
                }
                return [];
              } catch (fetchError) {
                clearTimeout(timeoutId);
                lastError = fetchError;
                
                if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
                  if (attempt < maxRetries) {
                    logWarn(`Timeout beim Abrufen der Device-Relations für ${asset.name} (Versuch ${attempt + 1}/${maxRetries + 1}), retry...`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt: attempt + 1,
                      timeout
                    });
                    // Warte kurz vor dem Retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                  } else {
                    logWarn(`Timeout beim Abrufen der Device-Relations für ${asset.name} nach ${maxRetries + 1} Versuchen`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      maxRetries: maxRetries + 1
                    });
                    return [];
                  }
                } else {
                  // "fetch failed" oder andere Netzwerkfehler - retry
                  const isNetworkError = fetchError.message?.includes('fetch failed') || 
                                        fetchError.message?.includes('ECONNRESET') ||
                                        fetchError.message?.includes('ENOTFOUND') ||
                                        fetchError.message?.includes('ETIMEDOUT') ||
                                        fetchError.cause?.code === 'ECONNRESET';
                  
                  if (isNetworkError && attempt < maxRetries) {
                    logWarn(`Network error beim Abrufen der Device-Relations für ${asset.name} (Versuch ${attempt + 1}/${maxRetries + 1}), retry...`, { 
                      sessionId, 
                      assetId: asset.id.id, 
                      assetName: asset.name,
                      attempt: attempt + 1,
                      error: fetchError.message || fetchError
                    });
                    // Warte länger bei Netzwerkfehlern
                    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                    continue;
                  } else {
                    logWarn(`Error fetching device relations for ${asset.name}:`, { 
                      sessionId,
                      assetId: asset.id.id,
                      assetName: asset.name,
                      error: fetchError.message || fetchError,
                      attempt: attempt + 1,
                      willRetry: isNetworkError && attempt < maxRetries
                    });
                    if (!isNetworkError || attempt >= maxRetries) {
                      return [];
                    }
                  }
                }
              }
            } catch (error) {
              lastError = error;
              if (attempt < maxRetries) {
                continue;
              }
              return [];
            }
          }
          return [];
        })()
      ]);
      });
      
      // Warte auf Batch-Completion bevor der nächste Batch startet
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Füge die Ergebnisse mit korrekten Indizes hinzu
      batchResults.forEach((result, batchIndex) => {
        const originalIndex = i + batchIndex;
        allRelationsResults[originalIndex] = result;
      });
      
      // Kurze Pause zwischen Batches, um die API nicht zu überlasten
      if (i + BATCH_SIZE < assets.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const relationsResults = allRelationsResults;
    
    // Extrahiere erfolgreiche Ergebnisse und behalte die Asset-Index-Zuordnung
    // Jetzt haben wir 3 Arrays: [assetRelationsFrom, assetRelationsTo, deviceRelations]
    const validRelationsResults = relationsResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        const [assetRelationsFromResult, assetRelationsToResult, deviceResult] = result.value;
        return {
          index,
          assetRelationsFrom: assetRelationsFromResult.status === 'fulfilled' ? assetRelationsFromResult.value : [],
          assetRelationsTo: assetRelationsToResult.status === 'fulfilled' ? assetRelationsToResult.value : [],
          deviceRelations: deviceResult.status === 'fulfilled' ? deviceResult.value : []
        };
      } else {
        // Bei Fehler gebe leere Relations zurück
        return {
          index,
          assetRelationsFrom: [],
          assetRelationsTo: [],
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

    // Hole alle Device-Details mit Retry-Logik und Batch-Verarbeitung
    const deviceDetailsMap = new Map();
    if (allDeviceIds.size > 0) {
      logInfo(`Fetching details for ${allDeviceIds.size} devices`, { sessionId, deviceCount: allDeviceIds.size });
      
      const deviceIdsArray = Array.from(allDeviceIds);
      const DEVICE_BATCH_SIZE = 30; // Kleinere Batches für Device-Details
      const failedDeviceIds = [];
      
      // Verarbeite Devices in Batches mit Retry-Logik
      for (let i = 0; i < deviceIdsArray.length; i += DEVICE_BATCH_SIZE) {
        const batch = deviceIdsArray.slice(i, i + DEVICE_BATCH_SIZE);
        logInfo(`Processing device details batch ${Math.floor(i / DEVICE_BATCH_SIZE) + 1}/${Math.ceil(deviceIdsArray.length / DEVICE_BATCH_SIZE)}`, { 
          sessionId, 
          batchStart: i, 
          batchEnd: Math.min(i + DEVICE_BATCH_SIZE, deviceIdsArray.length),
          batchSize: batch.length
        });
        
        const deviceDetailsPromises = batch.map(deviceId =>
          (async () => {
            const maxRetries = 2;
            
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
              try {
                const controller = new AbortController();
                const timeout = 10000 + (attempt * 5000); // 10s, 15s, 20s
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                try {
                  const res = await fetch(`${process.env.THINGSBOARD_URL}/api/device/${deviceId}`, {
                    headers: {
                      'X-Authorization': `Bearer ${tbToken}`
                    },
                    signal: controller.signal
                  });
                  clearTimeout(timeoutId);
                  
                  if (res.ok) {
                    const device = await res.json();
                    if (attempt > 0) {
                      logInfo(`Device ${deviceId} erfolgreich nach ${attempt} Retry(s)`, { 
                        sessionId, 
                        deviceId,
                        attempt,
                        deviceName: device?.name
                      });
                    }
                    return device;
                  } else {
                    if (attempt >= maxRetries) {
                      logWarn(`Failed to fetch device ${deviceId}: HTTP ${res.status}`, { 
                        sessionId,
                        deviceId,
                        status: res.status
                      });
                      return null;
                    }
                    // Retry bei HTTP-Fehlern
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                  }
                } catch (fetchError) {
                  clearTimeout(timeoutId);
                  
                  const isNetworkError = fetchError.name === 'AbortError' || 
                                        fetchError.message?.includes('timeout') ||
                                        fetchError.message?.includes('fetch failed') ||
                                        fetchError.message?.includes('ECONNRESET') ||
                                        fetchError.message?.includes('ENOTFOUND') ||
                                        fetchError.message?.includes('ETIMEDOUT') ||
                                        fetchError.cause?.code === 'ECONNRESET';
                  
                  if (isNetworkError && attempt < maxRetries) {
                    logWarn(`Network error beim Abrufen der Device-Details für ${deviceId} (Versuch ${attempt + 1}/${maxRetries + 1}), retry...`, { 
                      sessionId, 
                      deviceId,
                      attempt: attempt + 1,
                      error: fetchError.message || fetchError
                    });
                    // Warte länger bei Netzwerkfehlern
                    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                    continue;
                  } else {
                    if (attempt >= maxRetries) {
                      logWarn(`Error fetching device ${deviceId} nach ${maxRetries + 1} Versuchen`, { 
                        sessionId,
                        deviceId,
                        error: fetchError.message || fetchError
                      });
                    }
                    return null;
                  }
                }
              } catch (error) {
                if (attempt >= maxRetries) {
                  return null;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
              }
            }
            return null;
          })()
        );

        const deviceDetailsResults = await Promise.allSettled(deviceDetailsPromises);
        
        deviceDetailsResults.forEach((result, batchIndex) => {
          const deviceId = batch[batchIndex];
          if (result.status === 'fulfilled' && result.value !== null) {
            const device = result.value;
            if (device && device.id) {
              deviceDetailsMap.set(device.id.id, device);
            }
          } else {
            failedDeviceIds.push(deviceId);
          }
        });
        
        // Kurze Pause zwischen Batches
        if (i + DEVICE_BATCH_SIZE < deviceIdsArray.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      logInfo(`Device details received: ${deviceDetailsMap.size} successful, ${failedDeviceIds.length} failed`, { 
        sessionId, 
        successful: deviceDetailsMap.size, 
        failed: failedDeviceIds.length,
        failedDeviceIds: failedDeviceIds.slice(0, 10) // Logge erste 10 fehlgeschlagene Devices
      });
    }

    logInfo(`Device details map size: ${deviceDetailsMap.size}`, { sessionId, mapSize: deviceDetailsMap.size });

    // Hole Asset-Attribute für alle Assets mit Promise.allSettled
    logInfo(`Fetching attributes for ${assets.length} assets`, { sessionId, assetCount: assets.length });
    const assetAttributesResults = await Promise.allSettled(
      assets.map(asset => fetchAssetAttributes(asset.id.id, tbToken, sessionId))
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

      const { assetRelationsFrom, assetRelationsTo, deviceRelations } = result;
      logInfo(`Processing asset ${asset.name}`, { 
        sessionId, 
        assetId: asset.id.id, 
        deviceRelationsCount: deviceRelations ? deviceRelations.length : 0,
        assetRelationsFromCount: assetRelationsFrom ? assetRelationsFrom.length : 0,
        assetRelationsToCount: assetRelationsTo ? assetRelationsTo.length : 0
      });

      // Setze hasDevices und relatedDevices nur wenn tatsächlich Devices vorhanden sind
      if (deviceRelations && deviceRelations.length > 0) {
        assetInMap.hasDevices = true;
        // Sammle Device-Informationen mit Details
        assetInMap.relatedDevices = deviceRelations.map(relation => {
          const deviceId = relation.to.id;
          const deviceDetails = deviceDetailsMap.get(deviceId);
          
          if (!deviceDetails) {
            logWarn(`Device details nicht gefunden für Device ${deviceId} in Asset ${asset.name}`, { 
              sessionId, 
              assetId: asset.id.id,
              assetName: asset.name,
              deviceId
            });
          }
          
          return {
            id: deviceId,
            name: deviceDetails?.name || 'Unbekannt',
            type: deviceDetails?.type || 'Unbekannt',
            label: deviceDetails?.label || 'Unbekannt'
          };
        });
        
        const unknownDevices = assetInMap.relatedDevices.filter(d => d.name === 'Unbekannt').length;
        if (unknownDevices > 0) {
          logWarn(`Asset ${asset.name} hat ${unknownDevices} unbekannte Device(s)`, { 
            sessionId, 
            assetId: asset.id.id,
            assetName: asset.name,
            unknownDevices,
            totalDevices: assetInMap.relatedDevices.length,
            unknownDeviceIds: assetInMap.relatedDevices.filter(d => d.name === 'Unbekannt').map(d => d.id)
          });
        }
        
        logInfo(`Asset ${asset.name} has ${assetInMap.relatedDevices.length} devices`, { 
          sessionId, 
          assetId: asset.id.id, 
          deviceCount: assetInMap.relatedDevices.length,
          unknownDevices
        });
      } else {
        // Keine Devices vorhanden
        assetInMap.hasDevices = false;
        assetInMap.relatedDevices = [];
      }

      // Verarbeite Asset-Beziehungen VON diesem Asset ausgehend (was enthält dieses Asset?)
      assetRelationsFrom.forEach(relation => {
        if (relation.to && relation.to.entityType === 'ASSET' && relation.type === 'Contains') {
          const parentAsset = assetMap.get(relation.from.id);
          const childAsset = assetMap.get(relation.to.id);
          
          if (parentAsset && childAsset) {
            // Prüfe, ob das Child bereits einen Parent hat
            if (childAsset.parentId && childAsset.parentId !== parentAsset.id) {
              logWarn(`Asset ${childAsset.name} (${childAsset.id}) hat bereits einen Parent (${childAsset.parentId}), überspringe Zuordnung zu ${parentAsset.name} (${parentAsset.id})`, { 
                sessionId, 
                childAssetId: childAsset.id, 
                childAssetName: childAsset.name,
                existingParentId: childAsset.parentId,
                newParentId: parentAsset.id,
                newParentName: parentAsset.name
              });
              return; // Überspringe diese Relation
            }
            
            // Prüfe, ob das Child bereits in den Children des Parents ist
            const alreadyChild = parentAsset.children.some(child => child.id === childAsset.id);
            if (alreadyChild) {
              logWarn(`Asset ${childAsset.name} (${childAsset.id}) ist bereits ein Child von ${parentAsset.name} (${parentAsset.id})`, { 
                sessionId, 
                childAssetId: childAsset.id, 
                childAssetName: childAsset.name,
                parentId: parentAsset.id,
                parentName: parentAsset.name
              });
              return; // Überspringe diese Relation
            }
            
            // Setze Parent-Child-Beziehung
            childAsset.parentId = parentAsset.id;
            parentAsset.children.push(childAsset);
            
            logInfo(`Asset-Beziehung erstellt (from): ${parentAsset.name} (${parentAsset.id}) enthält ${childAsset.name} (${childAsset.id})`, { 
              sessionId, 
              parentId: parentAsset.id, 
              parentName: parentAsset.name,
              childId: childAsset.id,
              childName: childAsset.name
            });
          } else {
            if (!parentAsset) {
              logWarn(`Parent Asset nicht gefunden für Relation: ${relation.from.id}`, { sessionId, parentId: relation.from.id });
            }
            if (!childAsset) {
              logWarn(`Child Asset nicht gefunden für Relation: ${relation.to.id}`, { sessionId, childId: relation.to.id });
            }
          }
        }
      });

      // Verarbeite Asset-Beziehungen ZU diesem Asset hinführend (welches Asset enthält dieses Asset?)
      // Diese Relations zeigen, welches Asset dieses Asset als Parent hat
      assetRelationsTo.forEach(relation => {
        if (relation.from && relation.from.entityType === 'ASSET' && relation.type === 'Contains') {
          const parentAsset = assetMap.get(relation.from.id);
          const childAsset = assetMap.get(relation.to.id);
          
          if (parentAsset && childAsset) {
            // Prüfe, ob das Child bereits einen Parent hat
            if (childAsset.parentId && childAsset.parentId !== parentAsset.id) {
              logWarn(`Asset ${childAsset.name} (${childAsset.id}) hat bereits einen Parent (${childAsset.parentId}), überspringe Zuordnung zu ${parentAsset.name} (${parentAsset.id})`, { 
                sessionId, 
                childAssetId: childAsset.id, 
                childAssetName: childAsset.name,
                existingParentId: childAsset.parentId,
                newParentId: parentAsset.id,
                newParentName: parentAsset.name
              });
              return; // Überspringe diese Relation
            }
            
            // Prüfe, ob das Child bereits in den Children des Parents ist
            const alreadyChild = parentAsset.children.some(child => child.id === childAsset.id);
            if (alreadyChild) {
              logWarn(`Asset ${childAsset.name} (${childAsset.id}) ist bereits ein Child von ${parentAsset.name} (${parentAsset.id})`, { 
                sessionId, 
                childAssetId: childAsset.id, 
                childAssetName: childAsset.name,
                parentId: parentAsset.id,
                parentName: parentAsset.name
              });
              return; // Überspringe diese Relation
            }
            
            // Setze Parent-Child-Beziehung
            childAsset.parentId = parentAsset.id;
            parentAsset.children.push(childAsset);
            
            logInfo(`Asset-Beziehung erstellt (to): ${parentAsset.name} (${parentAsset.id}) enthält ${childAsset.name} (${childAsset.id})`, { 
              sessionId, 
              parentId: parentAsset.id, 
              parentName: parentAsset.name,
              childId: childAsset.id,
              childName: childAsset.name
            });
          } else {
            if (!parentAsset) {
              logWarn(`Parent Asset nicht gefunden für Relation (to): ${relation.from.id}`, { sessionId, parentId: relation.from.id });
            }
            if (!childAsset) {
              logWarn(`Child Asset nicht gefunden für Relation (to): ${relation.to.id}`, { sessionId, childId: relation.to.id });
            }
          }
        }
      });
    });

    // Baue den Baum aus Root-Assets (Assets ohne Parent)
    const rootAssets = Array.from(assetMap.values()).filter(asset => !asset.parentId);
    logInfo(`Building tree from ${rootAssets.length} root assets`, { sessionId, rootAssetCount: rootAssets.length });
    
    // Zähle Assets mit Children für Debugging
    const assetsWithChildren = Array.from(assetMap.values()).filter(asset => asset.children.length > 0);
    logInfo(`Assets mit Children: ${assetsWithChildren.length}`, { 
      sessionId, 
      assetsWithChildrenCount: assetsWithChildren.length,
      assetsWithChildren: assetsWithChildren.map(a => ({ name: a.name, id: a.id, childrenCount: a.children.length }))
    });
    
    // Zähle Assets ohne Parent (Roots) und Assets mit Parent
    const assetsWithParent = Array.from(assetMap.values()).filter(asset => asset.parentId);
    logInfo(`Assets mit Parent: ${assetsWithParent.length}`, { 
      sessionId, 
      assetsWithParentCount: assetsWithParent.length
    });
    
    const tree = rootAssets.map(asset => buildSubTree(asset, assetMap));

    // Berechne verwaiste Assets (Assets die weder Root noch Parent haben)
    // Ein Asset sollte entweder Root sein (kein Parent) oder ein Parent haben
    const orphanedAssets = Array.from(assetMap.values()).filter(asset => 
      !asset.parentId && !rootAssets.some(root => root.id === asset.id)
    );
    
    const summary = {
      totalAssets: assets.length,
      rootAssets: rootAssets.length,
      totalDevices: allDeviceIds.size,
      devicesWithDetails: deviceDetailsMap.size,
      attributesSuccessful: attributesSuccessCount,
      attributesFailed: attributesFailedCount,
      assetsWithChildren: assetsWithChildren.length,
      assetsWithParent: assetsWithParent.length,
      orphanedAssets: orphanedAssets.length
    };
    
    endStructureCreationLog(sessionId, summary);
    logInfo(`Tree structure created successfully`, { sessionId, summary });
    
    // Warnung wenn es viele verwaiste Assets gibt
    if (summary.orphanedAssets > 0) {
      logWarn(`Warnung: ${summary.orphanedAssets} verwaiste Assets gefunden (Assets ohne Parent und nicht Root)`, { 
        sessionId, 
        orphanedCount: summary.orphanedAssets,
        totalAssets: summary.totalAssets,
        rootAssets: summary.rootAssets,
        assetsWithParent: summary.assetsWithParent
      });
    }

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
  let sessionId;
  try {
    // Use session token or fallback for backend calls
    const tbToken = session?.tbToken || process.env.THINGSBOARD_TOKEN || 'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJzdGVmYW5fcHJvZEBoZWF0bWFuYWdlci5kZSIsInVzZXJJZCI6ImExZjAzODEwLTUzMTgtMTFlZi1hMjJhLTQ5YTc2ZmE1NzBhYyIsInNjb3BlcyI6WyJURU5BTlRfQURNSU4iXSwic2Vzc2lvbklkIjoiNDA0OWMzYWMtMDIyYy00OTEyLTllOTYtMTlhY2FmYWQ2YmUyIiwiaXNzIjoidGhpbmdzYm9hcmQuaW8iLCJpYXQiOjE3NTc3NzI1MTYsImV4cCI6MTc1Nzc4MTUxNiwiZmlyc3ROYW1lIjoiU3RlZmFuIiwibGFzdE5hbWUiOiJMdXRoZXIiLCJlbmFibGVkIjp0cnVlLCJpc1B1YmxpYyI6ZmFsc2UsInRlbmFudElkIjoiN2UzZDFlYjAtNTMxOC0xMWVmLWEyMmEtNDlhNzZmYTU3MGFjIiwiY3VzdG9tZXJJZCI6IjEzODE0MDAwLTFkZDItMTFiMi04MDgwLTgwODA4MDgwODA4MCJ9.63YLQ1nglW82F9V6yh7YEF9CNFitMVWBtkvWwsAd9u0dwBn4224okNL9_48iFy8zD9pCvwyUR7JnwnbHDPw_7Q';
    sessionId = startStructureCreationLog(id);
    logInfo('Using ThingsBoard token for real data', { sessionId, customerId: id });
    
    const tree = await fetchAssetTree(id, tbToken, sessionId);

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

    logInfo('Tree synchronized successfully and saved to database', { sessionId, customerId: id, treeSize: tree.length });
    endStructureCreationLog(sessionId, { success: true, treeSize: tree.length });
    
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
    // sessionId sollte bereits existieren, aber falls nicht, erstelle eine neue
    if (!sessionId) {
      try {
        sessionId = startStructureCreationLog(id);
      } catch {
        sessionId = `error-${Date.now()}`;
      }
    }
    logError('Error synchronizing asset tree', error);
    endStructureCreationLog(sessionId, { error: error.message });
    return res.status(500).json({
      message: 'Error synchronizing asset tree',
      error: error.message
    });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (err) {
        // Verwende die vorhandene sessionId oder erstelle eine neue für diesen Fehler
        const errorSessionId = sessionId || `error-${Date.now()}`;
        logError('Error closing database connection', err);
      }
    }
  }
} 