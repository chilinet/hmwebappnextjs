const sql = require('mssql');

async function getThingsboardToken(username, password) {
  try {
    const response = await fetch(`${process.env.THINGSBOARD_URL}/api/auth/login`, {
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
      throw new Error('Failed to get Thingsboard token');
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error getting Thingsboard token:', error);
    throw error;
  }
}

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

  // Debug-Ausgabe
  console.log('Database config:', {
    user: process.env.MSSQL_USER,
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE
  });

  let pool;
  try {
    pool = await sql.connect(config);

    // Hole alle Einträge, die einen Token-Update benötigen
    const result = await pool.request()
      .query(`
        SELECT customer_id, tb_username, tb_password 
        FROM customer_settings 
        WHERE (tb_username IS NOT NULL and tb_username <> '' and tb_username <> ' ') 
        AND (tb_password IS NOT NULL and tb_password <> '' and tb_password <> ' ')
        AND (tbtoken IS NULL OR tbtokenexpiry IS NULL OR tbtokenexpiry < GETDATE())
      `);

    const updates = result.recordset.map(async (record) => {
      try {
        // Hole neuen Token von Thingsboard
        const token = await getThingsboardToken(record.tb_username, record.tb_password);
        
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
                tbtokenexpiry = @expiry
            WHERE customer_id = @customer_id
          `);

        console.log(`Successfully updated token for customer ${record.customer_id}`);
      } catch (error) {
        console.error(`Failed to update token for customer ${record.customer_id}:`, error);
      }
    });

    await Promise.all(updates);
  } catch (error) {
    console.error('Token refresh service error:', error);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

module.exports = { updateTokens }; 