import { getConnection } from '../../../lib/db';
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur POST-Anfragen sind erlaubt'
    });
  }

  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing token',
        message: 'Token ist erforderlich'
      });
    }

    const pool = await getConnection();

    // Token in der Datenbank suchen und validieren
    const tokenResult = await pool.request()
      .input('resetToken', sql.VarChar, token)
      .query(`
        SELECT userid, username, email, resetTokenExpiry
        FROM hm_users 
        WHERE resetToken = @resetToken
      `);

    if (tokenResult.recordset.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token',
        message: 'Kein gültiger Token gefunden'
      });
    }

    const user = tokenResult.recordset[0];
    
    // Prüfen, ob der Token abgelaufen ist
    const now = new Date();
    const tokenExpiry = new Date(user.resetTokenExpiry);
    
    if (now > tokenExpiry) {
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
        error: 'Token expired',
        message: 'Token ist abgelaufen'
      });
    }

    // Token ist gültig
    return res.status(200).json({
      success: true,
      message: 'Token ist gültig',
      user: {
        userid: user.userid,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler',
      message: 'Fehler bei der Token-Validierung'
    });
  }
}
