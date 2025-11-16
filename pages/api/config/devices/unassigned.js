import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { getConnection } from "../../../../lib/db";
import sql from 'mssql';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Hole zuerst die customer_id des Users aus der Datenbank
    // Mit Retry-Mechanismus für geschlossene Verbindungen
    let pool;
    let userResult;
    let retries = 3;
    
    while (retries > 0) {
      try {
        pool = await getConnection();
        userResult = await pool.request()
          .input('userid', sql.Int, session.user.userid)
          .query(`
            SELECT customerid
            FROM hm_users
            WHERE userid = @userid
          `);
        break; // Erfolgreich, beende die Schleife
      } catch (error) {
        if ((error.code === 'ECONNCLOSED' || error.code === 'ECONNRESET') && retries > 1) {
          console.log(`Database connection closed, retrying... (${retries - 1} retries left)`);
          retries--;
          // Kurz warten vor dem Retry
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        } else {
          throw error; // Anderer Fehler oder keine Retries mehr
        }
      }
    }

    if (!userResult || userResult.recordset.length === 0) {
      throw new Error('User not found');
    }

    const customerId = userResult.recordset[0].customerid;

    // Hole alle Devices des Customers
    const allDevicesResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/devices?pageSize=1000&page=0`,
      {
        headers: {
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      }
    );

    if (!allDevicesResponse.ok) {
      throw new Error('Failed to fetch devices');
    }

    const allDevicesData = await allDevicesResponse.json();
    const allDevices = allDevicesData.data || [];

    // Hilfsfunktion zum Abrufen aller Attribute für ein Device mit Timeout
    const fetchAllDeviceAttributes = async (deviceId) => {
      const scopes = ['SERVER_SCOPE', 'SHARED_SCOPE', 'CLIENT_SCOPE'];
      const allAttributes = {};
      const timeout = 5000; // 5 Sekunden Timeout pro Request
      
      for (const scope of scopes) {
        try {
          // Erstelle einen AbortController für Timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          try {
            const attributesResponse = await fetch(
              `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes/${scope}`,
              {
                headers: {
                  'X-Authorization': `Bearer ${session.tbToken}`
                },
                signal: controller.signal
              }
            );

            clearTimeout(timeoutId);

            if (attributesResponse.ok) {
              const attributes = await attributesResponse.json();
              if (Array.isArray(attributes)) {
                attributes.forEach(attr => {
                  allAttributes[attr.key] = attr.value;
                });
              }
            }
          } catch (fetchError) {
            clearTimeout(timeoutId);
            // Ignoriere Timeout-Fehler und Abort-Fehler stillschweigend
            if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
              console.warn(`Error fetching ${scope} attributes for device ${deviceId}:`, fetchError.message || fetchError);
            }
          }
        } catch (error) {
          // Ignoriere Fehler beim Abrufen einzelner Scopes
          if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
            console.warn(`Error fetching ${scope} attributes for device ${deviceId}:`, error.message || error);
          }
        }
      }

      return allAttributes;
    };

    // Hole die Attribute für alle Devices in einem Batch
    // Verwende Promise.allSettled statt Promise.all, damit einzelne Fehler nicht alles blockieren
    const deviceResults = await Promise.allSettled(
      allDevices.map(async device => {
        try {
          // Relation-Check mit Timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 Sekunden
          
          try {
            const relationResponse = await fetch(
              `${process.env.THINGSBOARD_URL}/api/relations/info?toId=${device.id.id}&toType=DEVICE`,
              {
                headers: {
                  'X-Authorization': `Bearer ${session.tbToken}`
                },
                signal: controller.signal
              }
            );

            clearTimeout(timeoutId);

            if (!relationResponse.ok) {
              return null;
            }

            const relations = await relationResponse.json();
            
            // Wenn keine Relations oder keine "Contains"-Relation gefunden wurde
            if (!Array.isArray(relations) || !relations.some(rel => rel.type === 'Contains')) {
              // Hole alle Attribute für das Device (mit eigener Fehlerbehandlung)
              const allAttributes = await fetchAllDeviceAttributes(device.id.id);

              // Debug: Log alle Attribute für das erste Device
              if (allDevices.indexOf(device) === 0) {
                console.log('All attributes for first unassigned device:', allAttributes);
              }

              return {
                ...device,
                serverAttributes: allAttributes
              };
            }
            return null;
          } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
              console.warn(`Error fetching relations for device ${device.id.id}:`, fetchError.message || fetchError);
            }
            return null;
          }
        } catch (error) {
          // Ignoriere Fehler beim Verarbeiten einzelner Devices
          if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
            console.warn(`Error processing device ${device.id.id}:`, error.message || error);
          }
          return null;
        }
      })
    );
    
    // Extrahiere erfolgreiche Ergebnisse
    const devicesWithAttributes = deviceResults
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

    // Filtere null-Werte heraus
    const unassignedDevices = devicesWithAttributes.filter(device => device !== null);

    return res.json(unassignedDevices);

  } catch (error) {
    console.error('Error fetching unassigned devices:', error);
    return res.status(500).json({ 
      message: 'Error fetching unassigned devices',
      error: error.message 
    });
  }
} 