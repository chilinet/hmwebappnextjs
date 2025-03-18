import { getSession } from 'next-auth/react';
import sql from 'mssql';
import bcrypt from 'bcryptjs';

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
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Methode nicht erlaubt' });
  }

  const session = await getSession({ req });

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  const { id } = req.query;
  
  if (session.user.id !== id) {
    return res.status(403).json({ message: 'Nicht autorisiert' });
  }

  try {
    await sql.connect(config);

    const { currentPassword, newPassword } = req.body;

    // Hole aktuelles Passwort aus der Datenbank
    const result = await sql.query`
      SELECT password
      FROM hm_users
      WHERE userid = ${id}
    `;

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden' });
    }

    // Überprüfe aktuelles Passwort
    const isValid = await bcrypt.compare(currentPassword, result.recordset[0].password);

    if (!isValid) {
      return res.status(400).json({ message: 'Aktuelles Passwort ist falsch' });
    }

    // Hash neues Passwort
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update Passwort
    await sql.query`
      UPDATE hm_users
      SET password = ${hashedPassword}
      WHERE userid = ${id}
    `;

    return res.json({ message: 'Passwort erfolgreich geändert' });
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ message: 'Serverfehler' });
  } finally {
    await sql.close();
  }
} 