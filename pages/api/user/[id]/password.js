import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { getConnection } from "../../../../lib/db";
import sql from 'mssql';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Methode nicht erlaubt' });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  const { id } = req.query;
  
  if (session.user.id !== id) {
    return res.status(403).json({ message: 'Nicht autorisiert' });
  }

  try {
    const pool = await getConnection();
    if (!pool) {
      return res.status(503).json({ message: 'Datenbankverbindung fehlgeschlagen' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Aktuelles und neues Passwort sind erforderlich' });
    }

    // Hole aktuelles Passwort aus der Datenbank
    const result = await pool.request()
      .input('userid', sql.Int, id)
      .query('SELECT password FROM hm_users WHERE userid = @userid');

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
    await pool.request()
      .input('userid', sql.Int, id)
      .input('password', sql.VarChar, hashedPassword)
      .query('UPDATE hm_users SET password = @password WHERE userid = @userid');

    return res.json({ message: 'Passwort erfolgreich geändert' });
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ message: 'Serverfehler', error: error.message });
  }
} 