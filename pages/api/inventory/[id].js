import sql from 'mssql';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { getConnection } from '../../../lib/db';

export default async function handler(req, res) {
  // Session-Überprüfung
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Nicht authentifiziert" });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('id', sql.BigInt, id)
      .query(`
        SELECT i.id, i.devicenbr, i.devicename, i.deveui, i.joineui, i.serialnbr, i.appkey, 
               i.loraversion, i.regionalversion, i.customerid, i.tbconnectionid, i.nwconnectionid, 
               i.brand_id, b.name as brand_name, i.model_id, i.hardwareversion, i.firmwareversion, 
               i.owner_id, i.group_id, i.distributor_id, i.status_id, i.invoicenbr, i.ordernbr, 
               i.orderdate, i.installed_at, i.tbconnected_at, i.nwconnected_at, i.created_at, 
               i.updated_at, i.status, i.contractId, i.deviceLabel, i.deviceProfileId, i.offerName
        FROM hmcdev.dbo.inventory i
        LEFT JOIN hmcdev.dbo.brand b ON i.brand_id = b.id
        WHERE i.id = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('GET Single Error:', error);
    res.status(500).json({ error: error.message });
  }
} 