import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import nodemailer from 'nodemailer';

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

    // App Password-Konfiguration prüfen
    const requiredEnvVars = ['SMTP_USER', 'SMTP_PASS'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing App Password environment variables:', missingVars);
      return res.status(400).json({
        error: 'Missing App Password environment variables',
        missing: missingVars,
        solution: 'Set SMTP_USER and SMTP_PASS in your .env file'
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

    console.log('Sending email via App Password:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    // Nodemailer Transporter mit App Password erstellen
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      }
    });

    // E-Mail senden
    const result = await transporter.sendMail(mailOptions);

    console.log('Email sent successfully via App Password:', result.messageId);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId,
      method: 'App Password',
      config: {
        host: 'smtp.office365.com',
        port: 587,
        user: process.env.SMTP_USER,
        from: mailOptions.from
      }
    });

  } catch (error) {
    console.error('Error sending email via App Password:', error);
    
    return res.status(500).json({
      error: 'Failed to send email',
      details: error.message,
      method: 'App Password'
    });
  }
}
