/**
 * Datenbank-Cache für nicht zugeordnete Geräte
 * Persistente Speicherung in MSSQL-Datenbank für bessere Performance und Skalierbarkeit
 */

import { getConnection } from '../db';
import sql from 'mssql';

// Standard Cache-Dauer: 24 Stunden
const DEFAULT_CACHE_DURATION_HOURS = 24;

/**
 * Holt alle nicht zugeordneten Geräte für einen Customer aus der Datenbank
 * @param {string} customerId - Customer ID
 * @param {number} maxAgeHours - Maximale Alter des Cache in Stunden (optional, default: 24)
 * @returns {Promise<Array>} Array von Devices oder leeres Array
 */
export async function getUnassignedDevicesFromDb(customerId, maxAgeHours = DEFAULT_CACHE_DURATION_HOURS) {
  try {
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('customerId', sql.NVarChar, customerId)
      .input('maxAge', sql.DateTime2, new Date(Date.now() - maxAgeHours * 60 * 60 * 1000))
      .query(`
        SELECT 
          device_id,
          device_data,
          server_attributes,
          last_sync
        FROM unassigned_devices
        WHERE customer_id = @customerId
          AND last_sync > @maxAge
        ORDER BY last_sync DESC
      `);

    if (result.recordset.length === 0) {
      return [];
    }

    // Parse JSON-Daten zurück zu Objekten
    return result.recordset.map(row => {
      const device = JSON.parse(row.device_data);
      if (row.server_attributes) {
        device.serverAttributes = JSON.parse(row.server_attributes);
      } else {
        device.serverAttributes = {};
      }
      return device;
    });
  } catch (error) {
    console.error('Error fetching unassigned devices from database:', error);
    return [];
  }
}

/**
 * Speichert nicht zugeordnete Geräte in der Datenbank
 * @param {string} customerId - Customer ID
 * @param {Array} devices - Array von Devices
 * @returns {Promise<boolean>} Erfolg
 */
export async function saveUnassignedDevicesToDb(customerId, devices) {
  if (!devices || devices.length === 0) {
    return true; // Keine Devices zu speichern
  }

  try {
    const pool = await getConnection();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      // Lösche alte Einträge für diesen Customer
      await transaction.request().query(`
        DELETE FROM unassigned_devices 
        WHERE customer_id = '${customerId.replace(/'/g, "''")}'
      `);

      // Füge neue Einträge hinzu (MERGE für Upsert)
      for (const device of devices) {
        const deviceId = device.id?.id || device.id;
        const deviceData = JSON.stringify(device);
        const serverAttributes = device.serverAttributes 
          ? JSON.stringify(device.serverAttributes) 
          : null;

        await transaction.request()
          .input('deviceId', sql.NVarChar, deviceId)
          .input('customerId', sql.NVarChar, customerId)
          .input('deviceData', sql.NVarChar(sql.MAX), deviceData)
          .input('serverAttributes', sql.NVarChar(sql.MAX), serverAttributes)
          .query(`
            MERGE unassigned_devices AS target
            USING (SELECT @deviceId AS device_id, @customerId AS customer_id) AS source
            ON target.device_id = source.device_id AND target.customer_id = source.customer_id
            WHEN MATCHED THEN
              UPDATE SET 
                device_data = @deviceData,
                server_attributes = @serverAttributes,
                last_sync = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (device_id, customer_id, device_data, server_attributes, last_sync)
              VALUES (@deviceId, @customerId, @deviceData, @serverAttributes, GETDATE());
          `);
      }

      await transaction.commit();
      console.log(`Saved ${devices.length} unassigned devices to database for customer ${customerId}`);
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error saving unassigned devices to database:', error);
    return false;
  }
}

/**
 * Entfernt ein Device aus dem Cache (wenn es zugeordnet wurde)
 * @param {string} deviceId - Device ID
 * @param {string} customerId - Customer ID (optional, wenn nicht angegeben, wird für alle Customers gelöscht)
 * @returns {Promise<boolean>} Erfolg
 */
export async function removeUnassignedDeviceFromDb(deviceId, customerId = null) {
  try {
    const pool = await getConnection();
    
    if (customerId) {
      await pool.request()
        .input('deviceId', sql.NVarChar, deviceId)
        .input('customerId', sql.NVarChar, customerId)
        .query(`
          DELETE FROM unassigned_devices
          WHERE device_id = @deviceId AND customer_id = @customerId
        `);
    } else {
      await pool.request()
        .input('deviceId', sql.NVarChar, deviceId)
        .query(`
          DELETE FROM unassigned_devices
          WHERE device_id = @deviceId
        `);
    }

    return true;
  } catch (error) {
    console.error('Error removing unassigned device from database:', error);
    return false;
  }
}

/**
 * Invalidiert den Cache für einen Customer (löscht alle Einträge)
 * @param {string} customerId - Customer ID
 * @returns {Promise<boolean>} Erfolg
 */
export async function invalidateUnassignedDevicesCache(customerId) {
  try {
    const pool = await getConnection();
    
    await pool.request()
      .input('customerId', sql.NVarChar, customerId)
      .query(`
        DELETE FROM unassigned_devices
        WHERE customer_id = @customerId
      `);

    console.log(`Invalidated unassigned devices cache for customer ${customerId}`);
    return true;
  } catch (error) {
    console.error('Error invalidating unassigned devices cache:', error);
    return false;
  }
}

/**
 * Bereinigt abgelaufene Cache-Einträge
 * @param {number} maxAgeHours - Maximale Alter in Stunden (optional, default: 24)
 * @returns {Promise<number>} Anzahl gelöschter Einträge
 */
export async function cleanupExpiredUnassignedDevices(maxAgeHours = DEFAULT_CACHE_DURATION_HOURS) {
  try {
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('maxAge', sql.DateTime2, new Date(Date.now() - maxAgeHours * 60 * 60 * 1000))
      .query(`
        DELETE FROM unassigned_devices
        WHERE last_sync < @maxAge
      `);

    const deletedCount = result.rowsAffected[0] || 0;
    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} expired unassigned device cache entries`);
    }
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up expired unassigned devices:', error);
    return 0;
  }
}

/**
 * Gibt Statistiken über den Cache zurück
 * @returns {Promise<Object>} Cache-Statistiken
 */
export async function getUnassignedDevicesCacheStats() {
  try {
    const pool = await getConnection();
    
    const result = await pool.request().query(`
      SELECT 
        COUNT(*) as total_entries,
        COUNT(DISTINCT customer_id) as customer_count,
        SUM(LEN(device_data)) as total_data_size,
        MIN(last_sync) as oldest_entry,
        MAX(last_sync) as newest_entry
      FROM unassigned_devices
    `);

    return {
      totalEntries: result.recordset[0].total_entries || 0,
      customerCount: result.recordset[0].customer_count || 0,
      totalDataSize: result.recordset[0].total_data_size || 0,
      oldestEntry: result.recordset[0].oldest_entry,
      newestEntry: result.recordset[0].newest_entry
    };
  } catch (error) {
    console.error('Error getting unassigned devices cache stats:', error);
    return {
      totalEntries: 0,
      customerCount: 0,
      totalDataSize: 0,
      oldestEntry: null,
      newestEntry: null
    };
  }
}

