import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import oauth2Helper from '../../../lib/oauth2Helper';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authentifizierung prüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { to, subject, text, html, from } = req.body;

    // Validierung der E-Mail-Parameter
    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, and either text or html are required' 
      });
    }

    // E-Mail-Optionen vorbereiten
    const mailOptions = {
      from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to,
      subject: subject,
      text: text,
      html: html,
    };

    console.log('Sending email via OAuth2:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    // E-Mail über OAuth2 versenden
    const result = await oauth2Helper.sendMail(mailOptions);

    console.log('Email sent successfully via OAuth2:', result.messageId);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId,
      method: 'OAuth2'
    });

  } catch (error) {
    console.error('Error sending email via OAuth2:', error);
    
    return res.status(500).json({
      error: 'Failed to send email',
      details: error.message,
      method: 'OAuth2'
    });
  }
}
