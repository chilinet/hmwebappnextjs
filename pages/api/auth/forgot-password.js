import { getConnection } from '../../../lib/db';
import sql from 'mssql';
import crypto from 'crypto';

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

    // Prüfe, ob der Benutzer existiert
    const userResult = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`
        SELECT userid, username, email, customerid
        FROM hm_users 
        WHERE email = @email
      `);

    if (userResult.recordset.length === 0) {
      // Aus Sicherheitsgründen geben wir keine Information darüber, ob die E-Mail existiert
      return res.status(200).json({
        success: true,
        message: 'Falls die E-Mail-Adresse in unserem System registriert ist, erhalten Sie eine E-Mail mit einem Link zum Zurücksetzen Ihres Passworts.'
      });
    }

    const user = userResult.recordset[0];
    
    // Debug: Überprüfe den Benutzer
    console.log('User data:', user);
    console.log('User ID type:', typeof user.userid, 'Value:', user.userid);
    
    if (!user.userid) {
      throw new Error('User ID is missing or undefined');
    }

    // Generiere einen einzigartigen Token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Stunden gültig

    // Speichere den Token in der Datenbank
    await pool.request()
      .input('userId', sql.VarChar, user.userid.toString())
      .input('resetToken', sql.VarChar, resetToken)
      .input('resetTokenExpiry', sql.DateTime, resetTokenExpiry)
      .query(`
        UPDATE hm_users 
        SET resetToken = @resetToken, resetTokenExpiry = @resetTokenExpiry
        WHERE userid = @userId
      `);

    // E-Mail-Inhalt
    const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'HeatManager - Passwort zurücksetzen',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Passwort zurücksetzen</h2>
          <p>Hallo ${user.username},</p>
          <p>Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt.</p>
          <p>Klicken Sie auf den folgenden Link, um ein neues Passwort zu setzen:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Passwort zurücksetzen
            </a>
          </div>
          <p>Dieser Link ist 24 Stunden gültig.</p>
          <p>Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.</p>
          <p>Mit freundlichen Grüßen,<br>Ihr HeatManager Team</p>
          <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 20px 0;">
          <p style="font-size: 12px; color: #7f8c8d;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
            <a href="${resetUrl}" style="color: #3498db;">${resetUrl}</a>
          </p>
        </div>
      `
    };

    // E-Mail über die spezielle Passwort-Reset-API senden
    const emailResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/email/send-password-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mailOptions)
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Email sending failed:', errorData);
      throw new Error(`E-Mail-Versand fehlgeschlagen: ${errorData.error || 'Unbekannter Fehler'}`);
    }

    const emailResult = await emailResponse.json();
    console.log('Password reset email sent successfully:', emailResult);

    return res.status(200).json({
      success: true,
      message: 'Falls die E-Mail-Adresse in unserem System registriert ist, erhalten Sie eine E-Mail mit einem Link zum Zurücksetzen Ihres Passworts.'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler',
      message: 'Fehler beim Senden der E-Mail zum Zurücksetzen des Passworts'
    });
  }
}
