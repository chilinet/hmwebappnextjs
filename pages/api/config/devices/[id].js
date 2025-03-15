import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import sql from "mssql";
import { getConnection } from "../../../../lib/db";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { id } = req.query;

  if (req.method === 'PATCH') {
    const { label, name, type } = req.body;

    if (typeof label !== 'string') {
      return res.status(400).json({ message: 'Label must be a string' });
    }

    if (typeof name !== 'string') {
      return res.status(400).json({ message: 'Name must be a string' });
    }

    if (typeof type !== 'string') {
      return res.status(400).json({ message: 'Type must be a string' });
    }

    //console.log(session);

    try {
      // Load user data from database to get tenantId and customerId
      const pool = await getConnection();
      const userResult = await pool.request()
        .input('userId', sql.Int, session.user.userid)
        .query('SELECT tenantid, customerid FROM hm_users WHERE userid = @userId');

      if (!userResult.recordset || userResult.recordset.length === 0) {
        throw new Error('User data not found');
      }
      
      //console.log(userResult.recordset[0]);

      // Prepare device data with correct structure
      const deviceData = {
        id: { id: id, entityType: 'DEVICE' },
        tenantId: { id: userResult.recordset[0].tenantid, entityType: 'TENANT' },
        customerId: { id: userResult.recordset[0].customerid, entityType: 'CUSTOMER' },
        name: name,
        label: label,
        type: type
      };
      //console.log('++++++++++++++++++++++++++++++++++++');
      //console.log(deviceData);
      //console.log('++++++++++++++++++++++++++++++++++++');

      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/device`,
        {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json', 
            'X-Authorization': `Bearer ${session.tbToken}`
          },
          body: JSON.stringify(deviceData)
        }
      );
      if (!response.ok) {
        const errorText = await response.text();
        console.error('ThingsBoard API error:', errorText);
        throw new Error('Failed to update device label');
      }

      return res.status(200).json({ 
        success: true,
        message: 'Device label updated successfully' 
      });

    } catch (error) {
      console.error('Error updating device label:', error);
      return res.status(500).json({ 
        message: 'Error updating device label',
        error: error.message 
      });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
} 