export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Missing email',
        message: 'E-Mail-Adresse ist erforderlich'
      });
    }

    // Test-E-Mail-Inhalt
    const testMailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'HeatManager - Test Passwort-Reset E-Mail',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">Test: Passwort zurücksetzen</h2>
          <p>Dies ist eine Test-E-Mail für die Passwort-Reset-Funktionalität.</p>
          <p>Falls Sie diese E-Mail erhalten, funktioniert der E-Mail-Versand korrekt.</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #27ae60; color: white; padding: 12px 24px; border-radius: 5px; display: inline-block;">
              ✅ E-Mail-Versand funktioniert
            </div>
          </div>
          <p>Mit freundlichen Grüßen,<br>Ihr HeatManager Team</p>
          <hr style="border: none; border-top: 1px solid #ecf0f1; margin: 20px 0;">
          <p style="font-size: 12px; color: #7f8c8d;">
            Diese E-Mail wurde automatisch generiert für Testzwecke.
          </p>
        </div>
      `
    };

    // E-Mail über die Passwort-Reset-API senden
    const emailResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/email/send-password-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMailOptions)
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error('Test email sending failed:', errorData);
      return res.status(400).json({
        error: 'Test E-Mail-Versand fehlgeschlagen',
        details: errorData.error || 'Unbekannter Fehler',
        solution: errorData.solution || 'Überprüfen Sie Ihre OAuth2-Konfiguration'
      });
    }

    const emailResult = await emailResponse.json();
    console.log('Test password reset email sent successfully:', emailResult);

    return res.status(200).json({
      success: true,
      message: 'Test E-Mail erfolgreich gesendet',
      details: emailResult,
      nextSteps: [
        'Überprüfen Sie den Posteingang der angegebenen E-Mail-Adresse',
        'Falls die E-Mail ankommt, funktioniert der Passwort-Reset korrekt',
        'Falls nicht, überprüfen Sie die Server-Logs für weitere Details'
      ]
    });

  } catch (error) {
    console.error('Test password reset error:', error);
    return res.status(500).json({
      error: 'Test fehlgeschlagen',
      details: error.message
    });
  }
}
