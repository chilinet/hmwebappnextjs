import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
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
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  const { id } = req.query;

  let pool;
  try {
    pool = await sql.connect(config);

    switch (req.method) {
      case 'GET':
        const result = await pool.request()
          .input('customerId', sql.UniqueIdentifier, id)
          .query(`
            SELECT tb_username, tb_password
            FROM customer_settings
            WHERE customer_id = @customerId
          `);

        return res.json({
          success: true,
          data: result.recordset[0] || {}
        });

      case 'PUT':
        const { tb_username, tb_password } = req.body;

        await pool.request()
          .input('customerId', sql.UniqueIdentifier, id)
          .input('username', sql.NVarChar, tb_username)
          .input('password', sql.NVarChar, tb_password)
          .query(`
            MERGE customer_settings AS target
            USING (SELECT @customerId as customer_id) AS source
            ON target.customer_id = source.customer_id
            WHEN MATCHED THEN
              UPDATE SET 
                tb_username = @username,
                tb_password = @password
            WHEN NOT MATCHED THEN
              INSERT (customer_id, tb_username, tb_password)
              VALUES (@customerId, @username, @password);
          `);

        return res.json({
          success: true,
          message: 'Einstellungen gespeichert'
        });

      default:
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ 
      message: 'Datenbankfehler',
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