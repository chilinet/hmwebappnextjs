import sql from 'mssql';
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

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
      .query('SELECT * FROM hmcdev.dbo.inventory WHERE id = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    res.status(200).json(result.recordset[0]);
  } catch (error) {
    console.error('GET Single Error:', error);
    res.status(500).json({ error: error.message });
  }
} 