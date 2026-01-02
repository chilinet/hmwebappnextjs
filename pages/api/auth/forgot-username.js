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

    // Suche alle Benutzer mit dieser E-Mail-Adresse
    const userResult = await pool.request()
      .input('email', sql.VarChar, email)
      .query(`
        SELECT username, email
        FROM hm_users 
        WHERE email = @email
      `);

    // Aus Sicherheitsgründen geben wir immer die gleiche Erfolgsmeldung zurück,
    // unabhängig davon, ob die E-Mail gefunden wurde oder nicht
    if (userResult.recordset.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Falls die E-Mail-Adresse in unserem System registriert ist, erhalten Sie eine E-Mail mit Ihrem Benutzernamen.'
      });
    }

    const users = userResult.recordset;
    const usernames = users.map(user => user.username);

    // E-Mail-Inhalt erstellen
    const usernameList = usernames.length === 1 
      ? `<strong>${usernames[0]}</strong>`
      : usernames.map(u => `<li><strong>${u}</strong></li>`).join('');

    const usernameDisplay = usernames.length === 1
      ? usernameList
      : `<ul style="list-style: none; padding-left: 0;">${usernameList}</ul>`;

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'HeatManager - Benutzername',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Benutzername anfordern</h2>
          <p>Hallo,</p>
          <p>Sie haben eine Anfrage zum Anzeigen Ihres Benutzernamens gestellt.</p>
          ${usernames.length === 1 
            ? '<p>Ihr Benutzername lautet:</p>'
            : '<p>Ihre Benutzernamen lauten:</p>'
          }
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
            ${usernameDisplay}
          </div>
          <p>Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.</p>
          <p>Mit freundlichen Grüßen,<br>Ihr HeatManager Team</p>
          <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 20px 0;">
        </div>
      `
    };

    // E-Mail über die spezielle Passwort-Reset-API senden (nutzt die gleiche Infrastruktur)
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
    console.log('Username reminder email sent successfully:', emailResult);

    return res.status(200).json({
      success: true,
      message: 'Falls die E-Mail-Adresse in unserem System registriert ist, erhalten Sie eine E-Mail mit Ihrem Benutzernamen.'
    });

  } catch (error) {
    console.error('Forgot username error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler',
      message: 'Fehler beim Senden der E-Mail mit dem Benutzernamen'
    });
  }
}




