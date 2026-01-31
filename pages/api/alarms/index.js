import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { makeThingsBoardRequest } from "../../../lib/utils/thingsboardRequest";

/** Holt den Asset-Pfad für ein Gerät (wie config/devices getAssetHierarchy). */
async function getDevicePath(deviceId, tbToken, customer_id) {
  if (!deviceId || !tbToken) return null;
  try {
    const relationsResponse = await makeThingsBoardRequest(
      `${process.env.THINGSBOARD_URL}/api/relations?toId=${deviceId}&toType=DEVICE&relationTypeGroup=COMMON`,
      { method: 'GET', headers: { 'accept': 'application/json' } },
      customer_id
    );
    if (!relationsResponse.ok) return null;
    const relations = await relationsResponse.json();
    const assetRelation = relations.find((r) => r.from?.entityType === 'ASSET');
    if (!assetRelation?.from?.id) return null;
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const treepathRes = await fetch(
      `${baseUrl}/api/treepath/${assetRelation.from.id}?customerId=${encodeURIComponent(customer_id)}`,
      { headers: { 'x-api-source': 'backend' } }
    );
    if (!treepathRes.ok) return null;
    const treepathData = await treepathRes.json();
    if (treepathData.fullPath?.labels?.length) {
      return treepathData.fullPath.labels.join(' → ');
    }
    if (treepathData.pathString && !treepathData.pathString.startsWith('Asset ')) {
      return treepathData.pathString;
    }
    return null;
  } catch (e) {
    console.warn('getDevicePath error:', e?.message);
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

  try {
    const { customer_id, limit = 50, offset = 0, status = 'ACTIVE' } = req.query;
    
    if (!customer_id) {
      return res.status(400).json({ message: 'Customer ID is required' });
    }

    // ThingsBoard API URL für Alarme
    const thingsboardUrl = process.env.THINGSBOARD_URL;
    const tbToken = session.tbToken;

    if (!tbToken) {
      return res.status(401).json({ message: 'ThingsBoard token not available' });
    }

    // ThingsBoard Alarms API aufrufen - korrekte URL und Parameter
    const alarmsUrl = `${thingsboardUrl}/api/alarms`;
    console.log(`ThingsBoard alarms URL: ${alarmsUrl}`);
    console.log(`ThingsBoard token: ${tbToken}`);
    
    // ThingsBoard Status-Mapping
    const statusMapping = {
      'ACTIVE': 'ACTIVE_UNACK',
      'CLEARED': 'CLEARED',
      'ACK': 'ACTIVE_ACK',
      'UNACK': 'ACTIVE_UNACK'
    };
    
    const tbStatus = statusMapping[status] || 'ACTIVE_UNACK';
    console.log(`Requesting alarms with status: ${status} -> ${tbStatus}`);
    
    const queryParams = new URLSearchParams({
      pageSize: '1000', // Lade alle Alarme, da wir client-seitig filtern müssen
      page: '0',
      status: tbStatus
    });
    
    console.log(`ThingsBoard alarms request URL: ${alarmsUrl}?${queryParams}`);

    const response = await makeThingsBoardRequest(`${alarmsUrl}?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }, customer_id);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ThingsBoard API error:', response.status, errorText);
      console.error('Request URL:', `${alarmsUrl}?${queryParams}`);
      console.error('Headers:', {
        'X-Authorization': `Bearer ${tbToken}`,
        'Content-Type': 'application/json'
      });
      
      // Fallback: Leere Alarme-Liste zurückgeben statt Fehler
      if (response.status === 405 || response.status === 404 || response.status === 400) {
        console.log('ThingsBoard alarms API not available or bad request, returning empty list');
        return res.status(200).json({
          success: true,
          metadata: {
            total_records: 0,
            limit: parseInt(limit),
            offset: parseInt(offset),
            query_time: new Date().toISOString(),
            customer_id: customer_id,
            status: status,
            thingsboard_url: thingsboardUrl,
            note: `ThingsBoard API returned ${response.status}: ${errorText}`
          },
          data: []
        });
      }
      
      return res.status(response.status).json({
        error: 'ThingsBoard API Error',
        message: `ThingsBoard API returned ${response.status}`,
        details: errorText
      });
    }

    const alarmsData = await response.json();
    
    // ThingsBoard gibt Daten in verschiedenen Formaten zurück
    let alarms = alarmsData.data || alarmsData || [];
    
    // Client-seitige Filterung nach Customer (case-insensitive)
    console.log(`Filtering ${alarms.length} alarms for customer: ${customer_id}`);
    alarms = alarms.filter(alarm => {
      // Prüfe verschiedene mögliche Customer-ID Felder
      const alarmCustomerId = alarm.originator?.customerId?.id || 
                             alarm.originator?.customerId || 
                             alarm.customerId?.id || 
                             alarm.customerId;
      
      // Case-insensitive Vergleich
      const matches = alarmCustomerId?.toLowerCase() === customer_id?.toLowerCase();
      if (!matches) {
        console.log(`Alarm ${alarm.id?.id || 'unknown'} customer: ${alarmCustomerId}, expected: ${customer_id}`);
      }
      return matches;
    });
    
    console.log(`Found ${alarms.length} alarms for customer ${customer_id}`);
    
    // Pagination auf gefilterte Ergebnisse anwenden
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    alarms = alarms.slice(startIndex, endIndex);
    
    // Device-Informationen und Geräte-Pfad für jeden Alarm laden
    if (alarms.length > 0) {
      try {
        const enrichedAlarms = await Promise.all(alarms.map(async (alarm) => {
          const deviceId = alarm.originator?.id?.entityType === 'DEVICE' ? alarm.originator?.id?.id : null;
          let device = {
            id: alarm.originator?.id?.id || 'Unknown',
            name: alarm.originator?.name || 'Unbekanntes Gerät',
            type: 'Unknown'
          };
          let devicePath = null;

          if (deviceId) {
            try {
              const [deviceResponse, path] = await Promise.all([
                makeThingsBoardRequest(`${thingsboardUrl}/api/device/${deviceId}`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }, customer_id),
                getDevicePath(deviceId, tbToken, customer_id)
              ]);
              if (deviceResponse?.ok) {
                const deviceData = await deviceResponse.json();
                device = {
                  id: deviceData.id?.id || deviceId,
                  name: deviceData.name || 'Unbekanntes Gerät',
                  type: deviceData.type || 'Unknown'
                };
              }
              if (path) devicePath = path;
            } catch (deviceError) {
              console.error('Error fetching device info:', deviceError);
            }
          }

          return {
            ...alarm,
            device,
            devicePath
          };
        }));

        alarms = enrichedAlarms;
      } catch (error) {
        console.error('Error enriching alarms with device info:', error);
      }
    }
    
    // Metadaten für die Antwort
    const metadata = {
      total_records: alarms.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      query_time: new Date().toISOString(),
      customer_id: customer_id,
      status: status,
      thingsboard_url: thingsboardUrl
    };

    // Antwort senden
    res.status(200).json({
      success: true,
      metadata: metadata,
      data: alarms
    });

  } catch (error) {
    console.error('Error fetching alarms:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Fehler beim Laden der Alarme',
      details: error.message
    });
  }
}
