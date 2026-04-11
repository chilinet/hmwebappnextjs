import sql from 'mssql';

// Determine if this is a local connection
const isLocalConnection = process.env.MSSQL_SERVER === '127.0.0.1' ||
                          process.env.MSSQL_SERVER === 'localhost' ||
                          process.env.MSSQL_SERVER?.includes('localhost');

// Export function to get MSSQL config (for use in other files)
export function getMssqlConfig() {
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

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  /** Explizit: Tarn-Pool prüft Verbindungen vor Wiederverwendung (SELECT 1). */
  validateConnection: true,
  options: {
    encrypt: !isLocalConnection, // Disable encryption for local connections
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000,
    requestTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 1,
    idleTimeoutMillis: 120000,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
};

const RETRY_INSTALLED = Symbol('hmMssqlRetryInstalled');

/** Alle pool.close / sql.connect seriell ausführen — verhindert Tarn „aborted“ bei parallelem Reset. */
let poolExclusiveChain = Promise.resolve();

function runPoolExclusive(fn) {
  const run = poolExclusiveChain.then(() => fn());
  poolExclusiveChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

function isTransientSqlError(error) {
  if (!error) return false;
  const code = error.code || error.originalError?.code;
  if (code === 'ECONNCLOSED' || code === 'ENOTOPEN' || code === 'ESOCKET' || code === 'ETIMEOUT' || code === 'ETIMEDOUT') {
    return true;
  }
  const msg = String(error.message || '');
  if (/connection is closed|connection ended|socket hang up|ECONNRESET/i.test(msg)) {
    return true;
  }
  // Tarn bricht wartende acquire ab, wenn ein anderer Request parallel pool.destroy auslöst
  if (/^aborted$/i.test(msg.trim()) || /pendingoperation\.abort|operation was aborted/i.test(msg)) {
    return true;
  }
  return false;
}

/**
 * Nachgebauter Request nach Pool-Reset (gleiche Inputs/Outputs, Typ-Inferenz für Inputs).
 */
function cloneRequestFromFailed(poolInstance, failedReq) {
  const reqFactory = poolInstance.__hmOrigRequest || poolInstance.request.bind(poolInstance);
  const r2 = reqFactory();
  const params = failedReq.parameters || {};
  for (const name of Object.keys(params)) {
    const p = params[name];
    if (!p) continue;
    if (p.io === 1) {
      r2.input(p.name, p.value);
    } else if (p.io === 2) {
      r2.output(p.name, p.type, p.value);
    }
  }
  return r2;
}

/** Health-Check ohne gepatchtes `query` — vermeidet Deadlock/Nested-`replacePool` und Tarn-„aborted“ bei parallelem Pool-Reset. */
function pulsePoolAlive(poolInstance) {
  if (!poolInstance) return Promise.resolve();
  const reqFactory = poolInstance.__hmOrigRequest || poolInstance.request.bind(poolInstance);
  const req = reqFactory();
  return req.query('SELECT 1');
}

function installPoolResilience(poolInstance) {
  if (!poolInstance || poolInstance[RETRY_INSTALLED]) return;
  poolInstance[RETRY_INSTALLED] = true;

  const origRequest = poolInstance.request.bind(poolInstance);
  /** Retry nutzt diese Factory, damit der Folge-`query` nicht erneut reset/retry auslöst. */
  poolInstance.__hmOrigRequest = origRequest;
  poolInstance.request = function hmPatchedRequest() {
    const req = origRequest();
    const origQuery = req.query.bind(req);
    req.query = function hmPatchedQuery(...args) {
      const last = args[args.length - 1];
      if (typeof last === 'function') {
        return origQuery(...args);
      }
      return (async () => {
        try {
          return await origQuery(...args);
        } catch (err) {
          if (!isTransientSqlError(err)) throw err;
          console.warn('[db] Transient SQL error, resetting pool and retrying once:', err.code || err.message);
          await replacePool();
          const r2 = cloneRequestFromFailed(pool, req);
          return await r2.query(...args);
        }
      })();
    };
    return req;
  };
}

// Validate configuration
if (!config.user || !config.password || !config.server || !config.database) {
  console.error('Missing database configuration. Please check your environment variables:');
  console.error('MSSQL_USER:', config.user ? 'ok' : 'missing');
  console.error('MSSQL_PASSWORD:', config.password ? 'ok' : 'missing');
  console.error('MSSQL_SERVER:', config.server ? 'ok' : 'missing');
  console.error('MSSQL_DATABASE:', config.database ? 'ok' : 'missing');
}

let pool = null;
let connectionCheckInterval = null;

async function destroyPoolUnlocked() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
    connectionCheckInterval = null;
  }
  if (pool) {
    try {
      await pool.close();
    } catch (_) {
      /* ignore */
    }
    pool = null;
  }
}

async function ensurePool() {
  return runPoolExclusive(async () => {
    if (pool) return pool;
    console.log('Creating new database connection pool...');
    console.log('Connecting to:', config.server, 'Database:', config.database);
    const p = await sql.connect(config);
    pool = p;
    installPoolResilience(p);
    startConnectionMonitoring();
    console.log('Database connection pool created successfully');
    return pool;
  });
}

async function replacePool() {
  return runPoolExclusive(async () => {
    await destroyPoolUnlocked();
    const p = await sql.connect(config);
    pool = p;
    installPoolResilience(p);
    startConnectionMonitoring();
    console.log('Database connection pool recreated');
    return pool;
  });
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
      } catch (_error) {
        // Pool wird bei nächstem getConnection bzw. Query-Retry neu erstellt
      }
    }
  }, 30000);
}

export async function getConnection() {
  try {
    if (!config.user || !config.password || !config.server || !config.database) {
      throw new Error('Database configuration is incomplete. Please check your environment variables.');
    }

    if (!pool) {
      await ensurePool();
    }

    try {
      await pulsePoolAlive(pool);
    } catch (error) {
      if (!isTransientSqlError(error)) {
        await runPoolExclusive(async () => {
          await destroyPoolUnlocked();
        });
        throw error;
      }
      await replacePool();
      await pulsePoolAlive(pool);
    }

    return pool;
  } catch (error) {
    console.error('Database connection error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      server: config.server,
      database: config.database,
    });

    if (isTransientSqlError(error)) {
      try {
        await replacePool();
        await pulsePoolAlive(pool);
        return pool;
      } catch (e2) {
        console.error('Database reconnect retry failed:', e2);
      }
    }

    await runPoolExclusive(async () => {
      await destroyPoolUnlocked();
    });
    throw error;
  }
}

/**
 * Ganze DB-Operation bei transientem Verbindungsfehler wiederholen (z. B. mehrere Queries / Transaktionen).
 */
export async function withPoolRetry(operation, { attempts = 2 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const p = await getConnection();
      return await operation(p);
    } catch (e) {
      lastError = e;
      if (!isTransientSqlError(e) || i === attempts - 1) throw e;
      console.warn('[db] withPoolRetry: transient error, reset and retry', i + 1, '/', attempts);
      await replacePool();
    }
  }
  throw lastError;
}

export async function closeConnection() {
  await runPoolExclusive(async () => {
    await destroyPoolUnlocked();
  });
  console.log('Database connection pool closed');
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
