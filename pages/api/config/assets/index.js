import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
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
    encrypt: !isLocalConnection, // Disable encryption for local connections
    trustServerCertificate: true
  }
};

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    let pool;
    try {
      // Hole die TB Customer ID aus der Datenbank
        pool = await sql.connect(config);
        //console.log('session:', session);
        //userid = session.user.userid;
        //console.log('Userid', userid);
      const result = await pool.request()
        .input('userid', sql.Int, session.user.userid)
        .query(`
          SELECT customerid
          FROM hm_users
          WHERE userid = @userid
        `);

      if (!result.recordset[0]?.customerid) {
        throw new Error('Customer ID not found');
      }

      const tbCustomerId = result.recordset[0].customerid;
      const TB_API_URL = process.env.THINGSBOARD_URL;
      
      // Erstelle das Asset
      const assetResponse = await fetch(`${TB_API_URL}/api/asset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        },
        body: JSON.stringify({
          ...req.body,
          customerId: {
            id: tbCustomerId,
            entityType: "CUSTOMER"
          }
        })
      });

      if (!assetResponse.ok) {
        const errorData = await assetResponse.json();
        throw new Error(`Failed to create asset: ${assetResponse.status} - ${errorData.message || 'Unknown error'}`);
      }

      const asset = await assetResponse.json();
      const data = asset;

      // Setze den operationalMode als Attribut, falls angegeben
      if (req.body.operationalMode !== undefined) {
        try {
          const attributesBody = {
            operationalMode: req.body.operationalMode
          };
          
          console.log('Setting operationalMode attribute for new asset:', attributesBody);
          
          const attributesResponse = await fetch(`${TB_API_URL}/api/plugins/telemetry/ASSET/${asset.id.id}/attributes/SERVER_SCOPE`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${session.tbToken}`
            },
            body: JSON.stringify(attributesBody)
          });

          if (!attributesResponse.ok) {
            console.error('Error setting operationalMode attribute:', attributesResponse.status);
            // Nicht kritisch - das Asset wurde bereits erstellt
          } else {
            console.log('operationalMode attribute set successfully for new asset');
          }
        } catch (error) {
          console.error('Error setting operationalMode attribute for new asset:', error);
          // Nicht kritisch - das Asset wurde bereits erstellt
        }
      }

      return res.status(200).json(data);

    } catch (error) {
      console.error('Error creating asset:', error);
      return res.status(500).json({ error: 'Failed to create asset' });
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

  return res.status(405).json({ error: 'Method not allowed' });
}