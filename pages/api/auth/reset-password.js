import { getConnection } from '../../../lib/db';
import sql from 'mssql';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur POST-Anfragen sind erlaubt'
    });
  }

  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing token or password',
        message: 'Token und neues Passwort sind erforderlich'
      });
    }

    // Passwort-Validierung
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password too short',
        message: 'Passwort muss mindestens 8 Zeichen lang sein'
      });
    }

    const pool = await getConnection();

    // Prüfe, ob der Token gültig ist
    const userResult = await pool.request()
      .input('resetToken', sql.VarChar, token)
      .query(`
        SELECT userid, resetTokenExpiry
        FROM hm_users 
        WHERE resetToken = @resetToken
      `);

    if (userResult.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token',
        message: 'Ungültiger oder abgelaufener Token'
      });
    }

    const user = userResult.recordset[0];

    // Prüfe, ob der Token abgelaufen ist
    if (new Date() > new Date(user.resetTokenExpiry)) {
      // Token ist abgelaufen - aus der Datenbank entfernen
      await pool.request()
        .input('resetToken', sql.VarChar, token)
        .query(`
          UPDATE hm_users 
          SET resetToken = NULL, resetTokenExpiry = NULL
          WHERE resetToken = @resetToken
        `);

      return res.status(400).json({
        success: false,
        error: 'Expired token',
        message: 'Der Token ist abgelaufen. Bitte fordern Sie einen neuen an.'
      });
    }

    // Hash das neue Passwort
    const hashedPassword = await bcrypt.hash(password, 12);

    // Aktualisiere das Passwort und lösche den Token
    await pool.request()
      .input('userId', sql.VarChar, user.userid.toString())
      .input('hashedPassword', sql.VarChar, hashedPassword)
      .query(`
        UPDATE hm_users 
        SET password = @hashedPassword, resetToken = NULL, resetTokenExpiry = NULL
        WHERE userid = @userId
      `);

    console.log(`Password reset successful for user ID: ${user.userid}`);

    return res.status(200).json({
      success: true,
      message: 'Passwort wurde erfolgreich zurückgesetzt'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler',
      message: 'Fehler beim Zurücksetzen des Passworts'
    });
  }
}
