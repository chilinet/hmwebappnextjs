import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: true
  }
};

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  try {
    await sql.connect(config);

    // SQL-Abfrage anpassen, um den Status einzuschließen
    const result = await sql.query`
      SELECT 
        u.userid as id,
        u.username,
        u.email,
        u.firstName,
        u.lastName,
        u.role,
        u.status,
        u.createdAt,
        c.name as customerName
      FROM hm_users u
      LEFT JOIN hm_customers c ON u.customerId = c.id
      ORDER BY u.username
    `;

    const users = result.recordset.map(user => ({
      ...user,
      createdAt: user.createdAt?.toISOString() || null
    }));

    return res.status(200).json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ 
      message: 'Datenbankfehler beim Laden der Benutzer',
      error: error.message 
    });
  } finally {
    await sql.close();
  }
} 