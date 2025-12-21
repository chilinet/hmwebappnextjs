import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import sql from 'mssql';

// Determine if this is a local connection
const isLocalConnection = process.env.MSSQL_SERVER === '127.0.0.1' || 
                          process.env.MSSQL_SERVER === 'localhost' ||
                          process.env.MSSQL_SERVER?.includes('localhost');

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: !isLocalConnection,
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
            SELECT layout_styles
            FROM customer_settings
            WHERE customer_id = @customerId
          `);

        const layoutStyles = result.recordset[0]?.layout_styles;
        
        return res.json({
          success: true,
          data: layoutStyles ? JSON.parse(layoutStyles) : null
        });

      case 'PUT':
        const { styles } = req.body;

        if (!styles || typeof styles !== 'object') {
          return res.status(400).json({ 
            success: false,
            message: 'Ungültige Styles-Daten' 
          });
        }

        const stylesJson = JSON.stringify(styles);

        await pool.request()
          .input('customerId', sql.UniqueIdentifier, id)
          .input('layoutStyles', sql.NVarChar(sql.MAX), stylesJson)
          .query(`
            MERGE customer_settings AS target
            USING (SELECT @customerId as customer_id) AS source
            ON target.customer_id = source.customer_id
            WHEN MATCHED THEN
              UPDATE SET layout_styles = @layoutStyles
            WHEN NOT MATCHED THEN
              INSERT (customer_id, layout_styles)
              VALUES (@customerId, @layoutStyles);
          `);

        return res.json({
          success: true,
          message: 'Layout-Styles gespeichert'
        });

      default:
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).json({ message: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ 
      success: false,
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

