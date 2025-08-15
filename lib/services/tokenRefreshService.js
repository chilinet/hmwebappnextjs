const sql = require('mssql');

/**
 * Get ThingsBoard token for a specific customer using their individual URL
 * @param {string} username - ThingsBoard username
 * @param {string} password - ThingsBoard password
 * @param {string} tbUrl - ThingsBoard URL for this customer
 * @returns {Promise<string>} ThingsBoard token
 */
async function getThingsboardToken(username, password, tbUrl) {
  try {
    const response = await fetch(`${tbUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get Thingsboard token: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error getting Thingsboard token:', error);
    throw error;
  }
}

/**
 * Check and refresh tokens for all customers that need it
 * @returns {Promise<{success: boolean, updated: number, errors: number, details: Array}>}
 */
async function updateTokens() {
  const config = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };

  let pool;
  let updatedCount = 0;
  let errorCount = 0;
  const details = [];

  try {
    pool = await sql.connect(config);

    // Hole alle Einträge, die einen Token-Update benötigen
    // Erweitert um tb_url und prüft auf ablaufende Tokens (5 Minuten vor Ablauf)
    const result = await pool.request()
      .query(`
        SELECT customer_id, tb_username, tb_password, tb_url, tbtoken, tbtokenexpiry
        FROM customer_settings 
        WHERE (tb_username IS NOT NULL and tb_username <> '' and tb_username <> ' ') 
        AND (tb_password IS NOT NULL and tb_password <> '' and tb_password <> ' ')
        AND (tb_url IS NOT NULL and tb_url <> '' and tb_url <> ' ')
        AND (
          tbtoken IS NULL 
          OR tbtokenexpiry IS NULL 
          OR tbtokenexpiry < DATEADD(MINUTE, 5, GETDATE())
        )
      `);

    console.log(`Found ${result.recordset.length} customers that need token refresh`);

    const updates = result.recordset.map(async (record) => {
      try {
        // Verwende die individuelle ThingsBoard URL des Kunden
        const tbUrl = record.tb_url.endsWith('/') ? record.tb_url.slice(0, -1) : record.tb_url;
        
        // Hole neuen Token von Thingsboard
        const token = await getThingsboardToken(record.tb_username, record.tb_password, tbUrl);
        
        // Berechne Ablaufzeit (current time + 15 minutes)
        const expiryDate = new Date();
        expiryDate.setMinutes(expiryDate.getMinutes() + 15);

        // Update Database
        await pool.request()
          .input('customer_id', sql.UniqueIdentifier, record.customer_id)
          .input('token', sql.VarChar, token)
          .input('expiry', sql.DateTime, expiryDate)
          .query(`
            UPDATE customer_settings 
            SET tbtoken = @token,
                tbtokenexpiry = @expiry,
                updatedttm = GETDATE()
            WHERE customer_id = @customer_id
          `);

        updatedCount++;
        details.push({
          customer_id: record.customer_id,
          status: 'success',
          message: 'Token successfully updated',
          new_expiry: expiryDate
        });

        console.log(`✅ Successfully updated token for customer ${record.customer_id}`);
      } catch (error) {
        errorCount++;
        details.push({
          customer_id: record.customer_id,
          status: 'error',
          message: error.message,
          tb_url: record.tb_url
        });

        console.error(`❌ Failed to update token for customer ${record.customer_id}:`, error.message);
      }
    });

    await Promise.all(updates);

    return {
      success: true,
      updated: updatedCount,
      errors: errorCount,
      total: result.recordset.length,
      details: details
    };

  } catch (error) {
    console.error('Token refresh service error:', error);
    return {
      success: false,
      error: error.message,
      updated: updatedCount,
      errors: errorCount,
      details: details
    };
  } finally {
    if (pool && pool.connected) {
      try {
        await pool.close();
      } catch (closeError) {
        console.log('Pool close error (ignored):', closeError.message);
      }
    }
  }
}

/**
 * Check token status for all customers (without updating)
 * @returns {Promise<{success: boolean, customers: Array}>}
 */
async function checkTokenStatus() {
  const config = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };

  let pool;
  try {
    pool = await sql.connect(config);

    const result = await pool.request()
      .query(`
        SELECT 
          customer_id, 
          tb_username, 
          tb_url, 
          tbtoken, 
          tbtokenexpiry,
          CASE 
            WHEN tbtoken IS NULL OR tbtokenexpiry IS NULL THEN 'missing'
            WHEN tbtokenexpiry < GETDATE() THEN 'expired'
            WHEN tbtokenexpiry < DATEADD(MINUTE, 5, GETDATE()) THEN 'expiring_soon'
            ELSE 'valid'
          END as token_status,
          DATEDIFF(MINUTE, GETDATE(), tbtokenexpiry) as minutes_until_expiry
        FROM customer_settings 
        WHERE (tb_username IS NOT NULL and tb_username <> '' and tb_username <> ' ')
      `);
    
    //console.log('*************************************************');
    //console.log('result: ', result);
    //console.log('*************************************************'); 
    
    return {
      success: true,
      customers: result.recordset,
      summary: {
        total: result.recordset.length,
        valid: result.recordset.filter(c => c.token_status === 'valid').length,
        expiring_soon: result.recordset.filter(c => c.token_status === 'expiring_soon').length,
        expired: result.recordset.filter(c => c.token_status === 'expired').length,
        missing: result.recordset.filter(c => c.token_status === 'missing').length
      }
    };

  } catch (error) {
    console.error('Token status check error:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (pool && pool.connected) {
      try {
        await pool.close();
      } catch (closeError) {
        console.log('Pool close error (ignored):', closeError.message);
      }
    }
  }
}

/**
 * Start the cron job that runs every minute
 */
function startTokenRefreshCron() {
  console.log('🔄 Starting ThingsBoard token refresh cron job (runs every minute)');
  
  // Initial run
  updateTokens().then(result => {
    console.log('Initial token refresh completed:', result);
  });

  // Set up interval for every minute
  cronInterval = setInterval(async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n⏰ [${timestamp}] Running scheduled token refresh...`);
    
    try {
      const result = await updateTokens();
      console.log(`✅ Token refresh completed: ${result.updated} updated, ${result.errors} errors`);
      
      if (result.errors > 0) {
        console.log('❌ Errors occurred during token refresh:', result.details.filter(d => d.status === 'error'));
      }
    } catch (error) {
      console.error('❌ Scheduled token refresh failed:', error);
    }
  }, 60 * 1000); // 60 seconds = 1 minute
}

/**
 * Stop the cron job (if needed)
 */
let cronInterval = null;

function stopTokenRefreshCron() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('🛑 ThingsBoard token refresh cron job stopped');
  }
}

module.exports = { 
  updateTokens, 
  checkTokenStatus, 
  startTokenRefreshCron, 
  stopTokenRefreshCron,
  getThingsboardToken 
}; 