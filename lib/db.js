import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
};

let pool = null;

export async function getConnection() {
  try {
    if (!pool) {
      pool = await sql.connect(config);
      console.log('Database connection pool created');
    }
    
    // Test if the pool is still valid
    try {
      await pool.request().query('SELECT 1');
    } catch (error) {
      if (error.code === 'ECONNCLOSED' || error.code === 'ECONNRESET') {
        console.log('Database connection lost, recreating pool...');
        pool = null;
        pool = await sql.connect(config);
        console.log('Database connection pool recreated');
      } else {
        throw error;
      }
    }
    
    // Final check that pool is valid
    if (!pool) {
      throw new Error('Failed to create database connection pool');
    }
    
    return pool;
  } catch (error) {
    console.error('Database connection error:', error);
    // Reset pool on error
    pool = null;
    throw error;
  }
}

export async function closeConnection() {
  if (pool) {
    try {
      await pool.close();
      pool = null;
      console.log('Database connection pool closed');
    } catch (error) {
      console.error('Error closing database connection:', error);
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeConnection();
  process.exit(0);
}); 