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
            SELECT prefix, lastnodeid, tb_username, tb_password
            FROM customer_settings
            WHERE customer_id = @customerId
          `);

        return res.json({
          success: true,
          data: result.recordset[0] || { prefix: '', lastnodeid: 0, tb_username: '', tb_password: '' }
        });

      case 'PUT':
        const { lastnodeid, tb_username, tb_password, prefix } = req.body;

        // Check if only lastnodeid is provided
        if (Object.keys(req.body).length === 1 && lastnodeid !== undefined) {
          await pool.request()
            .input('customerId', sql.UniqueIdentifier, id)
            .input('lastnodeid', sql.Int, lastnodeid)
            .query(`
              MERGE customer_settings AS target
              USING (SELECT @customerId as customer_id) AS source
              ON target.customer_id = source.customer_id
              WHEN MATCHED THEN
                UPDATE SET lastnodeid = @lastnodeid
              WHEN NOT MATCHED THEN
                INSERT (customer_id, lastnodeid)
                VALUES (@customerId, @lastnodeid);
            `);
        } else {
          await pool.request()
            .input('customerId', sql.UniqueIdentifier, id)
            .input('lastnodeid', sql.Int, lastnodeid)
            .input('username', sql.NVarChar, tb_username)
            .input('password', sql.NVarChar, tb_password)
            .input('prefix', sql.NVarChar, prefix)
            .query(`
              MERGE customer_settings AS target
              USING (SELECT @customerId as customer_id) AS source
              ON target.customer_id = source.customer_id
              WHEN MATCHED THEN
                UPDATE SET 
                  lastnodeid = @lastnodeid,
                  tb_username = ISNULL(@username, tb_username),
                  tb_password = ISNULL(@password, tb_password),
                  prefix = ISNULL(@prefix, prefix)
              WHEN NOT MATCHED THEN
                INSERT (customer_id, lastnodeid, tb_username, tb_password, prefix)
                VALUES (@customerId, @lastnodeid, @username, @password, @prefix);
            `);
        }
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