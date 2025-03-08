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

async function executeQuery(query, params = {}) {
  try {
    let pool = await sql.connect(config);
    let request = pool.request();
    
    Object.entries(params).forEach(([key, value]) => {
      request.input(key, value);
    });
    
    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('SQL error', err);
    throw new Error('Database query failed');
  } finally {
    await sql.close();
  }
}
export default async function handler(req, res) {
  const { id } = req.query;

  switch (req.method) {
    case 'GET':
      try {
        const query = `
          SELECT * FROM hmcdev.dbo.roles 
          WHERE roleid = @id`;
        
        const result = await executeQuery(query, { id });
        if (result.length === 0) {
          return res.status(404).json({ error: 'Role not found' });
        }
        res.status(200).json(result[0]);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch role' });
      }
      break;

    case 'PUT':
      try {
        const { rolename, adminrole, descrlong } = req.body;
        const query = `
          UPDATE hmcdev.dbo.roles 
          SET rolename = @rolename,
              adminrole = @adminrole,
              descrlong = @descrlong,
              updatedttm = GETDATE()
          OUTPUT INSERTED.*
          WHERE roleid = @id`;
        
        const result = await executeQuery(query, {
          id,
          rolename,
          adminrole,
          descrlong
        });
        
        if (result.length === 0) {
          return res.status(404).json({ error: 'Role not found' });
        }
        res.status(200).json(result[0]);
      } catch (error) {
        res.status(500).json({ error: 'Failed to update role' });
      }
      break;

    case 'DELETE':
      try {
        const query = `
          DELETE FROM hmcdev.dbo.roles 
          OUTPUT DELETED.*
          WHERE roleid = @id`;
        
        const result = await executeQuery(query, { id });
        if (result.length === 0) {
          return res.status(404).json({ error: 'Role not found' });
        }
        res.status(200).json({ message: 'Role deleted successfully' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to delete role' });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
  }
} 