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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { entity_id, key, from, to, limit = 1 } = req.query;

    // Validate required parameters
    if (!entity_id) {
      return res.status(400).json({ error: 'entity_id parameter is required' });
    }

    if (!key) {
      return res.status(400).json({ error: 'key parameter is required' });
    }

    // Validate entity_id format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(entity_id)) {
      return res.status(400).json({ error: 'entity_id must be a valid UUID' });
    }

    // Validate limit
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      return res.status(400).json({ error: 'limit must be a number between 1 and 1000' });
    }

    // Validate timerange if provided
    let fromTimestamp = null;
    let toTimestamp = null;

    if (from) {
      fromTimestamp = new Date(from).getTime();
      if (isNaN(fromTimestamp)) {
        return res.status(400).json({ error: 'from parameter must be a valid date' });
      }
    }

    if (to) {
      toTimestamp = new Date(to).getTime();
      if (isNaN(toTimestamp)) {
        return res.status(400).json({ error: 'to parameter must be a valid date' });
      }
    }

    if (fromTimestamp && toTimestamp && fromTimestamp >= toTimestamp) {
      return res.status(400).json({ error: 'from timestamp must be before to timestamp' });
    }

    // Get PostgreSQL connection
    const pool = await getPgConnection();
    const client = await pool.connect();

    try {
      // Resolve key (text to number if needed)
      const resolvedKey = await resolveKey(client, key);
      
      let query;
      let queryParams;

      if (fromTimestamp && toTimestamp) {
        // Query with timerange
        query = `
          SELECT entity_id,
                 key,
                 ts,
                 to_char(to_timestamp(ts / 1000), 'YYYY-MM-DD HH24:MI:SS') AS ts_readable,
                 bool_v,
                 str_v,
                 long_v,
                 dbl_v,
                 json_v
          FROM ts_kv
          WHERE entity_id = $1
            AND key = $2
            AND ts >= $3
            AND ts <= $4
          ORDER BY ts DESC
          LIMIT $5
        `;
        queryParams = [entity_id, resolvedKey, fromTimestamp, toTimestamp, limitNum];
      } else {
        // Query without timerange - get latest values
        query = `
          SELECT entity_id,
                 key,
                 ts,
                 to_char(to_timestamp(ts / 1000), 'YYYY-MM-DD HH24:MI:SS') AS ts_readable,
                 bool_v,
                 str_v,
                 long_v,
                 dbl_v,
                 json_v
          FROM ts_kv
          WHERE entity_id = $1
            AND key = $2
          ORDER BY ts DESC
          LIMIT $3
        `;
        queryParams = [entity_id, resolvedKey, limitNum];
      }

      const result = await client.query(query, queryParams);

      // Process each row to extract the actual value and type
      const dataWithoutEntityId = result.rows.map(row => {
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
        
        return {
          key: row.key,
          ts: row.ts,
          ts_readable: row.ts_readable,
          value: value,
          value_type: valueType
        };
      });

      res.status(200).json({
        success: true,
        entity_id: entity_id,
        data: dataWithoutEntityId,
        count: result.rows.length,
        parameters: {
          key: key, // Original key (text or number)
          key_resolved: resolvedKey, // Resolved numeric key
          from: from ? new Date(from).toISOString() : null,
          to: to ? new Date(to).toISOString() : null,
          limit: limitNum
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error querying ts_kv table:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
