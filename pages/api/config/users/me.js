import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import sql from 'mssql';
import { getConnection } from '../../../../lib/db';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 30000, // 30 Sekunden
    requestTimeout: 30000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  }
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 Sekunde

async function connectWithRetry(retries = MAX_RETRIES) {
  try {
    return await sql.connect(config);
  } catch (err) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return connectWithRetry(retries - 1);
    }
    throw err;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  
  console.log('************************************************')
  console.log('session:', session)
  console.log('************************************************')

  try {
    const pool = await getConnection();
    
    if (!pool) {
      throw new Error('Database connection not available');
    }
    
    const result = await pool.request()
      .input('userid', sql.Int, session.user.userid)
      .query(`
        SELECT role, customerid, tenantid
        FROM hm_users
        WHERE userid = @userid
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      role: result.recordset[0].role,
      customerid: result.recordset[0].customerid,
      tenantid: result.recordset[0].tenantid
    });

  } catch (error) {
    console.error('Database Error:', error);
    
    // Spezifische Fehlerbehandlung
    if (error.code === 'ECONNCLOSED' || error.code === 'ECONNRESET') {
      return res.status(503).json({ 
        message: 'Database connection lost, please try again',
        error: 'Connection closed'
      });
    }
    
    return res.status(500).json({ 
      message: 'Database error',
      error: error.message 
    });
  }
} 