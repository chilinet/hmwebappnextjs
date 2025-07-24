import sql from 'mssql';
import { getConnection } from '../../../lib/db';

export default async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      try {
        const pool = await getConnection();
        const result = await pool.request()
          .query(`
            SELECT i.id, i.devicenbr, i.devicename, i.deveui, i.joineui, i.serialnbr, i.appkey, 
                   i.loraversion, i.regionalversion, i.customerid, i.tbconnectionid, i.nwconnectionid, 
                   i.brand_id, b.name as brand_name, i.model_id, i.hardwareversion, i.firmwareversion, 
                   i.owner_id, i.group_id, i.distributor_id, i.status_id, i.invoicenbr, i.ordernbr, 
                   i.orderdate, i.installed_at, i.tbconnected_at, i.nwconnected_at, i.created_at, 
                   i.updated_at, i.status, i.contractId, i.deviceLabel, i.deviceProfileId, i.offerName
            FROM hmcdev.dbo.inventory i
            LEFT JOIN hmcdev.dbo.brand b ON i.brand_id = b.id
            ORDER BY i.id DESC
          `);
        
        res.status(200).json(result.recordset);
      } catch (error) {
        console.error('GET Error:', error);
        res.status(500).json({ error: error.message });
      }
      break;

    case 'POST':
      try {
        const data = req.body;
        const pool = await getConnection();
        const now = new Date().toISOString();
        
        const result = await pool.request()
          .input('devicenbr', sql.VarChar(30), data.devicenbr)
          .input('devicename', sql.VarChar(30), data.devicename)
          .input('deveui', sql.VarChar(30), data.deveui)
          .input('joineui', sql.VarChar(30), data.joineui)
          .input('serialnbr', sql.VarChar(100), data.serialnbr)
          .input('appkey', sql.VarChar(50), data.appkey)
          .input('loraversion', sql.VarChar(10), data.loraversion)
          .input('regionalversion', sql.VarChar(10), data.regionalversion)
          .input('customerid', sql.VarChar(100), data.customerid)
          .input('tbconnectionid', sql.VarChar(100), data.tbconnectionid)
          .input('nwconnectionid', sql.VarChar(100), data.nwconnectionid)
          .input('brand_id', sql.Int, data.brand_id)
          .input('model_id', sql.Int, data.model_id)
          .input('hardwareversion', sql.VarChar(50), data.hardwareversion)
          .input('firmwareversion', sql.VarChar(50), data.firmwareversion)
          .input('owner_id', sql.Int, data.owner_id)
          .input('group_id', sql.Int, data.group_id)
          .input('distributor_id', sql.Int, data.distributor_id)
          .input('status_id', sql.Int, data.status_id)
          .input('invoicenbr', sql.VarChar(50), data.invoicenbr)
          .input('ordernbr', sql.VarChar(50), data.ordernbr)
          .input('orderdate', sql.Date, data.orderdate)
          .input('installed_at', sql.DateTime, data.installed_at)
          .input('tbconnected_at', sql.DateTime, data.tbconnected_at)
          .input('nwconnected_at', sql.DateTime, data.nwconnected_at)
          .input('status', sql.VarChar(50), data.status)
          .input('contractId', sql.VarChar(100), data.contractId)
          .input('deviceLabel', sql.VarChar(100), data.deviceLabel)
          .input('deviceProfileId', sql.VarChar(100), data.deviceProfileId)
          .input('offerName', sql.VarChar(100), data.offerName)
          .input('created_at', sql.DateTime, now)
          .input('updated_at', sql.DateTime, now)
          .query(`
            INSERT INTO hmcdev.dbo.inventory (
              devicenbr, devicename, deveui, joineui, serialnbr, appkey,
              loraversion, regionalversion, customerid, tbconnectionid, nwconnectionid,
              brand_id, model_id, hardwareversion, firmwareversion, owner_id, group_id,
              distributor_id, status_id, invoicenbr, ordernbr, orderdate, installed_at,
              tbconnected_at, nwconnected_at, status, contractId, deviceLabel, deviceProfileId,
              offerName, created_at, updated_at
            )
            VALUES (
              @devicenbr, @devicename, @deveui, @joineui, @serialnbr, @appkey,
              @loraversion, @regionalversion, @customerid, @tbconnectionid, @nwconnectionid,
              @brand_id, @model_id, @hardwareversion, @firmwareversion, @owner_id, @group_id,
              @distributor_id, @status_id, @invoicenbr, @ordernbr, @orderdate, @installed_at,
              @tbconnected_at, @nwconnected_at, @status, @contractId, @deviceLabel, @deviceProfileId,
              @offerName, @created_at, @updated_at
            )
          `);
        
        res.status(201).json({ message: 'Device created successfully' });
      } catch (error) {
        console.error('POST Error:', error);
        res.status(500).json({ error: error.message });
      }
      break;

    case 'PUT':
      try {
        const data = req.body;
        const pool = await getConnection();
        const now = new Date().toISOString();
        
        const result = await pool.request()
          .input('id', sql.BigInt, data.id)
          .input('devicenbr', sql.VarChar(30), data.devicenbr)
          .input('devicename', sql.VarChar(30), data.devicename)
          .input('deveui', sql.VarChar(30), data.deveui)
          .input('joineui', sql.VarChar(30), data.joineui)
          .input('serialnbr', sql.VarChar(100), data.serialnbr)
          .input('appkey', sql.VarChar(50), data.appkey)
          .input('loraversion', sql.VarChar(10), data.loraversion)
          .input('regionalversion', sql.VarChar(10), data.regionalversion)
          .input('customerid', sql.VarChar(100), data.customerid)
          .input('tbconnectionid', sql.VarChar(100), data.tbconnectionid)
          .input('nwconnectionid', sql.VarChar(100), data.nwconnectionid)
          .input('brand_id', sql.Int, data.brand_id)
          .input('model_id', sql.Int, data.model_id)
          .input('hardwareversion', sql.VarChar(50), data.hardwareversion)
          .input('firmwareversion', sql.VarChar(50), data.firmwareversion)
          .input('owner_id', sql.Int, data.owner_id)
          .input('group_id', sql.Int, data.group_id)
          .input('distributor_id', sql.Int, data.distributor_id)
          .input('status_id', sql.Int, data.status_id)
          .input('invoicenbr', sql.VarChar(50), data.invoicenbr)
          .input('ordernbr', sql.VarChar(50), data.ordernbr)
          .input('orderdate', sql.Date, data.orderdate)
          .input('installed_at', sql.DateTime, data.installed_at)
          .input('tbconnected_at', sql.DateTime, data.tbconnected_at)
          .input('nwconnected_at', sql.DateTime, data.nwconnected_at)
          .input('status', sql.VarChar(50), data.status)
          .input('contractId', sql.VarChar(100), data.contractId)
          .input('deviceLabel', sql.VarChar(100), data.deviceLabel)
          .input('deviceProfileId', sql.VarChar(100), data.deviceProfileId)
          .input('offerName', sql.VarChar(100), data.offerName)
          .input('updated_at', sql.DateTime, now)
          .query(`
            UPDATE hmcdev.dbo.inventory
            SET devicenbr = @devicenbr,
                devicename = @devicename,
                deveui = @deveui,
                joineui = @joineui,
                serialnbr = @serialnbr,
                appkey = @appkey,
                loraversion = @loraversion,
                regionalversion = @regionalversion,
                customerid = @customerid,
                tbconnectionid = @tbconnectionid,
                nwconnectionid = @nwconnectionid,
                brand_id = @brand_id,
                model_id = @model_id,
                hardwareversion = @hardwareversion,
                firmwareversion = @firmwareversion,
                owner_id = @owner_id,
                group_id = @group_id,
                distributor_id = @distributor_id,
                status_id = @status_id,
                invoicenbr = @invoicenbr,
                ordernbr = @ordernbr,
                orderdate = @orderdate,
                installed_at = @installed_at,
                tbconnected_at = @tbconnected_at,
                nwconnected_at = @nwconnected_at,
                status = @status,
                contractId = @contractId,
                deviceLabel = @deviceLabel,
                deviceProfileId = @deviceProfileId,
                offerName = @offerName,
                updated_at = @updated_at
            WHERE id = @id
          `);
        
        if (result.rowsAffected[0] === 0) {
          res.status(404).json({ error: 'Device not found' });
        } else {
          res.status(200).json({ message: 'Device updated successfully' });
        }
      } catch (error) {
        console.error('PUT Error:', error);
        res.status(500).json({ error: error.message });
      }
      break;

    case 'DELETE':
      try {
        const { id } = req.query;
        const pool = await getConnection();
        
        const result = await pool.request()
          .input('id', sql.BigInt, id)
          .query('DELETE FROM hmcdev.dbo.inventory WHERE id = @id');
        
        if (result.rowsAffected[0] === 0) {
          res.status(404).json({ error: 'Device not found' });
        } else {
          res.status(200).json({ message: 'Device deleted successfully' });
        }
      } catch (error) {
        console.error('DELETE Error:', error);
        res.status(500).json({ error: error.message });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
  }
} 