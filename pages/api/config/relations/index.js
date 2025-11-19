import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';
import { invalidateCache, invalidateUnassignedCache } from '../../../../lib/utils/deviceCache';
import { removeUnassignedDeviceFromDb, invalidateUnassignedDevicesCache } from '../../../../lib/utils/unassignedDevicesDb';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.method === 'POST') {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const { fromId, fromType, toId, toType, relationType } = req.body;

    if (!fromId || !fromType || !toId || !toType || !relationType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // Erstelle die Relation in ThingsBoard
      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/relation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          },
          body: JSON.stringify({
            from: {
              entityType: fromType,
              id: fromId
            },
            to: {
              entityType: toType,
              id: toId
            },
            type: relationType,
            typeGroup: "COMMON"
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ThingsBoard API error:', errorText);
        throw new Error('Failed to create relation in ThingsBoard');
      }

      // Invalidiere den Cache wenn eine Device-Relation erstellt wurde
      if (toType === 'DEVICE') {
        try {
          const pool = await getConnection();
          const userResult = await pool.request()
            .input('userid', sql.Int, session.user.userid)
            .query(`
              SELECT customerid
              FROM hm_users
              WHERE userid = @userid
            `);
          
          if (userResult.recordset.length > 0) {
            const customerId = userResult.recordset[0].customerid;
            // Invalidiere In-Memory-Cache
            invalidateCache(customerId);
            invalidateUnassignedCache(customerId);
            // Entferne Device aus Datenbank-Cache (wurde zugeordnet)
            await removeUnassignedDeviceFromDb(toId, customerId);
            console.log(`Cache invalidated for customer ${customerId} after device ${toId} assignment`);
          }
        } catch (error) {
          console.warn('Failed to invalidate cache after relation creation:', error);
          // Nicht kritisch, Cache wird automatisch nach TTL ablaufen
        }
      }

      return res.status(200).json({ 
        success: true,
        message: 'Relation created successfully' 
      });

    } catch (error) {
      console.error('Error creating relation:', error);
      return res.status(500).json({ 
        message: 'Error creating relation',
        error: error.message 
      });
    }
  } 
  else if (req.method === 'DELETE') {
    const { fromId, fromType, toId, toType, relationType } = req.body;

    if (!fromId || !fromType || !toId || !toType || !relationType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // Lösche die Relation in ThingsBoard
      const response = await fetch(
        `${process.env.THINGSBOARD_URL}/api/relation?fromId=${fromId}&fromType=${fromType}&toId=${toId}&toType=${toType}&relationType=${relationType}`,
        {
          method: 'DELETE',
          headers: {
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ThingsBoard API error:', errorText);
        throw new Error('Failed to delete relation in ThingsBoard');
      }

      // Invalidiere den Cache wenn eine Device-Relation gelöscht wurde (Device wurde wieder nicht zugeordnet)
      if (toType === 'DEVICE') {
        try {
          const pool = await getConnection();
          const userResult = await pool.request()
            .input('userid', sql.Int, session.user.userid)
            .query(`
              SELECT customerid
              FROM hm_users
              WHERE userid = @userid
            `);
          
          if (userResult.recordset.length > 0) {
            const customerId = userResult.recordset[0].customerid;
            // Invalidiere In-Memory-Cache
            invalidateCache(customerId);
            invalidateUnassignedCache(customerId);
            // Invalidiere Datenbank-Cache (Device könnte wieder nicht zugeordnet sein)
            await invalidateUnassignedDevicesCache(customerId);
            console.log(`Cache invalidated for customer ${customerId} after device ${toId} unassignment`);
          }
        } catch (error) {
          console.warn('Failed to invalidate cache after relation deletion:', error);
          // Nicht kritisch, Cache wird automatisch nach TTL ablaufen
        }
      }

      return res.status(200).json({ 
        success: true,
        message: 'Relation deleted successfully' 
      });

    } catch (error) {
      console.error('Error deleting relation:', error);
      return res.status(500).json({ 
        message: 'Error deleting relation',
        error: error.message 
      });
    }
  }
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
} 