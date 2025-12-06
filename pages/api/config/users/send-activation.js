import { getSession } from 'next-auth/react'
import jwt from 'jsonwebtoken'
import sql from 'mssql'
import nodemailer from 'nodemailer'

// Determine if this is a local connection
const isLocalConnection = process.env.MSSQL_SERVER === '127.0.0.1' || 
                          process.env.MSSQL_SERVER === 'localhost' ||
                          process.env.MSSQL_SERVER?.includes('localhost');

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: !isLocalConnection, // Disable encryption for local connections
    trustServerCertificate: true
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const { userId, email } = req.body

  try {
    // Authentifizierung prüfen
    const session = await getSession({ req })
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    // Token für Aktivierungslink generieren
    const activationToken = jwt.sign(
      { userId, email, purpose: 'activation' },
      process.env.NEXTAUTH_SECRET,
      { expiresIn: '24h' }
    )

    // Aktivierungslink erstellen
    const activationLink = `${process.env.NEXTAUTH_URL}/activate/${activationToken}`

    // E-Mail-Transport konfigurieren
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })

    // E-Mail senden
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'Aktivieren Sie Ihren Account',
      html: `
        <h1>Willkommen!</h1>
        <p>Bitte klicken Sie auf den folgenden Link, um Ihren Account zu aktivieren und ein Passwort zu setzen:</p>
        <p><a href="${activationLink}">Account aktivieren</a></p>
        <p>Dieser Link ist 24 Stunden gültig.</p>
      `
    })

    // Token in Datenbank speichern
    await sql.connect(config)
    await sql.query`
      UPDATE hm_users
      SET activation_token = ${activationToken},
          activation_token_expires = DATEADD(hour, 24, GETDATE())
      WHERE userid = ${userId}
    `

    return res.status(200).json({
      success: true,
      message: 'Aktivierungslink wurde gesendet'
    })

  } catch (error) {
    console.error('Send activation error:', error)
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to send activation link' 
    })
  } finally {
    await sql.close()
  }
} 