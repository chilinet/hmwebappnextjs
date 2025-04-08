import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

export default async function handler(req, res) {
  switch (req.method) {
    case 'GET':
      try {
        const pool = await getConnection();
        const result = await pool.request()
          .query('SELECT * FROM hmcdev.dbo.inventory ORDER BY id DESC');
        
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
          .input('brand_id', sql.Int, data.brand_id)
          .input('model_id', sql.Int, data.model_id)
          .input('distributor_id', sql.Int, data.distributor_id)
          .input('status_id', sql.Int, data.status_id)
          .input('invoicenbr', sql.VarChar(50), data.invoicenbr)
          .input('ordernbr', sql.VarChar(50), data.ordernbr)
          .input('orderdate', sql.Date, data.orderdate)
          .input('created_at', sql.DateTime, now)
          .input('updated_at', sql.DateTime, now)
          .query(`
            INSERT INTO hmcdev.dbo.inventory (
              devicenbr, devicename, deveui, joineui, serialnbr, appkey,
              loraversion, regionalversion, customerid, brand_id, model_id,
              distributor_id, status_id, invoicenbr, ordernbr, orderdate,
              created_at, updated_at
            )
            VALUES (
              @devicenbr, @devicename, @deveui, @joineui, @serialnbr, @appkey,
              @loraversion, @regionalversion, @customerid, @brand_id, @model_id,
              @distributor_id, @status_id, @invoicenbr, @ordernbr, @orderdate,
              @created_at, @updated_at
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
          .input('updated_at', sql.DateTime, now)
          .query(`
            UPDATE hmcdev.dbo.inventory
            SET devicenbr = @devicenbr,
                devicename = @devicename,
                deveui = @deveui,
                joineui = @joineui,
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