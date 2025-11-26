import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import sql from 'mssql';

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  const { id } = req.query;
  const { activationLink } = req.body;

  let pool;
  try {
    pool = await sql.connect(config);

    // Hole Benutzerinformationen
    const userResult = await pool.request()
      .input('userid', sql.Int, id)
      .query(`
        SELECT userid, username, email, firstname, lastname
        FROM hm_users
        WHERE userid = @userid
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ 
        message: 'Benutzer nicht gefunden' 
      });
    }

    const user = userResult.recordset[0];

    if (!user.email) {
      return res.status(400).json({ 
        message: 'Benutzer hat keine E-Mail-Adresse' 
      });
    }

    // Erstelle den vollständigen Aktivierungslink
    // Der Link kommt bereits vollständig vom Frontend (z.B. http://localhost:3000/auth/activationlink/token)
    const fullActivationLink = activationLink;

    // E-Mail-Inhalt
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: user.email,
      subject: 'HeatManager - Account aktivieren',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Willkommen bei HeatManager!</h2>
          <p>Hallo ${user.firstname || user.username},</p>
          <p>Ihr Account wurde erstellt. Bitte aktivieren Sie Ihren Account, indem Sie auf den folgenden Link klicken und ein Passwort setzen:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${fullActivationLink}" 
               style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Account aktivieren
            </a>
          </div>
          <p>Dieser Link ist gültig, bis Sie Ihr Passwort gesetzt haben.</p>
          <p>Falls Sie diese E-Mail nicht angefordert haben, können Sie diese ignorieren.</p>
          <p>Mit freundlichen Grüßen,<br>Ihr HeatManager Team</p>
          <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 20px 0;">
          <p style="font-size: 12px; color: #7f8c8d;">
            Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br>
            <a href="${fullActivationLink}" style="color: #3498db;">${fullActivationLink}</a>
          </p>
        </div>
      `
    };

    // E-Mail über die E-Mail-API senden
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
    console.log('Activation email sent successfully:', emailResult);

    return res.status(200).json({
      success: true,
      message: 'Aktivierungslink wurde erfolgreich per E-Mail versendet'
    });

  } catch (error) {
    console.error('Send activation email error:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Versenden der E-Mail',
      error: error.message
    });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

