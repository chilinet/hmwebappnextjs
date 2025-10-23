import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { makeThingsBoardRequest } from "../../../lib/utils/thingsboardRequest";


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
    
    // Device-Informationen für jeden Alarm laden
    if (alarms.length > 0) {
      try {
        const enrichedAlarms = await Promise.all(alarms.map(async (alarm) => {
          if (alarm.originator?.id?.entityType === 'DEVICE' && alarm.originator?.id?.id) {
            try {
              const deviceResponse = await makeThingsBoardRequest(`${thingsboardUrl}/api/device/${alarm.originator.id.id}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                }
              }, customer_id);
              
              if (deviceResponse.ok) {
                const deviceData = await deviceResponse.json();
                return {
                  ...alarm,
                  device: {
                    id: deviceData.id?.id || alarm.originator.id.id,
                    name: deviceData.name || 'Unbekanntes Gerät',
                    type: deviceData.type || 'Unknown'
                  }
                };
              }
            } catch (deviceError) {
              console.error('Error fetching device info:', deviceError);
            }
          }
          
          // Fallback wenn Device-Info nicht geladen werden kann
          return {
            ...alarm,
            device: {
              id: alarm.originator?.id?.id || 'Unknown',
              name: alarm.originator?.name || 'Unbekanntes Gerät',
              type: 'Unknown'
            }
          };
        }));
        
        alarms = enrichedAlarms;
      } catch (error) {
        console.error('Error enriching alarms with device info:', error);
        // Fallback: Alarme ohne Device-Info zurückgeben
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
