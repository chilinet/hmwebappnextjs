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
    
    // Parameter hinzufügen
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
  switch (req.method) {
    case 'GET':
      try {
        const query = `
          SELECT 
            roleid,
            rolename,
            adminrole,
            descrlong,
            createdttm,
            updatedttm
          FROM hmcdev.dbo.roles
          ORDER BY roleid`;
        
        const result = await executeQuery(query);
        res.status(200).json(result);
      } catch (error) {
        console.error('Failed to fetch roles:', error);
        res.status(500).json({ error: 'Failed to fetch roles' });
      }
      break;

    case 'POST':
      try {
        const { rolename, adminrole, descrlong } = req.body;
        const query = `
          INSERT INTO hmcdev.dbo.roles (rolename, adminrole, descrlong, createdttm)
          OUTPUT INSERTED.*
          VALUES (@rolename, @adminrole, @descrlong, GETDATE())`;
        
        const result = await executeQuery(query, {
          rolename: rolename,
          adminrole: adminrole ? 1 : 0,
          descrlong: descrlong
        });
        
        res.status(201).json(result[0]);
      } catch (error) {
        console.error('Failed to create role:', error);
        res.status(500).json({ error: 'Failed to create role' });
      }
      break;

    default:
      res.status(405).json({ error: 'Method not allowed' });
  }
} 