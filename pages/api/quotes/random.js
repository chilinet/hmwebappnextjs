import sql from 'mssql';

// Determine if this is a local connection
const isLocalConnection = process.env.MSSQL_SERVER === '127.0.0.1' || 
                          process.env.MSSQL_SERVER === 'localhost' ||
                          process.env.MSSQL_SERVER?.includes('localhost');

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: !isLocalConnection,
    trustServerCertificate: true
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  let pool;
  try {
    pool = await sql.connect(config);

    // Get a random active quote
    const result = await pool.request().query(`
      SELECT TOP 1 
        quote_text,
        author,
        author_title
      FROM signin_quotes
      WHERE is_active = 1
      ORDER BY NEWID()
    `);

    if (result.recordset.length === 0) {
      // Fallback quote if no quotes in database
      return res.json({
        quote_text: 'Die beste Energie ist die, die wir nicht verbrauchen.',
        author: 'Angela Merkel',
        author_title: 'Ehemalige Bundeskanzlerin'
      });
    }

    return res.json(result.recordset[0]);
  } catch (error) {
    console.error('Database Error:', error);
    // Return fallback quote on error
    return res.json({
      quote_text: 'Die beste Energie ist die, die wir nicht verbrauchen.',
      author: 'Angela Merkel',
      author_title: 'Ehemalige Bundeskanzlerin'
    });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

