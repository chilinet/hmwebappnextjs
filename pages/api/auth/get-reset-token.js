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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Missing email',
        message: 'E-Mail-Adresse ist erforderlich'
      });
    }

    const pool = await getConnection();

    // Token für die angegebene E-Mail-Adresse abrufen
    const tokenResult = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`
        SELECT resetToken, resetTokenExpiry
        FROM hm_users 
        WHERE email = @email AND resetToken IS NOT NULL
      `);

    if (tokenResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No reset token found',
        message: 'Kein Reset-Token für diese E-Mail-Adresse gefunden'
      });
    }

    const user = tokenResult.recordset[0];
    
    // Prüfen, ob der Token abgelaufen ist
    const now = new Date();
    const tokenExpiry = new Date(user.resetTokenExpiry);
    
    if (now > tokenExpiry) {
      return res.status(400).json({
        success: false,
        error: 'Token expired',
        message: 'Der Reset-Token ist bereits abgelaufen'
      });
    }

    // Token ist gültig
    return res.status(200).json({
      success: true,
      message: 'Reset-Token gefunden',
      token: user.resetToken,
      expiresAt: user.resetTokenExpiry
    });

  } catch (error) {
    console.error('Get reset token error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler',
      message: 'Fehler beim Abrufen des Reset-Tokens'
    });
  }
}
