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
        
        // Alle Devices des Kunden von ThingsBoard abrufen
        const devicesResponse = await fetch(
          `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/deviceInfos?pageSize=1000&page=0`,
          {
            headers: {
              'accept': 'application/json',
              'X-Authorization': `Bearer ${session.tbToken}`
            }
          }
        );

        if (devicesResponse.ok) {
          const devicesData = await devicesResponse.json();
          const devices = devicesData.data || [];
          devicesCount = devices.length;
          
          // Zähle aktive und inaktive Geräte
          activeDevices = devices.filter(device => device.active === true).length;
          inactiveDevices = devices.filter(device => device.active === false).length;
          
          console.log(`Successfully fetched ${devicesCount} devices from ThingsBoard (${activeDevices} active, ${inactiveDevices} inactive)`);
          
          // Für heatDemand: Berechne Mittelwert aller PercentValveOpen Werte
          let totalValveOpen = 0;
          let devicesWithValveData = 0;
          
          console.log(`Processing ${devices.length} devices for valve data...`);
          
          for (const device of devices) {
            try {
              // Telemetriedaten für PercentValveOpen abrufen
              const telemetryResponse = await fetch(
                `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${device.id.id}/values/timeseries?keys=PercentValveOpen&limit=1`,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Authorization': `Bearer ${session.tbToken}`
                  }
                }
              );

              if (telemetryResponse.ok) {
                const telemetryData = await telemetryResponse.json();
                console.log(`Device ${device.id.id} telemetry data:`, telemetryData);
                
                if (telemetryData.PercentValveOpen && telemetryData.PercentValveOpen.length > 0) {
                  const valveValue = telemetryData.PercentValveOpen[0].value;
                  console.log(`Device ${device.id.id} valve value:`, valveValue, typeof valveValue);
                  
                  if (valveValue !== null && valveValue !== undefined && !isNaN(valveValue)) {
                    const numericValue = Number(valveValue);
                    if (!isNaN(numericValue)) {
                      totalValveOpen += numericValue;
                      devicesWithValveData++;
                      console.log(`Added valve value ${numericValue}, total: ${totalValveOpen}, count: ${devicesWithValveData}`);
                    } else {
                      console.log(`Device ${device.id.id} valve value is not a number:`, valveValue);
                    }
                  } else {
                    console.log(`Device ${device.id.id} valve value is null/undefined/NaN:`, valveValue);
                  }
                } else {
                  console.log(`Device ${device.id.id} has no PercentValveOpen data`);
                }
              } else {
                console.log(`Failed to fetch telemetry for device ${device.id.id}:`, telemetryResponse.status);
              }
            } catch (error) {
              console.log(`Error fetching valve data for device ${device.id.id}:`, error.message);
            }
          }
          
          console.log(`Final calculation: totalValveOpen=${totalValveOpen}, devicesWithValveData=${devicesWithValveData}`);
          
          // Berechne Mittelwert für heatDemand
          if (devicesWithValveData > 0 && !isNaN(totalValveOpen)) {
            const averageValveOpen = (totalValveOpen / devicesWithValveData).toFixed(1);
            heatDemand = `${averageValveOpen}%`;
            console.log(`Calculated heatDemand: ${heatDemand} (from ${devicesWithValveData} devices)`);
          } else {
            console.log(`No valid valve data available (totalValveOpen=${totalValveOpen}, devicesWithValveData=${devicesWithValveData}), using fallback heatDemand`);
          }
        } else {
          console.log('ThingsBoard devices API failed, trying fallback...');
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

      } catch (apiError) {
        console.error('Internal API error:', apiError);
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