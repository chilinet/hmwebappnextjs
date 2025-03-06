import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import sql from 'mssql';

const config = {
  user: 'hmroot',
  password: '9YJLpf6CfyteKzoN',
  server: 'hmcdev01.database.windows.net',
  database: 'hmcdev',
  options: {
    encrypt: true
  }
};

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  const { id } = req.query;

  // Überprüfe ob der angemeldete Benutzer seine eigenen Daten bearbeitet
  if (session.user.id !== id) {
    return res.status(403).json({ message: 'Nicht autorisiert' });
  }

  try {
    await sql.connect(config);

    if (req.method === 'GET') {
      const result = await sql.query`
        SELECT username, firstname, lastname, email
        FROM hm_users
        WHERE userid = ${id}
      `;

      if (result.recordset.length === 0) {
        return res.status(404).json({ message: 'Benutzer nicht gefunden' });
      }

      return res.json(result.recordset[0]);
    }

    if (req.method === 'PUT') {
      const { username, firstname, lastname, email } = req.body;

      // Überprüfe ob der Benutzername bereits existiert
      const checkUsername = await sql.query`
        SELECT userid FROM hm_users
        WHERE username = ${username} AND userid != ${id}
      `;

      if (checkUsername.recordset.length > 0) {
        return res.status(400).json({ message: 'Benutzername bereits vergeben' });
      }

      await sql.query`
        UPDATE hm_users
        SET username = ${username},
            firstname = ${firstname},
            lastname = ${lastname},
            email = ${email}
        WHERE userid = ${id}
      `;

      return res.json({ message: 'Erfolgreich aktualisiert' });
    }

    return res.status(405).json({ message: 'Methode nicht erlaubt' });
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ message: 'Serverfehler' });
  } finally {
    await sql.close();
  }
} 