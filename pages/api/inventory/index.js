import sql from 'mssql';
import { getConnection, getMssqlConfig } from '../../../lib/db';

/** Resolve brand name to brand_id; create brand if missing. Returns id or null if name empty. */
async function resolveBrandId(pool, db, brandName) {
  const name = brandName != null ? String(brandName).trim() : '';
  if (!name) return null;
  const existing = await pool.request()
    .input('name', sql.NVarChar(255), name)
    .query(`SELECT id FROM ${db}.dbo.brand WHERE name = @name`);
  if (existing.recordset.length > 0) return existing.recordset[0].id;
  const inserted = await pool.request()
    .input('name', sql.NVarChar(255), name)
    .query(`INSERT INTO ${db}.dbo.brand (name) OUTPUT INSERTED.id VALUES (@name)`);
  return inserted.recordset[0].id;
}

/** Resolve model name to model_id; create model if missing. Returns id or null if name empty. */
async function resolveModelId(pool, db, modelName) {
  const name = modelName != null ? String(modelName).trim() : '';
  if (!name) return null;
  const existing = await pool.request()
    .input('name', sql.NVarChar(255), name)
    .query(`SELECT id FROM ${db}.dbo.model WHERE name = @name`);
  if (existing.recordset.length > 0) return existing.recordset[0].id;
  const inserted = await pool.request()
    .input('name', sql.NVarChar(255), name)
    .query(`INSERT INTO ${db}.dbo.model (name) OUTPUT INSERTED.id VALUES (@name)`);
  return inserted.recordset[0].id;
}

/** Resolve distributor name to distributor_id; create distributor if missing. Uses "Kein Distributor" when name empty. */
async function resolveDistributorId(pool, db, distributorName) {
  const name = (distributorName != null ? String(distributorName).trim() : '') || 'Kein Distributor';
  const existing = await pool.request()
    .input('name', sql.NVarChar(255), name)
    .query(`SELECT id FROM ${db}.dbo.distributor WHERE name = @name`);
  if (existing.recordset.length > 0) return existing.recordset[0].id;
  const inserted = await pool.request()
    .input('name', sql.NVarChar(255), name)
    .query(`INSERT INTO ${db}.dbo.distributor (name) OUTPUT INSERTED.id VALUES (@name)`);
  return inserted.recordset[0].id;
}

/** Coerce value to string for VARCHAR columns; never pass undefined so DB does not get NULL where NOT NULL. */
function str(data, key) {
  if (data == null) return '';
  const v = data[key];
  if (v == null || v === '') return '';
  return String(v).trim();
}

/** Coerce value to int for INT columns; return null if not a valid number. */
function intOrNull(data, key) {
  const v = data[key];
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export default async function handler(req, res) {
  const db = getMssqlConfig().database;

  switch (req.method) {
    case 'GET':
      try {
        const pool = await getConnection();
        
        // Customer-Informationen mit JOIN abrufen
        const devicesWithCustomersQuery = `
          SELECT i.id, i.devicenbr, i.devicename, i.deveui, i.joineui, i.serialnbr, i.appkey, 
                 i.loraversion, i.regionalversion, i.customerid, i.tbconnectionid, i.nwconnectionid, 
                 i.brand_id, b.name as brand_name, i.model_id, m.name as model_name, i.hardwareversion, i.firmwareversion, 
                 i.owner_id, i.group_id, i.distributor_id, d.name as distributor_name, i.status_id, i.invoicenbr, i.ordernbr, 
                 i.orderdate, i.installed_at, i.tbconnected_at, i.nwconnected_at, i.created_at, 
                 i.updated_at, i.status, i.contractId, i.deviceLabel, i.deviceProfileId, i.offerName,
                 c.name as customer_name, c.title as customer_title,
                 CASE WHEN i.hasrelation = 1 THEN 1 ELSE 0 END as hasrelation
          FROM ${db}.dbo.inventory i
          LEFT JOIN ${db}.dbo.brand b ON i.brand_id = b.id
          LEFT JOIN ${db}.dbo.model m ON i.model_id = m.id
          LEFT JOIN ${db}.dbo.distributor d ON i.distributor_id = d.id
          LEFT JOIN customers c ON i.customerid = c.id
          ORDER BY i.id DESC
        `;
        
        const devicesWithCustomersResult = await pool.request().query(devicesWithCustomersQuery);
        
        // Daten für die Antwort vorbereiten
        const devicesWithCustomers = devicesWithCustomersResult.recordset.map(device => ({
          ...device,
          customer_name: device.customer_name || 'Keine Zuordnung',
          customer_title: device.customer_title || ''
        }));
        
        res.status(200).json(devicesWithCustomers);
      } catch (error) {
        console.error('GET Error:', error);
        
        // Provide more specific error messages
        if (error.code === 'ECONNCLOSED') {
          res.status(503).json({ 
            error: 'Database connection lost. Please try again.',
            code: 'DB_CONNECTION_LOST'
          });
        } else if (error.code === 'ECONNRESET') {
          res.status(503).json({ 
            error: 'Database connection reset. Please try again.',
            code: 'DB_CONNECTION_RESET'
          });
        } else {
          res.status(500).json({ 
            error: error.message,
            code: 'DB_ERROR'
          });
        }
      }
      break;

    case 'POST':
      try {
        const data = req.body;
        const deveui = data.deveui == null ? '' : String(data.deveui).trim();
        if (!deveui) {
          return res.status(400).json({
            error: 'DevEUI is required',
            code: 'MISSING_DEVEUI',
            message: 'Das Pflichtfeld DevEUI darf nicht leer sein.'
          });
        }
        const joineui = data.joineui == null ? '' : String(data.joineui).trim();
        const serialnbr = data.serialnbr == null ? '' : String(data.serialnbr).trim();
        if (!joineui) {
          return res.status(400).json({
            error: 'JoinEUI is required',
            code: 'MISSING_JOINEUI',
            message: 'Das Pflichtfeld JoinEUI darf nicht leer sein.'
          });
        }
        if (!serialnbr) {
          return res.status(400).json({
            error: 'Serial number is required',
            code: 'MISSING_SERIALNBR',
            message: 'Das Pflichtfeld Seriennummer darf nicht leer sein.'
          });
        }
        const pool = await getConnection();
        const now = new Date().toISOString();

        let brand_id = data.brand_id != null && data.brand_id !== '' ? Number(data.brand_id) : null;
        if (brand_id == null || isNaN(brand_id)) {
          brand_id = await resolveBrandId(pool, db, data.brand_name);
        }
        if (brand_id == null) {
          return res.status(400).json({
            error: 'Brand is required',
            code: 'MISSING_BRAND',
            message: 'Das Pflichtfeld Brand darf nicht leer sein.'
          });
        }

        let model_id = data.model_id != null && data.model_id !== '' ? Number(data.model_id) : null;
        if (model_id == null || isNaN(model_id)) {
          model_id = await resolveModelId(pool, db, data.model_name);
        }
        if (model_id == null) {
          return res.status(400).json({
            error: 'Model is required',
            code: 'MISSING_MODEL',
            message: 'Das Pflichtfeld Model darf nicht leer sein.'
          });
        }

        let distributor_id = data.distributor_id != null && data.distributor_id !== '' ? Number(data.distributor_id) : null;
        if (distributor_id == null || isNaN(distributor_id)) {
          distributor_id = await resolveDistributorId(pool, db, data.distributor_name);
        }

        const appkey = data.appkey != null && data.appkey !== '' ? String(data.appkey) : '';
        const status_id = intOrNull(data, 'status_id') ?? 0;
        const owner_id = intOrNull(data, 'owner_id');
        const group_id = intOrNull(data, 'group_id');
        const orderdateVal = data.orderdate != null && data.orderdate !== '' ? data.orderdate : null;
        const installed_atVal = data.installed_at != null && data.installed_at !== '' ? data.installed_at : null;
        const tbconnected_atVal = data.tbconnected_at != null && data.tbconnected_at !== '' ? data.tbconnected_at : null;
        const nwconnected_atVal = data.nwconnected_at != null && data.nwconnected_at !== '' ? data.nwconnected_at : null;

        const result = await pool.request()
          .input('devicenbr', sql.VarChar(30), str(data, 'devicenbr'))
          .input('devicename', sql.VarChar(30), str(data, 'devicename'))
          .input('deveui', sql.VarChar(30), deveui)
          .input('joineui', sql.VarChar(30), joineui)
          .input('serialnbr', sql.VarChar(100), serialnbr)
          .input('appkey', sql.VarChar(50), appkey)
          .input('loraversion', sql.VarChar(10), str(data, 'loraversion'))
          .input('regionalversion', sql.VarChar(10), str(data, 'regionalversion'))
          .input('customerid', sql.VarChar(100), str(data, 'customerid'))
          .input('tbconnectionid', sql.VarChar(100), str(data, 'tbconnectionid'))
          .input('nwconnectionid', sql.VarChar(100), str(data, 'nwconnectionid'))
          .input('brand_id', sql.Int, brand_id)
          .input('model_id', sql.Int, model_id)
          .input('hardwareversion', sql.VarChar(50), str(data, 'hardwareversion'))
          .input('firmwareversion', sql.VarChar(50), str(data, 'firmwareversion'))
          .input('owner_id', sql.Int, owner_id)
          .input('group_id', sql.Int, group_id)
          .input('distributor_id', sql.Int, distributor_id)
          .input('status_id', sql.Int, status_id)
          .input('invoicenbr', sql.VarChar(50), str(data, 'invoicenbr'))
          .input('ordernbr', sql.VarChar(50), str(data, 'ordernbr'))
          .input('orderdate', sql.Date, orderdateVal)
          .input('installed_at', sql.DateTime, installed_atVal)
          .input('tbconnected_at', sql.DateTime, tbconnected_atVal)
          .input('nwconnected_at', sql.DateTime, nwconnected_atVal)
          .input('status', sql.VarChar(50), str(data, 'status'))
          .input('contractId', sql.VarChar(100), str(data, 'contractId'))
          .input('deviceLabel', sql.VarChar(100), str(data, 'deviceLabel'))
          .input('deviceProfileId', sql.VarChar(100), str(data, 'deviceProfileId'))
          .input('offerName', sql.VarChar(100), str(data, 'offerName'))
          .input('created_at', sql.DateTime, now)
          .input('updated_at', sql.DateTime, now)
          .query(`
            INSERT INTO ${db}.dbo.inventory (
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
        const appkeyPut = data.appkey != null && data.appkey !== '' ? String(data.appkey) : '';
        const pool = await getConnection();
        const now = new Date().toISOString();

        let brandIdPut = data.brand_id != null && data.brand_id !== '' ? Number(data.brand_id) : null;
        if (brandIdPut == null || isNaN(brandIdPut)) {
          brandIdPut = await resolveBrandId(pool, db, data.brand_name);
        }
        if (brandIdPut == null) {
          return res.status(400).json({
            error: 'Brand is required',
            code: 'MISSING_BRAND',
            message: 'Das Pflichtfeld Brand darf nicht leer sein.'
          });
        }

        let modelIdPut = data.model_id != null && data.model_id !== '' ? Number(data.model_id) : null;
        if (modelIdPut == null || isNaN(modelIdPut)) {
          modelIdPut = await resolveModelId(pool, db, data.model_name);
        }
        if (modelIdPut == null) {
          return res.status(400).json({
            error: 'Model is required',
            code: 'MISSING_MODEL',
            message: 'Das Pflichtfeld Model darf nicht leer sein.'
          });
        }

        let distributorIdPut = data.distributor_id != null && data.distributor_id !== '' ? Number(data.distributor_id) : null;
        if (distributorIdPut == null || isNaN(distributorIdPut)) {
          distributorIdPut = await resolveDistributorId(pool, db, data.distributor_name);
        }

        const statusIdPut = intOrNull(data, 'status_id') ?? 0;
        const ownerIdPut = intOrNull(data, 'owner_id');
        const groupIdPut = intOrNull(data, 'group_id');
        const deveuiPut = data.deveui != null && data.deveui !== '' ? String(data.deveui).trim() : '';
        const joineuiPut = data.joineui != null && data.joineui !== '' ? String(data.joineui).trim() : '';
        const serialnbrPut = data.serialnbr != null && data.serialnbr !== '' ? String(data.serialnbr).trim() : '';
        if (!deveuiPut) {
          return res.status(400).json({
            error: 'DevEUI is required',
            code: 'MISSING_DEVEUI',
            message: 'Das Pflichtfeld DevEUI darf nicht leer sein.'
          });
        }
        if (!joineuiPut) {
          return res.status(400).json({
            error: 'JoinEUI is required',
            code: 'MISSING_JOINEUI',
            message: 'Das Pflichtfeld JoinEUI darf nicht leer sein.'
          });
        }
        if (!serialnbrPut) {
          return res.status(400).json({
            error: 'Serial number is required',
            code: 'MISSING_SERIALNBR',
            message: 'Das Pflichtfeld Seriennummer darf nicht leer sein.'
          });
        }
        const orderdatePut = data.orderdate != null && data.orderdate !== '' ? data.orderdate : null;
        const installedAtPut = data.installed_at != null && data.installed_at !== '' ? data.installed_at : null;
        const tbconnectedAtPut = data.tbconnected_at != null && data.tbconnected_at !== '' ? data.tbconnected_at : null;
        const nwconnectedAtPut = data.nwconnected_at != null && data.nwconnected_at !== '' ? data.nwconnected_at : null;

        const result = await pool.request()
          .input('id', sql.BigInt, data.id)
          .input('devicenbr', sql.VarChar(30), str(data, 'devicenbr'))
          .input('devicename', sql.VarChar(30), str(data, 'devicename'))
          .input('deveui', sql.VarChar(30), deveuiPut)
          .input('joineui', sql.VarChar(30), joineuiPut)
          .input('serialnbr', sql.VarChar(100), serialnbrPut)
          .input('appkey', sql.VarChar(50), appkeyPut)
          .input('loraversion', sql.VarChar(10), str(data, 'loraversion'))
          .input('regionalversion', sql.VarChar(10), str(data, 'regionalversion'))
          .input('customerid', sql.VarChar(100), str(data, 'customerid'))
          .input('tbconnectionid', sql.VarChar(100), str(data, 'tbconnectionid'))
          .input('nwconnectionid', sql.VarChar(100), str(data, 'nwconnectionid'))
          .input('brand_id', sql.Int, brandIdPut)
          .input('model_id', sql.Int, modelIdPut)
          .input('hardwareversion', sql.VarChar(50), str(data, 'hardwareversion'))
          .input('firmwareversion', sql.VarChar(50), str(data, 'firmwareversion'))
          .input('owner_id', sql.Int, ownerIdPut)
          .input('group_id', sql.Int, groupIdPut)
          .input('distributor_id', sql.Int, distributorIdPut)
          .input('status_id', sql.Int, statusIdPut)
          .input('invoicenbr', sql.VarChar(50), str(data, 'invoicenbr'))
          .input('ordernbr', sql.VarChar(50), str(data, 'ordernbr'))
          .input('orderdate', sql.Date, orderdatePut)
          .input('installed_at', sql.DateTime, installedAtPut)
          .input('tbconnected_at', sql.DateTime, tbconnectedAtPut)
          .input('nwconnected_at', sql.DateTime, nwconnectedAtPut)
          .input('status', sql.VarChar(50), str(data, 'status'))
          .input('contractId', sql.VarChar(100), str(data, 'contractId'))
          .input('deviceLabel', sql.VarChar(100), str(data, 'deviceLabel'))
          .input('deviceProfileId', sql.VarChar(100), str(data, 'deviceProfileId'))
          .input('offerName', sql.VarChar(100), str(data, 'offerName'))
          .input('updated_at', sql.DateTime, now)
          .query(`
            UPDATE ${db}.dbo.inventory
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
          .query(`DELETE FROM ${db}.dbo.inventory WHERE id = @id`);
        
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