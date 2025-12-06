import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
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
    encrypt: !isLocalConnection, // Disable encryption for local connections
    trustServerCertificate: true
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  const { id } = req.query;
  const { activationLink } = req.body;

  try {
    await sql.connect(config);

    // Aktivierungslink in der Datenbank speichern
    await sql.query`
      UPDATE hm_users 
      SET activationlink = ${activationLink}
      WHERE userid = ${id}
    `;

    return res.status(200).json({ 
      success: true, 
      message: 'Aktivierungslink erfolgreich gespeichert' 
    });

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ 
      message: 'Datenbankfehler beim Speichern des Aktivierungslinks',
      error: error.message 
    });
  } finally {
    await sql.close();
  }
} 