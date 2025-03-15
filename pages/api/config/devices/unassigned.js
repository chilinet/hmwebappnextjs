import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { getConnection } from "../../../../lib/db";
import sql from 'mssql';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Hole zuerst die customer_id des Users aus der Datenbank
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('userid', sql.Int, session.user.userid)
      .query(`
        SELECT customerid
        FROM hm_users
        WHERE userid = @userid
      `);

    if (userResult.recordset.length === 0) {
      throw new Error('User not found');
    }

    const customerId = userResult.recordset[0].customerid;

    // Hole alle Devices des Customers
    const allDevicesResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/devices?pageSize=1000&page=0`,
      {
        headers: {
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      }
    );

    if (!allDevicesResponse.ok) {
      throw new Error('Failed to fetch devices');
    }

    const allDevicesData = await allDevicesResponse.json();
    const allDevices = allDevicesData.data || [];

    // Hole die Attribute für alle Devices in einem Batch
    const devicesWithAttributes = await Promise.all(
      allDevices.map(async device => {
        try {
          const relationResponse = await fetch(
            `${process.env.THINGSBOARD_URL}/api/relations/info?toId=${device.id.id}&toType=DEVICE`,
            {
              headers: {
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            }
          );

          if (!relationResponse.ok) {
            return null;
          }

          const relations = await relationResponse.json();
          
          // Wenn keine Relations oder keine "Contains"-Relation gefunden wurde
          if (!Array.isArray(relations) || !relations.some(rel => rel.type === 'Contains')) {
            const attributesResponse = await fetch(
              `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${device.id.id}/values/attributes/SERVER_SCOPE`,
              {
                headers: {
                  'X-Authorization': `Bearer ${session.tbToken}`
                }
              }
            );

            const attributes = attributesResponse.ok ? await attributesResponse.json() : [];

            return {
              ...device,
              serverAttributes: Array.isArray(attributes) ? 
                attributes.reduce((acc, attr) => {
                  acc[attr.key] = attr.value;
                  return acc;
                }, {}) : {}
            };
          }
          return null;
        } catch (error) {
          console.error(`Error processing device ${device.id.id}:`, error);
          return null;
        }
      })
    );

    // Filtere null-Werte heraus
    const unassignedDevices = devicesWithAttributes.filter(device => device !== null);

    return res.json(unassignedDevices);

  } catch (error) {
    console.error('Error fetching unassigned devices:', error);
    return res.status(500).json({ 
      message: 'Error fetching unassigned devices',
      error: error.message 
    });
  }
} 