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

// Function to get aggregated sensor data for multiple devices
async function getAggregatedSensorData(client, deviceIds, key, startTs, endTs, interval) {
  try {
    const keyId = await resolveKey(client, key);
    
    // Build query for aggregated data
    const deviceIdPlaceholders = deviceIds.map((_, index) => `$${index + 1}`).join(',');
    
    const query = `
      WITH time_buckets AS (
        SELECT 
          generate_series(
            $${deviceIds.length + 1}::bigint,
            $${deviceIds.length + 2}::bigint,
            $${deviceIds.length + 3}::bigint
          ) AS bucket_start,
          generate_series(
            $${deviceIds.length + 1}::bigint + $${deviceIds.length + 3}::bigint,
            $${deviceIds.length + 2}::bigint + $${deviceIds.length + 3}::bigint,
            $${deviceIds.length + 3}::bigint
          ) AS bucket_end
      ),
      raw_data AS (
        SELECT 
          entity_id,
          ts,
          CASE 
            WHEN bool_v IS NOT NULL THEN bool_v::text
            WHEN str_v IS NOT NULL THEN str_v
            WHEN long_v IS NOT NULL THEN long_v::text
            WHEN dbl_v IS NOT NULL THEN dbl_v::text
            WHEN json_v IS NOT NULL THEN json_v::text
            ELSE NULL
          END as value,
          CASE 
            WHEN bool_v IS NOT NULL THEN 'boolean'
            WHEN str_v IS NOT NULL THEN 'string'
            WHEN long_v IS NOT NULL THEN 'long'
            WHEN dbl_v IS NOT NULL THEN 'double'
            WHEN json_v IS NOT NULL THEN 'json'
            ELSE NULL
          END as value_type
        FROM ts_kv
        WHERE entity_id IN (${deviceIdPlaceholders})
          AND key = $${deviceIds.length + 4}
          AND ts >= $${deviceIds.length + 1}
          AND ts <= $${deviceIds.length + 2}
      ),
      aggregated_data AS (
        SELECT 
          tb.bucket_start,
          tb.bucket_end,
          rd.entity_id,
          AVG(CASE WHEN rd.value_type IN ('long', 'double') THEN rd.value::numeric ELSE NULL END) as avg_value,
          MIN(CASE WHEN rd.value_type IN ('long', 'double') THEN rd.value::numeric ELSE NULL END) as min_value,
          MAX(CASE WHEN rd.value_type IN ('long', 'double') THEN rd.value::numeric ELSE NULL END) as max_value,
          COUNT(*) as count,
          MAX(rd.ts) as last_ts
        FROM time_buckets tb
        LEFT JOIN raw_data rd ON rd.ts >= tb.bucket_start AND rd.ts < tb.bucket_end
        GROUP BY tb.bucket_start, tb.bucket_end, rd.entity_id
        HAVING COUNT(*) > 0
      )
      SELECT 
        bucket_start,
        bucket_end,
        entity_id,
        avg_value,
        min_value,
        max_value,
        count,
        last_ts,
        to_char(to_timestamp(bucket_start / 1000), 'YYYY-MM-DD HH24:MI:SS') AS bucket_start_readable,
        to_char(to_timestamp(bucket_end / 1000), 'YYYY-MM-DD HH24:MI:SS') AS bucket_end_readable
      FROM aggregated_data
      ORDER BY bucket_start, entity_id
    `;
    
    const queryParams = [...deviceIds, startTs, endTs, interval, keyId];
    const result = await client.query(query, queryParams);
    
    // Group results by device ID
    const deviceData = {};
    
    for (const row of result.rows) {
      const deviceId = row.entity_id;
      
      if (!deviceData[deviceId]) {
        deviceData[deviceId] = [];
      }
      
      deviceData[deviceId].push({
        ts: row.bucket_start,
        ts_end: row.bucket_end,
        ts_readable: row.bucket_start_readable,
        ts_end_readable: row.bucket_end_readable,
        value: row.avg_value,
        min_value: row.min_value,
        max_value: row.max_value,
        count: row.count,
        last_ts: row.last_ts
      });
    }
    
    return deviceData;
    
  } catch (error) {
    console.error(`Error getting aggregated data for key ${key}:`, error);
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { deviceIds, key, startTs, endTs, interval = 300000 } = req.query;

    // Validate required parameters
    if (!deviceIds) {
      return res.status(400).json({ error: 'deviceIds parameter is required' });
    }

    if (!key) {
      return res.status(400).json({ error: 'key parameter is required' });
    }

    if (!startTs) {
      return res.status(400).json({ error: 'startTs parameter is required' });
    }

    if (!endTs) {
      return res.status(400).json({ error: 'endTs parameter is required' });
    }

    // Parse deviceIds (comma-separated string)
    const deviceIdList = deviceIds.split(',').map(id => id.trim()).filter(id => id);
    if (deviceIdList.length === 0) {
      return res.status(400).json({ error: 'At least one device ID is required' });
    }

    // Validate device IDs format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const deviceId of deviceIdList) {
      if (!uuidRegex.test(deviceId)) {
        return res.status(400).json({ error: `Invalid device ID format: ${deviceId}` });
      }
    }

    // Validate timestamps
    const startTimestamp = parseInt(startTs);
    const endTimestamp = parseInt(endTs);
    const intervalMs = parseInt(interval);

    if (isNaN(startTimestamp) || isNaN(endTimestamp) || isNaN(intervalMs)) {
      return res.status(400).json({ error: 'Invalid timestamp or interval format' });
    }

    if (startTimestamp >= endTimestamp) {
      return res.status(400).json({ error: 'startTs must be before endTs' });
    }

    if (intervalMs < 1000) {
      return res.status(400).json({ error: 'interval must be at least 1000ms' });
    }

    // Get PostgreSQL connection
    const pool = await getPgConnection();
    const client = await pool.connect();

    try {
      // Get aggregated sensor data
      const sensorData = await getAggregatedSensorData(
        client, 
        deviceIdList, 
        key, 
        startTimestamp, 
        endTimestamp, 
        intervalMs
      );

      res.status(200).json({
        success: true,
        device_count: deviceIdList.length,
        key: key,
        start_ts: startTimestamp,
        end_ts: endTimestamp,
        interval: intervalMs,
        data: sensorData
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error querying aggregated device sensors:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
