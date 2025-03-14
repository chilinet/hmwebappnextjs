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
async function getThingsboardToken(tb_username, tb_password, tb_url) {
  const loginUrl = tb_url || TB_URL;
  const response = await fetch(`${loginUrl}/api/auth/login`, {
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
  let pool;

  try {
    pool = await sql.connect(sqlConfig)
    
    // User und zugehörige Customer-Settings aus der Datenbank abfragen
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT 
          u.userid,
          u.username,
          u.password,
          u.customerid,
          cs.tb_username,
          cs.tb_password,
          cs.tb_url
        FROM hm_users u
        LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
        WHERE u.username = @username
      `)

    if (result.recordset.length === 0) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      })
    }

    const user = result.recordset[0]

    // Passwort überprüfen
    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      })
    }

    // Prüfen ob ThingsBoard Credentials vorhanden sind
    if (!user.tb_username || !user.tb_password) {
      return res.status(401).json({ 
        success: false,
        error: 'No ThingsBoard credentials configured for this customer' 
      })
    }

    try {
      // ThingsBoard Token mit den Customer-spezifischen Credentials holen
      const tbToken = await getThingsboardToken(
        user.tb_username, 
        user.tb_password,
        user.tb_url
      )
      
      // Token generieren
      const token = jwt.sign(
        { 
          username: user.username,
          id: user.id,
          userid: user.userid,
          customerid: user.customerid,
          time: Date.now(),
          tbToken: tbToken
        },
        JWT_SECRET,
        { expiresIn: '8h' }
      )

      return res.status(200).json({ 
        success: true,
        token: token,
        tbToken: tbToken,
        user: {
          name: user.username,
          userid: user.userid,
          email: user.email
        }
      })
    } catch (tbError) {
      console.error('ThingsBoard login error:', tbError)
      return res.status(401).json({ 
        success: false,
        error: 'ThingsBoard authentication failed' 
      })
    }
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    })
  } finally {
    if (pool) {
      try {
        await pool.close()
      } catch (err) {
        console.error('Error closing connection:', err)
      }
    }
  }
} 