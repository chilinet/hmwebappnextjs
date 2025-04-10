import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

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

async function getAssetHierarchy(deviceId, tbToken, session) {
  
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
    if (!assetRelation) return '';
    const treePath = await fetch(`${process.env.NEXTAUTH_URL}/api/treepath/${assetRelation.from.id}?customerId=${session.user.customerid}`, {
      headers: {
        'x-api-source': 'backend'
      }
    });
    const treePathData = await treePath.json();
    //console.log('treePath.pathString:', treePathData.pathString);

    

    return {
      id: assetRelation.to.id,
      pathString: treePathData.pathString
    };

  } catch (error) {
    console.error('Error in getAssetHierarchy:', {
      deviceId,
      error: error.message,
      cause: error.cause
    });
    return '';
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
          'PercentValveOpen',
          'rssi',
          'snr',
          'sf',
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
        `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes/SERVER_SCOPE?keys=lastActivityTime`,
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
        telemetry.lastActivityTime = attributesData.find(attr => attr.key === 'lastActivityTime')?.value;
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

  try {
    const tbResponse = await fetchWithRetry(
      `${process.env.THINGSBOARD_URL}/api/customer/${session.user.customerid}/deviceInfos?pageSize=1000&page=0`,
      {
        headers: {
          'accept': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      }
    );

    const tbData = await tbResponse.json();
    
    //console.log('tbData: ' + JSON.stringify(tbData, null, 2));

    // Hole Asset- und Telemetrie-Informationen für jedes Gerät
    const devicesWithData = await Promise.all(
      tbData.data.map(async device => {
        const [asset, telemetry] = await Promise.all([
          getAssetHierarchy(device.id.id, session.tbToken, session),
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
          telemetry: telemetry
        };
      })
    );

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