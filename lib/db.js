import sql from 'mssql';
import { getMssqlPoolConfig } from './mssqlConfig';
import { isAppDebugEnabled } from './appDebug';

export { getMssqlConfig, getMssqlPoolConfig } from './mssqlConfig';

const config = getMssqlPoolConfig();

function dbDebugLog(...args) {
  if (isAppDebugEnabled()) console.log(...args);
}

function dbDebugWarn(...args) {
  if (isAppDebugEnabled()) console.warn(...args);
}

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
  if (code === 'ENOPOOL') {
    return true;
  }
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

/** Tagged template `` .query`SELECT ${x}` `` — sonst EDUPEPARAM bei Retry mit cloneRequestFromFailed */
function isTaggedTemplateQueryArgs(args) {
  const first = args[0];
  return first != null && typeof first === 'object' && Object.prototype.hasOwnProperty.call(first, 'raw');
}

/** Health-Check ohne gepatchtes `query` — vermeidet Deadlock/Nested-Pool-Reset und Tarn-„aborted“ bei parallelem Recreate. */
function pulsePoolAlive(poolInstance) {
  if (!poolInstance) {
    const err = new Error('Database pool is not available');
    err.code = 'ENOPOOL';
    return Promise.reject(err);
  }
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
        const poolAtQueryStart = pool;
        try {
          return await origQuery(...args);
        } catch (err) {
          if (!isTransientSqlError(err)) throw err;
          dbDebugWarn('[db] Transient SQL error, resetting pool and retrying once:', err.code || err.message);
          await recreatePoolIfStillMatches(poolAtQueryStart);
          const reqFactory = pool.__hmOrigRequest || pool.request.bind(pool);
          const r2 = isTaggedTemplateQueryArgs(args) ? reqFactory() : cloneRequestFromFailed(pool, req);
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
  console.error('MSSQL_PORT:', config.port != null ? String(config.port) : '(default / unset)');
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
    dbDebugLog('Creating new database connection pool...');
    dbDebugLog('Connecting to:', config.server, 'Database:', config.database);
    const p = await sql.connect(config);
    pool = p;
    installPoolResilience(p);
    startConnectionMonitoring();
    dbDebugLog('Database connection pool created successfully');
    return pool;
  });
}

/**
 * Pool nur neu aufbauen, wenn noch dieselbe Instanz wie bei dem Fehler aktiv ist.
 * Verhindert, dass parallele getConnection-/Retry-Pfade einen frisch erstellten Pool wieder schließen.
 */
async function recreatePoolIfStillMatches(failedPoolRef) {
  return runPoolExclusive(async () => {
    if (pool != null && pool !== failedPoolRef) {
      dbDebugLog('[db] Skipping pool recreate; pool already replaced');
      return pool;
    }
    await destroyPoolUnlocked();
    const p = await sql.connect(config);
    pool = p;
    installPoolResilience(p);
    startConnectionMonitoring();
    dbDebugLog('Database connection pool recreated');
    return pool;
  });
}

// Start connection monitoring
function startConnectionMonitoring() {
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }

  connectionCheckInterval = setInterval(async () => {
    const p = pool;
    if (!p) return;
    try {
      await pulsePoolAlive(p);
    } catch (_error) {
      // Kein replace hier — vermeidet Reset-Stürme; nächster getConnection baut bei Bedarf neu auf
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

    const poolForPing = pool;
    try {
      await pulsePoolAlive(poolForPing);
    } catch (error) {
      if (!isTransientSqlError(error)) {
        await runPoolExclusive(async () => {
          await destroyPoolUnlocked();
        });
        throw error;
      }
      await recreatePoolIfStillMatches(poolForPing);
      await pulsePoolAlive(pool);
    }

    if (!pool) {
      throw new Error('Database pool was lost after connect; retry the request.');
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
        const poolBeforeRetry = pool;
        await recreatePoolIfStillMatches(poolBeforeRetry);
        await pulsePoolAlive(pool);
        if (!pool) {
          throw new Error('Database pool missing after reconnect');
        }
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
    let poolUsed;
    try {
      poolUsed = await getConnection();
      return await operation(poolUsed);
    } catch (e) {
      lastError = e;
      if (!isTransientSqlError(e) || i === attempts - 1) throw e;
      dbDebugWarn('[db] withPoolRetry: transient error, reset and retry', i + 1, '/', attempts);
      await recreatePoolIfStillMatches(poolUsed ?? pool);
    }
  }
  throw lastError;
}

export async function closeConnection() {
  await runPoolExclusive(async () => {
    await destroyPoolUnlocked();
  });
  dbDebugLog('Database connection pool closed');
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
