import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { getConnection } from "../../../../lib/db";
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const pool = await getConnection();
    
    // Hole alle Einträge aus der Inventory-Tabelle mit tbconnectionid
    const result = await pool.request().query(`
      SELECT id, deviceLabel, serialnbr, deveui, tbconnectionid, customerid
      FROM hmcdev.dbo.inventory 
      WHERE tbconnectionid IS NOT NULL
      ORDER BY id DESC
    `);
    
    console.log(`Found ${result.recordset.length} inventory records with tbconnectionid`);
    
    // Zeige auch die ersten 5 ThingsBoard Devices
    const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/customer/${session.user.customerid}/deviceInfos?pageSize=5&page=0`, {
      headers: {
        'accept': 'application/json',
        'X-Authorization': `Bearer ${session.tbToken}`
      }
    });
    
    const tbData = await tbResponse.json();
    
    console.log(`Found ${tbData.data?.length || 0} ThingsBoard devices`);
    
    // Vergleiche die IDs
    const inventoryIds = result.recordset.map(r => r.tbconnectionid);
    const tbIds = tbData.data?.map(d => d.id.id) || [];
    
    const matchingIds = inventoryIds.filter(id => tbIds.includes(id));
    const missingInInventory = tbIds.filter(id => !inventoryIds.includes(id));
    const missingInTB = inventoryIds.filter(id => !tbIds.includes(id));
    
    return res.json({
      inventory: result.recordset,
      thingsboardDevices: tbData.data?.slice(0, 5) || [],
      analysis: {
        totalInventory: result.recordset.length,
        totalTBDevices: tbData.data?.length || 0,
        matchingIds: matchingIds.length,
        missingInInventory: missingInInventory.length,
        missingInTB: missingInTB.length,
        sampleMissingInInventory: missingInInventory.slice(0, 5),
        sampleMissingInTB: missingInTB.slice(0, 5)
      },
      message: 'Test data loaded successfully'
    });
    
  } catch (error) {
    console.error('Error in test-inventory:', error);
    
    // Versuche es nochmal bei Verbindungsfehlern
    if (error.code === 'ECONNCLOSED' || error.code === 'ECONNRESET') {
      try {
        console.log('Retrying database connection...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const pool = await getConnection();
        
        const result = await pool.request().query(`
          SELECT id, deviceLabel, serialnbr, deveui, tbconnectionid, customerid
          FROM hmcdev.dbo.inventory 
          WHERE tbconnectionid IS NOT NULL
          ORDER BY id DESC
        `);
        
        return res.json({
          inventory: result.recordset,
          thingsboardDevices: [],
          analysis: {
            totalInventory: result.recordset.length,
            totalTBDevices: 0,
            matchingIds: 0,
            missingInInventory: 0,
            missingInTB: 0,
            sampleMissingInInventory: [],
            sampleMissingInTB: []
          },
          message: 'Test data loaded successfully (ThingsBoard data unavailable)',
          error: 'ThingsBoard connection failed, but inventory data retrieved'
        });
      } catch (retryError) {
        console.error('Retry failed:', retryError);
      }
    }
    
    return res.status(500).json({ 
      message: 'Error loading test data',
      error: error.message,
      code: error.code
    });
  }
}
