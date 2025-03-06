import NextAuth, { getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { authOptions } from './auth/[...nextauth]'
import jwt from 'jsonwebtoken'
import sql from 'mssql'
import bcrypt from 'bcrypt'

const JWT_SECRET = process.env.NEXTAUTH_SECRET
const TB_URL = process.env.THINGSBOARD_URL

// MS SQL Konfiguration
const sqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: true, // für azure
    trustServerCertificate: true // für lokale Entwicklung
  }
}

// ThingsBoard Login mit Benutzer-spezifischen Credentials
async function getThingsboardToken(tb_username, tb_password) {
  const response = await fetch(`${TB_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: tb_username,
      password: tb_password
    }),
  })

  if (!response.ok) {
    throw new Error('ThingsBoard login failed')
  }

  const data = await response.json()
  return data.token
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { username, password } = req.body

  try {
    // Verbindung zur Datenbank herstellen
    await sql.connect(sqlConfig)
    
    // User aus der Datenbank abfragen mit ThingsBoard Credentials
    const result = await sql.query`
      SELECT userid, username, password, tb_username, tb_password
      FROM hm_users
      WHERE username = ${username}
    `

    // Prüfen ob User gefunden wurde
    if (result.recordset.length === 0) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      })
    }

    const user = result.recordset[0]

    // Passwort überprüfen
    const passwordMatch = await bcrypt.compare(password, user.password)

    if (passwordMatch) {
      // ThingsBoard Token mit den Benutzer-spezifischen Credentials holen
      const tbToken = await getThingsboardToken(user.tb_username, user.tb_password)
      
      // Token generieren
      const token = jwt.sign(
        { 
          username: user.username,
          id: user.id,
          userid: user.userid,
          time: Date.now(),
          tbToken: tbToken // ThingsBoard Token im JWT speichern
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      )

      // Erfolgreiche Authentifizierung
      return res.status(200).json({ 
        success: true,
        token: token,
        tbToken: tbToken, // Optional: ThingsBoard Token direkt zurückgeben
        user: {
          name: user.username,
          userid: user.userid,
          email: user.email
        }
      })
    } else {
      // Falsches Passwort
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      })
    }
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    })
  } finally {
    // Datenbankverbindung schließen
    await sql.close()
  }
} 