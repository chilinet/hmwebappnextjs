import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getConnection } from '../../../lib/db';
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
    });
  }

  try {
    // Authentifizierung prüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
        message: 'Nicht authentifiziert'
      });
    }

    const { customerId } = req.query;
    const userCustomerId = session.user?.customerid;

    // Verwende customerId aus Query oder Session
    const targetCustomerId = customerId || userCustomerId;

    if (!targetCustomerId) {
      return res.status(400).json({
        success: false,
        error: 'Missing customer ID',
        message: 'Customer ID fehlt'
      });
    }

    const pool = await getConnection();

    // Dashboard-Statistiken abrufen
    const stats = await getDashboardStats(pool, targetCustomerId, session);

    return res.status(200).json({
      success: true,
      ...stats
    });

  } catch (error) {
    console.error('Dashboard stats API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler',
      message: 'Fehler beim Abrufen der Dashboard-Statistiken'
    });
  }
}

// Hilfsfunktion zum Abrufen aller Geräte mit Pagination
async function fetchAllDevices(customerId, tbToken) {
  const allDevices = [];
  let page = 0;
  const pageSize = 1000;
  let hasNext = true;

  while (hasNext) {
    try {
      const devicesResponse = await fetch(
        `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/deviceInfos?pageSize=${pageSize}&page=${page}`,
        {
          headers: {
            'accept': 'application/json',
            'X-Authorization': `Bearer ${tbToken}`
          }
        }
      );

      if (!devicesResponse.ok) {
        console.error(`Failed to fetch devices page ${page}:`, devicesResponse.status);
        break;
      }

      const devicesData = await devicesResponse.json();
      const devices = devicesData.data || [];
      allDevices.push(...devices);

      // Prüfe, ob weitere Seiten vorhanden sind
      // ThingsBoard gibt normalerweise hasNext oder totalElements zurück
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
}

async function getDashboardStats(pool, customerId, session) {
  try {
    let devicesCount = 0;
    let activeDevices = 0;
    let inactiveDevices = 0;
    let alarmsCount = 0;
    let heatDemand = '85%'; // Fallback-Wert
    
    // Verwende direkt die ThingsBoard Devices API Logik
    if (session?.tbToken && process.env.THINGSBOARD_URL) {
      try {
        console.log('Attempting to fetch devices from ThingsBoard...');
        
        // Alle Devices des Kunden von ThingsBoard abrufen (mit Pagination)
        const devices = await fetchAllDevices(customerId, session.tbToken);
        devicesCount = devices.length;
        
        // Zähle aktive und inaktive Geräte
        activeDevices = devices.filter(device => device.active === true).length;
        inactiveDevices = devices.filter(device => device.active === false).length;
        
        console.log(`Successfully fetched ${devicesCount} devices from ThingsBoard (${activeDevices} active, ${inactiveDevices} inactive)`);
      } catch (apiError) {
        console.error('Internal API error:', apiError);
      }

        // Versuche Alarme abzurufen (direkt von ThingsBoard)
        try {
          const alarmsResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/alarm/query`, {
            method: 'POST',
            headers: {
              'X-Authorization': `Bearer ${session.tbToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              customerId: customerId,
              pageSize: 1,
              page: 0
            })
          });

          if (alarmsResponse.ok) {
            const alarmsData = await alarmsResponse.json();
            alarmsCount = alarmsData.totalElements || 0;
            console.log(`Successfully fetched ${alarmsCount} alarms`);
          }
        } catch (alarmError) {
          console.log('Failed to fetch alarms:', alarmError.message);
        }
    }

    // Fallback auf lokale Datenbank falls API nicht verfügbar oder keine Geräte gefunden
    if (devicesCount === 0) {
      console.log('Falling back to local database...');
      try {
        // Einfachere Abfrage - zähle alle Assets des Kunden
        const totalDevicesResult = await pool.request()
          .input('customerId', sql.UniqueIdentifier, customerId)
          .query(`
            SELECT COUNT(*) as totalDevices
            FROM assets a
            WHERE a.customer_id = @customerId
          `);
        devicesCount = totalDevicesResult.recordset[0]?.totalDevices || 0;
        console.log(`Found ${devicesCount} devices in local database`);
      } catch (dbError) {
        console.error('Database error:', dbError);
      }
    }

    console.log(`Final devices count: ${devicesCount}, alarms count: ${alarmsCount}`);

    return {
      devices: devicesCount,
      activeDevices: activeDevices,
      inactiveDevices: inactiveDevices,
      alarms: alarmsCount,
      heatDemand: heatDemand,
      // Zusätzliche berechnete Werte
      energyConsumption: '2.4', // Mock-Wert - könnte aus Telemetrie berechnet werden
      efficiency: '12%', // Mock-Wert - könnte aus Verbrauchsdaten berechnet werden
      monthlyCost: '€89', // Mock-Wert - könnte aus Verbrauchsdaten berechnet werden
      avgTemperature: '21.5', // Mock-Wert - könnte aus sensorTemperature berechnet werden
      humidity: '45', // Mock-Wert - könnte aus relativeHumidity berechnet werden
      comfortLevel: 'Optimal', // Mock-Wert - könnte aus Temperatur/Luftfeuchtigkeit berechnet werden
      users: 1, // Mock-Wert - könnte aus Benutzerdatenbank berechnet werden
      securityLevel: 'Hoch', // Mock-Wert
      systemStatus: 'Online', // Mock-Wert
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    
    // Fallback-Werte bei Fehlern
    return {
      devices: 0,
      activeDevices: 0,
      inactiveDevices: 0,
      alarms: 0,
      heatDemand: '85%',
      energyConsumption: '0.0',
      efficiency: '0%',
      monthlyCost: '€0',
      avgTemperature: '0.0',
      humidity: '0',
      comfortLevel: 'Unbekannt',
      users: 0,
      securityLevel: 'Niedrig',
      systemStatus: 'Offline',
      lastUpdated: new Date().toISOString(),
      error: 'Fehler beim Abrufen der Statistiken'
    };
  }
} 