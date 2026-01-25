import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getPgConnection } from '../../../lib/pgdb.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
    });
  }

  // Authentifizierung prüfen
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Nicht authentifiziert'
    });
  }

  // Customer ID aus Session holen
  const customerId = session.user.customerid;
  if (!customerId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Customer ID konnte nicht ermittelt werden'
    });
  }

  try {
    // PostgreSQL Verbindung holen
    const pool = await getPgConnection();
    const client = await pool.connect();
    
    try {
      // SQL Query ausführen - nur für den angemeldeten Kunden
      const query = `
        SELECT
          c.id    AS customer_id,
          c.title AS customer_name,
          d.id    AS device_id,
          d.name  AS device_name,
          d.label AS device_label,
          dp.name AS device_profile,
          r.from_id AS asset_id,
          -- sensorTemperature (Telemetry)
          MAX(CASE WHEN kd_t.key = 'sensorTemperature'
                   THEN t.dbl_v END) AS sensorTemperature,
          -- PercentValveOpen (dbl_v oder long_v)
          MAX(CASE WHEN kd_t.key = 'PercentValveOpen'
                   THEN COALESCE(t.dbl_v, t.long_v::double precision) END) AS PercentValveOpen,
          -- targetTemperature (Attribute)
          MAX(CASE WHEN ak.attribute_key = 'targetTemperature'
                   THEN ak.long_v END) AS targetTemperature,
          -- letzte Änderung (Telemetry oder Attribute)
          to_timestamp(
              GREATEST(
                  MAX(t.ts),
                  MAX(ak.last_update_ts)
              ) / 1000.0
          ) AT TIME ZONE 'Europe/Berlin' AS last_update_ts,
          -- Device Status: Aktiv wenn letzte Aktivität weniger als 24 Stunden alt ist
          CASE 
            WHEN GREATEST(
                  MAX(t.ts),
                  MAX(ak.last_update_ts)
              ) > EXTRACT(EPOCH FROM NOW() - INTERVAL '24 hours') * 1000
            THEN true
            ELSE false
          END AS device_active
        FROM device d
        JOIN device_profile dp
            ON dp.id = d.device_profile_id
        JOIN customer c
            ON d.customer_id = c.id
        -- Relations: Device zu Asset
        LEFT JOIN relation r
            ON r.to_id = d.id
            AND r.to_type = 'DEVICE'
            AND r.from_type = 'ASSET'
            AND r.relation_type_group = 'COMMON'
        -- Telemetry
        LEFT JOIN ts_kv_latest t
            ON t.entity_id = d.id
        LEFT JOIN ts_kv_dictionary kd_t
            ON kd_t.key_id = t.key
        -- Attributes
        LEFT JOIN attribute_kv ak
            ON ak.entity_id = d.id
        WHERE c.id = $1
          AND LOWER(dp.name) IN (
            'dnt-lw-etrv-c',
            'dnt-lw-etrv',
            'mcpanel',
            'lw-etrv',
            'vicki',
            'dnt-lw-wth',
            'tbhh100'
          )
        GROUP BY
            c.id,
            c.title,
            d.id,
            d.name,
            d.label,
            dp.name,
            r.from_id
        ORDER BY
            c.title,
            d.name;
      `;
      
      const result = await client.query(query, [customerId]);
      
      res.status(200).json({
        success: true,
        data: result.rows,
        count: result.rows.length
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Temperaturen API Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === '42P01') {
      return res.status(404).json({
        error: 'Table not found',
        message: 'Eine oder mehrere Tabellen wurden nicht gefunden'
      });
    }
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Database connection failed',
        message: 'Verbindung zur Datenbank fehlgeschlagen'
      });
    }
    
    // Generischer Fehler
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Ein interner Fehler ist aufgetreten',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

