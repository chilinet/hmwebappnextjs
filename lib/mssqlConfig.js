/**
 * Shared MSSQL configuration helper
 * Automatically detects local connections and disables encryption for them
 */
export function getMssqlConfig() {
  // Determine if this is a local connection
  const isLocalConnection = process.env.MSSQL_SERVER === '127.0.0.1' || 
                            process.env.MSSQL_SERVER === 'localhost' ||
                            process.env.MSSQL_SERVER?.includes('localhost');

  return {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    options: {
      encrypt: !isLocalConnection, // Disable encryption for local connections
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 30000,
      requestTimeout: 30000,
    },
  };
}

