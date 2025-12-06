import sql from 'mssql';

// Determine if this is a local connection
const isLocalConnection = process.env.MSSQL_SERVER === '127.0.0.1' || 
                          process.env.MSSQL_SERVER === 'localhost' ||
                          process.env.MSSQL_SERVER?.includes('localhost');

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: !isLocalConnection, // Disable encryption for local connections
    trustServerCertificate: true,
  },
};

async function executeQuery(query, params = {}) {
  let pool;
  try {
    pool = await sql.connect(config);
    let request = pool.request();
    
    // Parameter hinzufügen mit korrekten Typen
    Object.entries(params).forEach(([key, value]) => {
      if (key === 'id' || key === 'roleid') {
        request.input(key, sql.Int, parseInt(value));
      } else if (typeof value === 'string') {
        request.input(key, sql.NVarChar, value);
      } else if (typeof value === 'number') {
        request.input(key, sql.Int, value);
      } else if (typeof value === 'boolean') {
        request.input(key, sql.Bit, value ? 1 : 0);
      } else {
        request.input(key, value);
      }
    });
    
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error', err);
    throw err;
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}
export default async function handler(req, res) {
  const { id } = req.query;

  switch (req.method) {
    case 'GET':
      try {
        const database = process.env.MSSQL_DATABASE || 'hmdev02';
        const query = `
          SELECT * FROM ${database}.dbo.roles 
          WHERE roleid = @id`;
        
        const result = await executeQuery(query, { id });
        if (result.length === 0) {
          return res.status(404).json({ error: 'Role not found' });
        }
        res.status(200).json(result[0]);
      } catch (error) {
        console.error('Failed to fetch role:', error);
        res.status(500).json({ error: 'Failed to fetch role', details: error.message });
      }
      break;

    case 'PUT':
      try {
        const { rolename, adminrole, descrlong } = req.body;
        const database = process.env.MSSQL_DATABASE || 'hmdev02';
        const query = `
          UPDATE ${database}.dbo.roles 
          SET rolename = @rolename,
              adminrole = @adminrole,
              descrlong = @descrlong,
              updatedttm = GETDATE()
          OUTPUT INSERTED.*
          WHERE roleid = @id`;
        
        const result = await executeQuery(query, {
          id,
          rolename,
          adminrole: adminrole ? 1 : 0,
          descrlong: descrlong || ''
        });
        
        if (result.length === 0) {
          return res.status(404).json({ error: 'Role not found' });
        }
        res.status(200).json(result[0]);
      } catch (error) {
        console.error('Failed to update role:', error);
        res.status(500).json({ error: 'Failed to update role', details: error.message });
      }
      break;

    case 'DELETE':
      try {
        const database = process.env.MSSQL_DATABASE || 'hmdev02';
        const query = `
          DELETE FROM ${database}.dbo.roles 
          OUTPUT DELETED.*
          WHERE roleid = @id`;
        
        const result = await executeQuery(query, { id });
        if (result.length === 0) {
          return res.status(404).json({ error: 'Role not found' });
        }
        res.status(200).json({ message: 'Role deleted successfully' });
      } catch (error) {
        console.error('Failed to delete role:', error);
        res.status(500).json({ error: 'Failed to delete role', details: error.message });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
  }
} 