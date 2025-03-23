import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
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
      // Weise das Asset dem Customer zu
      /* const assignResponse = await fetch(`${TB_API_URL}/api/customer/${tbCustomerId}/asset/${asset.id.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      }); */
 
      //if (!assignResponse.ok) {
      //  throw new Error('Failed to assign asset to customer');
      //}

      //const data = await assignResponse.json();
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