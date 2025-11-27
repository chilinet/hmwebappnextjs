import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { getConnection } from "../../../../../lib/db";
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

  try {
    const pool = await getConnection();
    if (!pool) {
      return res.status(503).json({ message: 'Datenbankverbindung fehlgeschlagen' });
    }

    // Prüfe ob der aktuelle Benutzer ein Superadmin ist
    const currentUserResult = await pool.request()
      .input('userid', sql.Int, session.user.userid)
      .query('SELECT role FROM hm_users WHERE userid = @userid');

    if (currentUserResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Aktueller Benutzer nicht gefunden' });
    }

    const currentUserRole = currentUserResult.recordset[0].role;

    // Nur Superadmins (role = 1) dürfen Passwörter ändern
    if (currentUserRole !== 1) {
      return res.status(403).json({ message: 'Nur Superadmins dürfen Passwörter ändern' });
    }

    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: 'Neues Passwort ist erforderlich' });
    }

    // Prüfe ob das Passwort mindestens 8 Zeichen lang ist
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Passwort muss mindestens 8 Zeichen lang sein' });
    }

    // Prüfe ob der zu ändernde Benutzer existiert
    const userResult = await pool.request()
      .input('userid', sql.Int, id)
      .query('SELECT userid FROM hm_users WHERE userid = @userid');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Benutzer nicht gefunden' });
    }

    // Hash neues Passwort
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update Passwort
    await pool.request()
      .input('userid', sql.Int, id)
      .input('password', sql.VarChar, hashedPassword)
      .query('UPDATE hm_users SET password = @password WHERE userid = @userid');

    return res.json({ 
      success: true,
      message: 'Passwort erfolgreich geändert' 
    });
  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Serverfehler', 
      error: error.message 
    });
  }
}

