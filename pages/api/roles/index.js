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
    
    // Parameter hinzufügen
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') {
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
  switch (req.method) {
    case 'GET':
      try {
        const database = process.env.MSSQL_DATABASE || 'hmdev02';
        const query = `
          SELECT 
            roleid,
            rolename,
            adminrole,
            descrlong,
            createdttm,
            updatedttm
          FROM ${database}.dbo.roles
          ORDER BY roleid`;
        
        const result = await executeQuery(query);
        res.status(200).json(result);
      } catch (error) {
        console.error('Failed to fetch roles:', error);
        res.status(500).json({ error: 'Failed to fetch roles', details: error.message });
      }
      break;

    case 'POST':
      try {
        const { rolename, adminrole, descrlong } = req.body;
        const database = process.env.MSSQL_DATABASE || 'hmdev02';
        const query = `
          INSERT INTO ${database}.dbo.roles (rolename, adminrole, descrlong, createdttm)
          OUTPUT INSERTED.*
          VALUES (@rolename, @adminrole, @descrlong, GETDATE())`;
        
        const result = await executeQuery(query, {
          rolename: rolename,
          adminrole: adminrole ? 1 : 0,
          descrlong: descrlong || ''
        });
        
        res.status(201).json(result[0]);
      } catch (error) {
        console.error('Failed to create role:', error);
        res.status(500).json({ error: 'Failed to create role', details: error.message });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
  }
} 