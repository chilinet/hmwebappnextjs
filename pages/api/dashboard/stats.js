//import { getServerSession } from "next-auth/next";
import { getSession } from 'next-auth/react'
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  //const { customerId } = req.query;
  console.log('session : ', session);
  // Get customerId from session
  const session = await getSession(req, res);
  if (!session?.user?.customerId) {
    return res.status(401).json({ error: 'Unauthorized - No valid session found' });
  }
  const customerId = session.user.customerId;

  try {
    // SQL Verbindung aufbauen
    await sql.connect({
      user: process.env.MSSQL_USER,
      password: process.env.MSSQL_PASSWORD,
      server: process.env.MSSQL_SERVER,
      database: process.env.MSSQL_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    });

    // Benutzeranzahl abfragen
    const usersResult = await sql.query`
      SELECT COUNT(*) as userCount 
      FROM hm_users 
      WHERE customerid = ${customerId}
    `;
    
    // Thingsboard API aufrufen für Device-Anzahl
    const tbSettings = await sql.query`
      SELECT tbtoken 
      FROM customer_settings 
      WHERE customerid = ${customerId} 
      AND tbtoken IS NOT NULL 
      AND tbtokenexpiry > GETDATE()
    `;

    let deviceCount = 0;
    if (tbSettings.recordset[0]?.tbtoken) {
      const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/tenant/devices?pageSize=1&page=0`, {
        headers: {
          'X-Authorization': `Bearer ${tbSettings.recordset[0].tbtoken}`
        }
      });

      if (tbResponse.ok) {
        const tbData = await tbResponse.json();
        deviceCount = tbData.totalElements;
      }
    }

    res.status(200).json({
      users: usersResult.recordset[0].userCount,
      devices: deviceCount
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
} 