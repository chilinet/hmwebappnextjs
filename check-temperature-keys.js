#!/usr/bin/env node

const { getPgConnection } = require('./lib/pgdb');

async function checkTemperatureKeys() {
  console.log('🔍 Checking temperature-related keys in ts_kv_dictionary...\n');
  
  let connection;
  try {
    const pool = await getPgConnection();
    const client = await pool.connect();
    
    try {
      // Check for temperature-related keys
      const result = await client.query(`
        SELECT key, key_id 
        FROM ts_kv_dictionary 
        WHERE key ILIKE '%temp%' OR key ILIKE '%sensor%'
        ORDER BY key
      `);
      
      console.log(`Found ${result.rows.length} temperature/sensor related keys:`);
      console.log('=' .repeat(50));
      
      result.rows.forEach(row => {
        console.log(`Key: "${row.key}" -> ID: ${row.key_id}`);
      });
      
      if (result.rows.length === 0) {
        console.log('\n❌ No temperature/sensor keys found!');
        console.log('\nLet me check all available keys...');
        
        const allKeysResult = await client.query(`
          SELECT key, key_id 
          FROM ts_kv_dictionary 
          ORDER BY key
          LIMIT 20
        `);
        
        console.log(`\nFirst 20 available keys:`);
        console.log('=' .repeat(50));
        allKeysResult.rows.forEach(row => {
          console.log(`Key: "${row.key}" -> ID: ${row.key_id}`);
        });
      }
      
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

checkTemperatureKeys().catch(console.error);
