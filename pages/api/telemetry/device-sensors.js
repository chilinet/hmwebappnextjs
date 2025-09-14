import { getPgConnection } from '../../../lib/pgdb';

// Function to resolve attribute name to key_id
async function resolveKey(client, key) {
  // If key is already a number, return it
  if (!isNaN(key)) {
    return parseInt(key);
  }
  
  // If key is text, look it up in ts_kv_dictionary
  try {
    const result = await client.query(
      'SELECT key_id FROM ts_kv_dictionary WHERE key = $1 LIMIT 1',
      [key]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Attribute name '${key}' not found in dictionary`);
    }
    
    return result.rows[0].key_id;
  } catch (error) {
    throw new Error(`Failed to resolve attribute name '${key}': ${error.message}`);
  }
}

// Function to get latest sensor values for multiple devices
async function getLatestSensorValues(client, deviceIds, keys) {
  const keyIds = {};
  const keyNames = {};
  
  // Resolve all keys to IDs
  for (const key of keys) {
    try {
      const keyId = await resolveKey(client, key);
      keyIds[key] = keyId;
      
      // Get the key name for reference
      const nameResult = await client.query(
        'SELECT key FROM ts_kv_dictionary WHERE key_id = $1 LIMIT 1',
        [keyId]
      );
      keyNames[key] = nameResult.rows[0]?.key || key;
    } catch (error) {
      console.warn(`Warning: Could not resolve key '${key}': ${error.message}`);
      keyIds[key] = null;
      keyNames[key] = key;
    }
  }
  
  // Build query for all devices and keys
  const deviceIdPlaceholders = deviceIds.map((_, index) => `$${index + 1}`).join(',');
  const keyIdValues = Object.values(keyIds).filter(id => id !== null);
  const keyIdPlaceholders = keyIdValues.map((_, index) => `$${deviceIds.length + index + 1}`).join(',');
  
  if (keyIdValues.length === 0) {
    return {};
  }
  
  const query = `
    WITH latest_values AS (
      SELECT DISTINCT ON (entity_id, key)
        entity_id,
        key,
        ts,
        to_char(to_timestamp(ts / 1000), 'YYYY-MM-DD HH24:MI:SS') AS ts_readable,
        bool_v,
        str_v,
        long_v,
        dbl_v,
        json_v
      FROM ts_kv
      WHERE entity_id IN (${deviceIdPlaceholders})
        AND key IN (${keyIdPlaceholders})
      ORDER BY entity_id, key, ts DESC
    )
    SELECT 
      entity_id,
      key,
      ts,
      ts_readable,
      bool_v,
      str_v,
      long_v,
      dbl_v,
      json_v
    FROM latest_values
    ORDER BY entity_id, key
  `;
  
  const queryParams = [...deviceIds, ...keyIdValues];
  const result = await client.query(query, queryParams);
  
  // Group results by device ID
  const deviceData = {};
  
  for (const row of result.rows) {
    const deviceId = row.entity_id;
    const keyId = row.key;
    
    if (!deviceData[deviceId]) {
      deviceData[deviceId] = {};
    }
    
    // Find the original key name for this key_id
    let originalKey = null;
    for (const [key, id] of Object.entries(keyIds)) {
      if (id === keyId) {
        originalKey = key;
        break;
      }
    }
    
    if (originalKey) {
      let value = null;
      let valueType = null;
      
      // Determine which field has a value and extract it
      if (row.bool_v !== null) {
        value = row.bool_v;
        valueType = 'boolean';
      } else if (row.str_v !== null) {
        value = row.str_v;
        valueType = 'string';
      } else if (row.long_v !== null) {
        value = row.long_v;
        valueType = 'long';
      } else if (row.dbl_v !== null) {
        value = row.dbl_v;
        valueType = 'double';
      } else if (row.json_v !== null) {
        value = row.json_v;
        valueType = 'json';
      }
      
      deviceData[deviceId][originalKey] = {
        value: value,
        value_type: valueType,
        timestamp: row.ts,
        timestamp_readable: row.ts_readable,
        key_id: keyId
      };
    }
  }
  
  return deviceData;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { deviceIds, keys } = req.query;

    // Validate required parameters
    if (!deviceIds) {
      return res.status(400).json({ error: 'deviceIds parameter is required' });
    }

    if (!keys) {
      return res.status(400).json({ error: 'keys parameter is required' });
    }

    // Parse deviceIds (comma-separated string)
    const deviceIdList = deviceIds.split(',').map(id => id.trim()).filter(id => id);
    if (deviceIdList.length === 0) {
      return res.status(400).json({ error: 'At least one device ID is required' });
    }

    // Parse keys (comma-separated string)
    const keyList = keys.split(',').map(key => key.trim()).filter(key => key);
    if (keyList.length === 0) {
      return res.status(400).json({ error: 'At least one key is required' });
    }

    // Validate device IDs format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const deviceId of deviceIdList) {
      if (!uuidRegex.test(deviceId)) {
        return res.status(400).json({ error: `Invalid device ID format: ${deviceId}` });
      }
    }

    // Get PostgreSQL connection
    const pool = await getPgConnection();
    const client = await pool.connect();

    try {
      // Get latest sensor values for all devices and keys
      const sensorData = await getLatestSensorValues(client, deviceIdList, keyList);

      res.status(200).json({
        success: true,
        device_count: deviceIdList.length,
        requested_keys: keyList,
        data: sensorData
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error querying device sensors:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
