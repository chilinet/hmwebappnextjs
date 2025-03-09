import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  let pool;
  try {
    pool = await sql.connect(config);

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
    return res.status(500).json({ 
      message: 'Database error',
      error: error.message 
    });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
} 