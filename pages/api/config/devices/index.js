import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { getConnection, getMssqlConfig } from "../../../../lib/db";
import sql from 'mssql';
import { getCachedDevices, setCachedDevices } from "../../../../lib/utils/deviceCache";

const DEVICES_CACHE_TTL_MS = 60 * 1000; // 1 minute server-side cache

async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 Sekunden Timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      console.error('Fetch error details:', {
        attempt: i + 1,
        url,
        error: error.message,
        cause: error.cause,
        code: error.code,
        name: error.name
      });

      if (i === retries - 1) throw error; // Letzter Versuch

      // Exponentielles Backoff
      const backoffDelay = delay * Math.pow(2, i);
      console.log(`Waiting ${backoffDelay}ms before retry ${i + 1}/${retries} for ${url}`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
}

async function loadTreeData(connection, customerId) {
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
    return [];
  }

  const treeJson = result.recordset[0].tree;
  if (typeof treeJson === 'string') {
    return JSON.parse(treeJson);
  }

  return Array.isArray(treeJson) ? treeJson : [];
}

function buildAssetPathMap(treeData) {
  const map = new Map();

  function walk(nodes, path = []) {
    if (!Array.isArray(nodes)) return;

    for (const node of nodes) {
      const currentNode = {
        id: node?.id,
        name: node?.name,
        type: node?.type,
        label: node?.label
      };
      const nextPath = [...path, currentNode];

      if (node?.id) {
        map.set(node.id, {
          id: node.id,
          pathString: nextPath.map((p) => p.label || p.name || '').filter(Boolean).join(' / '),
          fullPath: {
            labels: nextPath.map((p) => p.label || p.name || '').filter(Boolean),
            nodes: nextPath
          }
        });
      }

      if (Array.isArray(node?.children) && node.children.length > 0) {
        walk(node.children, nextPath);
      }
    }
  }

  walk(treeData, []);
  return map;
}

async function getAssetHierarchy(deviceId, tbToken, assetPathMap) {
  
  //console.log('getAssetHierarchy: ' + deviceId);

  try {
    // Hole die Relations für das Gerät
    const relationsResponse = await fetchWithRetry(
      `${process.env.THINGSBOARD_URL}/api/relations?toId=${deviceId}&toType=DEVICE&relationTypeGroup=COMMON`,
      {
        headers: {
          'accept': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    const relations = await relationsResponse.json();

    //console.log('relations: ' + JSON.stringify(relations, null, 2));

    const assetRelation = relations.find(r => r.from.entityType === 'ASSET');
    if (!assetRelation) return null;
    const assetId = typeof assetRelation.from.id === 'string'
      ? assetRelation.from.id
      : assetRelation.from.id?.id;
    const mappedPath = assetId ? assetPathMap.get(assetId) : null;

    return {
      id: assetId || null,
      pathString: mappedPath?.pathString || (assetId ? `Asset ${assetId}` : ''),
      fullPath: mappedPath?.fullPath || null
    };

  } catch (error) {
    console.error('Error in getAssetHierarchy:', {
      deviceId,
      error: error.message,
      cause: error.cause
    });
    return null;
  }
}

async function getSerialNumbersFromInventoryBatch(deviceIds) {
  const db = getMssqlConfig().database;
  const serialByDeviceId = {};

  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return serialByDeviceId;
  }

  try {
    const pool = await getConnection();

    // Dedupe and chunk to keep the SQL statement manageable.
    const uniqueIds = Array.from(new Set(deviceIds.filter(Boolean)));
    const chunkSize = 200;

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const request = pool.request();
      const placeholders = chunk.map((id, idx) => {
        const paramName = `deviceId_${i + idx}`;
        request.input(paramName, sql.VarChar, id);
        return `@${paramName}`;
      });

      const result = await request.query(`
        SELECT tbconnectionid, serialnbr
        FROM ${db}.dbo.inventory
        WHERE tbconnectionid IN (${placeholders.join(', ')})
      `);

      for (const row of result.recordset || []) {
        if (row.tbconnectionid) {
          serialByDeviceId[row.tbconnectionid] = row.serialnbr || null;
        }
      }
    }

    return serialByDeviceId;
  } catch (error) {
    console.error('Error getting serial numbers from inventory (batch):', error);
    return {};
  }
}

async function getLatestTelemetry(deviceId, tbToken) {
  try {
    // Telemetrie-Daten abrufen
    const [telemetryResponse, attributesResponse] = await Promise.allSettled([
      fetch(
        `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${[
          'batteryVoltage',
          'channel',
          'fCnt',
          'gatewayId',
          'PercentValveOpen',
          'rssi',
          'snr',
          'sf',
          'signalQuality',
          'motorPosition',
          'motorRange',
          'raw',
          'relativeHumidity',
          'sensorTemperature',
          'targetTemperature',
          'channel',
          'manualTargetTemperatureUpdate',
          'powerSourceStatus'
        ].join(',')}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${tbToken}`
          }
        }
      ),
      fetch(
        `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes/SERVER_SCOPE`,
        {
          headers: {
            'accept': 'application/json',
            'X-Authorization': `Bearer ${tbToken}`
          }
        }
      )
    ]);
    //console.log('telemetryResponse: ' + JSON.stringify(telemetryResponse, null, 2));  
    //console.log('attributesResponse: ' + JSON.stringify(attributesResponse, null, 2));
    const telemetry = {};

    // Verarbeite Telemetrie-Daten, wenn verfügbar
    if (telemetryResponse.status === 'fulfilled' && telemetryResponse.value) {
      const telemetryData = await telemetryResponse.value.json();
      Object.entries(telemetryData).forEach(([key, values]) => {
        let value = values[0]?.value || null;
        //console.log('key: ' + key + ' value: ' + value);
        if (key === 'PercentValveOpen' && value !== null) {
          value = Math.round(value);
        }
        telemetry[key] = value;
      });
    }

    // Verarbeite Attribute-Daten, wenn verfügbar
    if (attributesResponse.status === 'fulfilled' && attributesResponse.value) {
      const attributesData = await attributesResponse.value.json();
      //console.log('attributesData: ' + JSON.stringify(attributesData, null, 2));
      if (attributesData && attributesData.length > 0) {
        // Speichere alle Server-Attribute
        attributesData.forEach(attr => {
          telemetry[attr.key] = attr.value;
        });
      }
    }

    return telemetry;
  } catch (error) {
    console.error('Error in getLatestTelemetry:', {
      deviceId,
      error: error.message,
      cause: error.cause
    });
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!session.user.customerid) {
    return res.status(400).json({ 
      message: 'Customer ID not found in session',
      session: JSON.stringify(session, null, 2)  // Dies wird uns helfen zu sehen, was in der Session ist
    });
  }

  if (!session.tbToken) {
    return res.status(400).json({ message: 'ThingsBoard token not found in session' });
  }

  const customerId = session.user.customerid;
  const forceRefresh = req.query?.refresh === 'true' || req.headers['x-force-refresh'] === '1';

  if (!forceRefresh) {
    const cachedDevices = getCachedDevices(customerId);
    if (cachedDevices) {
      return res.json(cachedDevices);
    }
  }

  try {
    // Hilfsfunktion zum Abrufen aller Geräte mit Pagination
    const fetchAllDevices = async (customerId, tbToken) => {
      const allDevices = [];
      let page = 0;
      const pageSize = 1000;
      let hasNext = true;

      while (hasNext) {
        try {
          const devicesResponse = await fetchWithRetry(
            `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/deviceInfos?pageSize=${pageSize}&page=${page}`,
            {
              headers: {
                'accept': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`
              }
            }
          );

          const devicesData = await devicesResponse.json();
          const devices = devicesData.data || [];
          allDevices.push(...devices);

          // Prüfe, ob weitere Seiten vorhanden sind
          const totalElements = devicesData.totalElements || 0;
          const totalPages = devicesData.totalPages || Math.ceil(totalElements / pageSize);
          hasNext = devices.length === pageSize && (page + 1) < totalPages;

          console.log(`Fetched page ${page}: ${devices.length} devices (total so far: ${allDevices.length})`);
          
          page++;
        } catch (error) {
          console.error(`Error fetching devices page ${page}:`, error);
          break;
        }
      }

      return allDevices;
    };

    // Alle Geräte mit Pagination abrufen
    const allDevices = await fetchAllDevices(customerId, session.tbToken);
    
    console.log(`Total devices fetched: ${allDevices.length}`);
    const connection = await getConnection();
    const treeData = await loadTreeData(connection, customerId);
    const assetPathMap = buildAssetPathMap(treeData);

    const serialByDeviceId = await getSerialNumbersFromInventoryBatch(
      allDevices.map((device) => device?.id?.id).filter(Boolean)
    );

    // Hole Asset- und Telemetrie-Informationen für jedes Gerät; serials are preloaded in batch.
    const devicesWithData = await Promise.all(
      allDevices.map(async device => {
        const [asset, telemetry] = await Promise.all([
          getAssetHierarchy(device.id.id, session.tbToken, assetPathMap),
          getLatestTelemetry(device.id.id, session.tbToken)
        ]);
       // console.log('device: ' + JSON.stringify(device, null, 2));
       // console.log('asset: ' + JSON.stringify(asset, null, 2));
        //console.log('telemetry: ' + JSON.stringify(telemetry, null, 2));
        return {
          id: device.id.id,
          name: device.name,
          type: device.type,
          active: device.active,
          lastActivityTime: device.lastActivityTime,
          label: device.label || '',
          additionalInfo: device.additionalInfo || {},
          asset: asset,
          telemetry: telemetry,
          serverAttributes: telemetry, // Server-Attribute sind jetzt in telemetry enthalten
          serialNumber: serialByDeviceId[device.id.id] || null // Seriennummer aus der lokalen inventory-Tabelle
        };
      })
    );

    setCachedDevices(customerId, devicesWithData, DEVICES_CACHE_TTL_MS);
    return res.json(devicesWithData);
  } catch (error) {
    console.error('Error in handler:', {
      error: error.message,
      cause: error.cause,
      session: {
        customerid: session.user.customerid,
        hasToken: !!session.tbToken
      }
    });
    return res.status(500).json({ 
      message: 'Error fetching devices',
      error: error.message 
    });
  }
} 