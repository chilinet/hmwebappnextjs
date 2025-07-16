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
    const stats = await getDashboardStats(pool, targetCustomerId);

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

async function getDashboardStats(pool, customerId) {
  try {
    // Gesamte Anzahl Geräte
    const totalDevicesResult = await pool.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(`
        SELECT COUNT(*) as totalDevices
        FROM customer_settings cs
        INNER JOIN hm_users u ON cs.customer_id = u.customerid
        WHERE cs.customer_id = @customerId
        AND EXISTS (
          SELECT 1 FROM thingsboard_devices td 
          WHERE td.customer_id = cs.customer_id
        )
      `);

    // Aktive Geräte (letzte Aktivität in den letzten 24 Stunden)
    const activeDevicesResult = await pool.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .input('lastActivityThreshold', sql.DateTime, new Date(Date.now() - 24 * 60 * 60 * 1000))
      .query(`
        SELECT COUNT(*) as activeDevices
        FROM thingsboard_devices td
        WHERE td.customer_id = @customerId
        AND td.last_activity_time > @lastActivityThreshold
      `);

    // Inaktive Geräte
    const inactiveDevicesResult = await pool.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .input('lastActivityThreshold', sql.DateTime, new Date(Date.now() - 24 * 60 * 60 * 1000))
      .query(`
        SELECT COUNT(*) as inactiveDevices
        FROM thingsboard_devices td
        WHERE td.customer_id = @customerId
        AND (td.last_activity_time <= @lastActivityThreshold OR td.last_activity_time IS NULL)
      `);

    // Alerts (Beispiel: Geräte mit kritischen Werten)
    const alertsResult = await pool.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(`
        SELECT COUNT(*) as alerts
        FROM thingsboard_devices td
        WHERE td.customer_id = @customerId
        AND td.status = 'ERROR'
      `);

    // Letzte Aktivitäten
    const recentActivityResult = await pool.request()
      .input('customerId', sql.UniqueIdentifier, customerId)
      .query(`
        SELECT TOP 10
          td.device_name,
          td.last_activity_time,
          td.status
        FROM thingsboard_devices td
        WHERE td.customer_id = @customerId
        AND td.last_activity_time IS NOT NULL
        ORDER BY td.last_activity_time DESC
      `);

    // Fallback-Werte falls keine Daten vorhanden
    const totalDevices = totalDevicesResult.recordset[0]?.totalDevices || 0;
    const activeDevices = activeDevicesResult.recordset[0]?.activeDevices || 0;
    const inactiveDevices = inactiveDevicesResult.recordset[0]?.inactiveDevices || 0;
    const alerts = alertsResult.recordset[0]?.alerts || 0;
    const recentActivity = recentActivityResult.recordset || [];

    return {
      totalDevices,
      activeDevices,
      inactiveDevices,
      alerts,
      recentActivity,
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    
    // Fallback-Werte bei Fehlern
    return {
      totalDevices: 0,
      activeDevices: 0,
      inactiveDevices: 0,
      alerts: 0,
      recentActivity: [],
      lastUpdated: new Date().toISOString(),
      error: 'Fehler beim Abrufen der Statistiken'
    };
  }
} 