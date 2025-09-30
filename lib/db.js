import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000,
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

// Validate configuration
if (!config.user || !config.password || !config.server || !config.database) {
  console.error('Missing database configuration. Please check your environment variables:');
  console.error('MSSQL_USER:', config.user ? '✓' : '✗');
  console.error('MSSQL_PASSWORD:', config.password ? '✓' : '✗');
  console.error('MSSQL_SERVER:', config.server ? '✓' : '✗');
  console.error('MSSQL_DATABASE:', config.database ? '✓' : '✗');
}

let pool = null;
let connectionCheckInterval = null;

export async function getConnection() {
  try {
    // Check configuration first
    if (!config.user || !config.password || !config.server || !config.database) {
      throw new Error('Database configuration is incomplete. Please check your environment variables.');
    }
    
    // Always check if pool exists
    if (!pool) {
      console.log('Creating new database connection pool...');
      console.log('Connecting to:', config.server, 'Database:', config.database);
      pool = await sql.connect(config);
      console.log('Database connection pool created successfully');
      
      // Start monitoring the connection
      startConnectionMonitoring();
    }
    
    // Test if the pool is still valid with a simple query
    try {
      await pool.request().query('SELECT 1');
      console.log('Database connection test successful');
    } catch (error) {
      console.log('Database connection test failed, recreating pool...', error.message);
      if (pool) {
        try {
          await pool.close();
        } catch (closeError) {
          console.log('Error closing failed pool:', closeError.message);
        }
      }
      pool = null;
      pool = await sql.connect(config);
      console.log('Database connection pool recreated successfully');
      
      // Start monitoring the new connection
      startConnectionMonitoring();
    }
    
    return pool;
  } catch (error) {
    console.error('Database connection error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      server: config.server,
      database: config.database
    });
    
    // Reset pool on error
    if (pool) {
      try {
        await pool.close();
      } catch (closeError) {
        console.log('Error closing pool on error:', closeError.message);
      }
    }
    pool = null;
    throw error;
  }
}

// Start connection monitoring
function startConnectionMonitoring() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }
  
  connectionCheckInterval = setInterval(async () => {
    if (pool) {
      try {
        await pool.request().query('SELECT 1');
        console.log('Database connection health check passed');
      } catch (error) {
        console.log('Connection check failed, pool will be recreated on next request:', error.message);
        // Don't modify pool.connected, just let the next getConnection() call handle it
      }
    }
  }, 30000); // Check every 30 seconds
}

export async function closeConnection() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
  
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