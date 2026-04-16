/**
 * Zentrale MSSQL-Konfiguration aus Umgebungsvariablen.
 * MSSQL_USER, MSSQL_PASSWORD, MSSQL_SERVER, MSSQL_DATABASE – optional MSSQL_PORT.
 */

function isLocalMssqlServer(server) {
  if (!server) return false;
  const s = String(server);
  return s === '127.0.0.1' || s === 'localhost' || s.includes('localhost');
}

function parseMssqlPort() {
  const raw = process.env.MSSQL_PORT;
  if (raw == null || String(raw).trim() === '') return undefined;
  const p = parseInt(String(raw), 10);
  return Number.isFinite(p) && p > 0 ? p : undefined;
}

/**
 * Konfiguration für sql.connect (ohne Pool-Extras).
 */
export function getMssqlConfig() {
  const server = process.env.MSSQL_SERVER;
  const port = parseMssqlPort();
  const cfg = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server,
    database: process.env.MSSQL_DATABASE,
    options: {
      encrypt: !isLocalMssqlServer(server),
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 30000,
      requestTimeout: 30000,
    },
  };
  if (port !== undefined) {
    cfg.port = port;
  }
  return cfg;
}

/**
 * Pool-Konfiguration für lib/db.js (Tarn + validateConnection).
 */
export function getMssqlPoolConfig() {
  const maxPool = (() => {
    const raw = process.env.MSSQL_POOL_MAX;
    if (raw == null || String(raw).trim() === '') return 10;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 10;
  })();

  return {
    ...getMssqlConfig(),
    validateConnection: true,
    pool: {
      max: maxPool,
      min: 1,
      idleTimeoutMillis: 120000,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },
  };
}
