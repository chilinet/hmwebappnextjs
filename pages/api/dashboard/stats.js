import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getConnection } from '../../../lib/db';
import { getPgConnection } from '../../../lib/pgdb.js';
import {
  normalizeUuid,
  fetchDefaultEntryAssetId,
  getDeviceSqlCountsQuery
} from '../../../lib/config/devicesSqlShared.js';
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

async function fetchThingsBoardAlarmCount(tbToken, customerId) {
  if (!tbToken || !process.env.THINGSBOARD_URL) return 0;
  try {
    const alarmsResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/alarm/query`, {
      method: 'POST',
      headers: {
        'X-Authorization': `Bearer ${tbToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customerId,
        pageSize: 1,
        page: 0
      })
    });
    if (alarmsResponse.ok) {
      const alarmsData = await alarmsResponse.json();
      const n = alarmsData.totalElements || 0;
      console.log(`Successfully fetched ${n} alarms`);
      return n;
    }
  } catch (alarmError) {
    console.log('Failed to fetch alarms:', alarmError.message);
  }
  return 0;
}

async function getDashboardStats(pool, customerId, session) {
  try {
    let devicesCount = 0;
    let activeDevices = 0;
    let inactiveDevices = 0;
    let alarmsCount = 0;
    let heatDemand = '85%'; // Fallback-Wert
    let deviceStatsFromSql = false;

    // Gerätezahlen wie /api/config/devices-sql (PostgreSQL ThingsBoard-DB + optional Teilbaum)
    const pgCustomerId = normalizeUuid(customerId);
    if (pgCustomerId && session?.user) {
      try {
        const startId = await fetchDefaultEntryAssetId(session.user.userid);
        const pgPool = await getPgConnection();
        const pgClient = await pgPool.connect();
        try {
          const { text, values } = getDeviceSqlCountsQuery(startId, pgCustomerId);
          const countResult = await pgClient.query(text, values);
          const row = countResult.rows[0];
          if (row) {
            devicesCount = Number(row.devices) || 0;
            activeDevices = Number(row.active_devices) || 0;
            inactiveDevices = Number(row.inactive_devices) || 0;
            deviceStatsFromSql = true;
            console.log(
              `Dashboard stats: device counts from SQL (${devicesCount} total, ${activeDevices} active, ${inactiveDevices} inactive)`
            );
          }
        } finally {
          pgClient.release();
        }
      } catch (pgErr) {
        console.warn('Dashboard stats: PostgreSQL device counts failed:', pgErr.message);
      }
    }

    // ThingsBoard: nur noch Fallback für Gerätezahlen, weiterhin Quelle für Alarme
    if (!deviceStatsFromSql && session?.tbToken && process.env.THINGSBOARD_URL) {
      try {
        console.log('Dashboard stats: attempting ThingsBoard device counts (fallback)...');
        const devices = await fetchAllDevices(customerId, session.tbToken);
        devicesCount = devices.length;
        activeDevices = devices.filter((device) => device.active === true).length;
        inactiveDevices = devices.filter((device) => device.active === false).length;
        console.log(
          `Successfully fetched ${devicesCount} devices from ThingsBoard (${activeDevices} active, ${inactiveDevices} inactive)`
        );
      } catch (apiError) {
        console.error('Internal API error:', apiError);
      }
    }

    if (session?.tbToken && process.env.THINGSBOARD_URL) {
      alarmsCount = await fetchThingsBoardAlarmCount(session.tbToken, customerId);
    }

    // MSSQL-Fallback nur wenn weder SQL noch TB Gerätezahlen geliefert haben
    if (!deviceStatsFromSql && devicesCount === 0 && !(session?.tbToken && process.env.THINGSBOARD_URL)) {
      console.log('Falling back to local database (assets count)...');
      try {
        const totalDevicesResult = await pool.request()
          .input('customerId', sql.UniqueIdentifier, customerId)
          .query(`
            SELECT COUNT(*) as totalDevices
            FROM assets a
            WHERE a.customer_id = @customerId
          `);
        devicesCount = totalDevicesResult.recordset[0]?.totalDevices || 0;
        console.log(`Found ${devicesCount} assets in local database`);
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