import pkg from 'pg';
const { Pool } = pkg;

const config = {
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  host: process.env.PG_HOST,
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5, // Reduziert von 10 auf 5
  idleTimeoutMillis: 10000, // Reduziert von 30000 auf 10000
  connectionTimeoutMillis: 10000, // Reduziert von 30000 auf 10000
  acquireTimeoutMillis: 10000, // Neu hinzugefügt
  allowExitOnIdle: true, // Neu hinzugefügt
};

let pool = null;

export async function getPgConnection() {
  try {
    if (!pool) {
      pool = new Pool(config);
      console.log('PostgreSQL connection pool created');
    }
    
    // Test if the pool is still valid
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch (error) {
      if (error.code === 'ECONNCLOSED' || error.code === 'ECONNRESET') {
        console.log('PostgreSQL connection lost, recreating pool...');
        pool = null;
        pool = new Pool(config);
        console.log('PostgreSQL connection pool recreated');
      } else {
        throw error;
      }
    }
    
    // Final check that pool is valid
    if (!pool) {
      throw new Error('Failed to create PostgreSQL connection pool');
    }
    
    return pool;
  } catch (error) {
    console.error('PostgreSQL connection error:', error);
    // Reset pool on error
    pool = null;
    throw error;
  }
}

export async function closePgConnection() {
  if (pool) {
    try {
      await pool.end();
      pool = null;
      console.log('PostgreSQL connection pool closed');
    } catch (error) {
      console.error('Error closing PostgreSQL connection:', error);
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await closePgConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePgConnection();
  process.exit(0);
});
