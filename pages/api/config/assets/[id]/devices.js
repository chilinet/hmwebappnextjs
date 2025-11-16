import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { getConnection } from '../../../../../lib/db';
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { id } = req.query;

  try {
    // Hole zuerst die customer_id des Users aus der Datenbank
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('userid', sql.Int, session.user.userid)
      .query(`
        SELECT customerid
        FROM hm_users
        WHERE userid = @userid
      `);

    if (userResult.recordset.length === 0) {
      throw new Error('User not found');
    }

    const customerId = userResult.recordset[0].customerid;

    // Hole alle Devices des Customers von ThingsBoard
    const allDevicesResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/devices?pageSize=1000&page=0`,
      {
        headers: {
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      }
    );

    if (!allDevicesResponse.ok) {
      console.error('Failed to fetch all devices:', await allDevicesResponse.text());
      throw new Error('Failed to fetch all devices');
    }
    
    console.log('allDevicesResponse:', allDevicesResponse);

    const allDevicesData = await allDevicesResponse.json();
    const allDevices = allDevicesData.data || [];

    // Hole die zugeordneten Devices
    const response = await fetch(
      `${process.env.THINGSBOARD_URL}/api/relations/info?fromId=${id}&fromType=ASSET`,
      {
        headers: {
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch relations (1):', await response.text());
      throw new Error('Failed to fetch relations');
    }

    const relations = await response.json();
    const deviceRelations = Array.isArray(relations) ? 
      relations.filter(rel => rel.to.entityType === 'DEVICE') : [];

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
          // Nur loggen wenn es kein Timeout ist
          if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
            console.warn(`Error fetching ${scope} attributes for device ${deviceId}:`, error.message);
          }
        }
      }

      return allAttributes;
    };

    // Hole Details und Attribute für zugeordnete Devices
    // Verwende Promise.allSettled statt Promise.all, damit einzelne Fehler nicht alles blockieren
    const deviceResults = await Promise.allSettled(
      deviceRelations.map(async relation => {
        try {
          // Hole Device Details mit Timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 Sekunden für Device-Details
          
          try {
            const deviceResponse = await fetch(
              `${process.env.THINGSBOARD_URL}/api/device/${relation.to.id}`,
              {
                headers: {
                  'X-Authorization': `Bearer ${session.tbToken}`
                },
                signal: controller.signal
              }
            );
            
            clearTimeout(timeoutId);
            
            if (!deviceResponse.ok) {
              console.warn(`Failed to fetch device ${relation.to.id}:`, deviceResponse.status);
              return null;
            }

            const deviceData = await deviceResponse.json();

            // Hole alle Attribute für das Device (mit eigener Fehlerbehandlung)
            const allAttributes = await fetchAllDeviceAttributes(relation.to.id);

            // Debug: Log alle Attribute für das erste Device
            if (deviceRelations.indexOf(relation) === 0) {
              console.log('All attributes for first device:', allAttributes);
            }

            return {
              ...deviceData,
              serverAttributes: allAttributes
            };
          } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
              console.warn(`Error fetching device ${relation.to.id}:`, fetchError.message);
            }
            return null;
          }
        } catch (error) {
          // Ignoriere Fehler beim Verarbeiten einzelner Devices
          if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
            console.warn(`Error processing device ${relation.to.id}:`, error.message);
          }
          return null;
        }
      })
    );
    
    // Extrahiere erfolgreiche Ergebnisse
    const validDevices = deviceResults
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);

    // Finde die nicht zugeordneten Devices
    const assignedDeviceIds = validDevices.map(device => device.id.id);
    const unassignedDevices = allDevices.filter(
      device => !assignedDeviceIds.includes(device.id.id)
    );

    // Prüfe für jedes nicht zugeordnete Device, ob es bereits irgendwo zugeordnet ist
    const trulyUnassignedDevices = await Promise.all(
      unassignedDevices.map(async device => {
        try {
          // Prüfe ob das Device bereits eine "To"-Relation hat
          const relationResponse = await fetch(
            `${process.env.THINGSBOARD_URL}/api/relations/info?toId=${device.id.id}&toType=DEVICE`,
            {
              headers: {
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            }
          );

          if (!relationResponse.ok) {
            console.error(`Failed to fetch relations for device ${device.id.id}:`, await relationResponse.text());
            return null;
          }

          const relations = await relationResponse.json();
          
          // Wenn keine Relations gefunden wurden, ist das Device wirklich nicht zugeordnet
          if (!Array.isArray(relations) || relations.length === 0) {
            return device;
          }
          
          // Wenn es Relations gibt, prüfen ob eine davon vom Typ "Contains" ist
          const hasContainsRelation = relations.some(rel => rel.type === 'Contains');
          return hasContainsRelation ? null : device;

        } catch (error) {
          console.error(`Error checking relations for device ${device.id.id}:`, error);
          return null;
        }
      })
    );

    // Filtere null-Werte heraus
    const filteredUnassignedDevices = trulyUnassignedDevices.filter(device => device !== null);

    // Hole Attribute für die gefilterten nicht zugeordneten Devices
    // Verwende Promise.allSettled, damit einzelne Fehler nicht alles blockieren
    const unassignedResults = await Promise.allSettled(
      filteredUnassignedDevices.map(async device => {
        try {
          // Hole alle Attribute für das Device (mit eigener Fehlerbehandlung)
          const allAttributes = await fetchAllDeviceAttributes(device.id.id);

          return {
            ...device,
            serverAttributes: allAttributes
          };
        } catch (error) {
          // Bei Fehler gebe das Device ohne Attribute zurück
          if (!error.message?.includes('timeout') && !error.message?.includes('aborted')) {
            console.warn(`Error processing unassigned device ${device.id.id}:`, error.message);
          }
          return {
            ...device,
            serverAttributes: {}
          };
        }
      })
    );
    
    // Extrahiere erfolgreiche Ergebnisse, bei Fehlern verwende Device ohne Attribute
    const unassignedDevicesWithAttributes = unassignedResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Bei Fehler gebe das Device ohne Attribute zurück
        const device = filteredUnassignedDevices[index];
        return {
          ...device,
          serverAttributes: {}
        };
      }
    });

    return res.json({
      assigned: validDevices,
      unassigned: unassignedDevicesWithAttributes
    });

  } catch (error) {
    console.error('Error fetching devices (2):', error);
    return res.status(500).json({
      message: 'Error fetching devices (3)',
      error: error.message
    });
  }
} 