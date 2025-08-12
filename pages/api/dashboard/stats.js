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
    let alarmsCount = 0;
    
    // Versuche zuerst ThingsBoard, falls Token verfügbar
    if (session?.tbToken && process.env.THINGSBOARD_URL) {
      try {
        console.log('Attempting to fetch devices from ThingsBoard...');
        
        // Versuche verschiedene Endpunkte für Geräte
        const endpoints = [
          `/api/customer/${customerId}/devices?pageSize=1000`,
          `/api/tenant/devices?pageSize=1000`,
          `/api/devices?pageSize=1000`
        ];

        for (const endpoint of endpoints) {
          try {
            const devicesResponse = await fetch(`${process.env.THINGSBOARD_URL}${endpoint}`, {
              headers: {
                'X-Authorization': `Bearer ${session.tbToken}`,
                'Content-Type': 'application/json'
              }
            });

            if (devicesResponse.ok) {
              const devicesData = await devicesResponse.json();
              devicesCount = devicesData.data?.length || 0;
              console.log(`Successfully fetched ${devicesCount} devices from ${endpoint}`);
              break;
            }
          } catch (error) {
            console.log(`Endpoint ${endpoint} failed:`, error.message);
          }
        }

        // Versuche Alarme abzurufen
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

      } catch (tbError) {
        console.error('ThingsBoard API error:', tbError);
      }
    }

    // Fallback auf lokale Datenbank falls ThingsBoard nicht verfügbar oder keine Geräte gefunden
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
      alarms: alarmsCount,
      heatDemand: '85%', // Mock-Wert für Wärmeanforderung
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    
    // Fallback-Werte bei Fehlern
    return {
      devices: 0,
      alarms: 0,
      heatDemand: '85%',
      lastUpdated: new Date().toISOString(),
      error: 'Fehler beim Abrufen der Statistiken'
    };
  }
} 