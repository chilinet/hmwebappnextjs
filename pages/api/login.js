import NextAuth, { getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { authOptions } from './auth/[...nextauth]'
import jwt from 'jsonwebtoken'
import sql from 'mssql'
import bcrypt from 'bcryptjs'

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
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { username, password } = req.body
  let pool;

  try {
    console.log('Attempting database connection...');
    pool = await sql.connect(sqlConfig)
    console.log('Database connected successfully');
    
    // User und zugehörige Customer-Settings aus der Datenbank abfragen
    let result;
    try {
      result = await pool.request()
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
    } catch (error) {
      console.error('Database query error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database query failed'
      });
    }

    console.log('Database query completed. Records found:', result.recordset.length);

    if (result.recordset.length === 0) {
      console.log('No user found for username:', username);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials 1' 
      })
    }

    const user = result.recordset[0]
    console.log('User found:', { 
      userid: user.userid, 
      username: user.username,
      hasPassword: !!user.password,
      hasThingsboard: !!user.tb_username
    });

    // Passwort überprüfen
    const passwordMatch = await bcrypt.compare(password, user.password)
    
   // console.log(passwordMatch)
   // console.log(user.password)
   // console.log(password)

    if (!passwordMatch) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials 2' 
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
      // ThingsBoard Login
      const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: user.tb_username,
          password: user.tb_password
        })
      })

      // Debug-Logging
       //console.log('ThingsBoard response status:', tbResponse.status);
      //console.log('ThingsBoard response headers:', tbResponse.headers);
      const responseText = await tbResponse.text();
      //console.log('ThingsBoard response body:', responseText);

      let tbData;
      try {
        // Prüfen ob responseText ein valides JSON ist
        console.log('Prüfen ob responseText ein valides JSON ist');
        if (!responseText || typeof responseText !== 'string' || responseText.trim() === '') {
            throw new Error('Invalid JSON: Empty or invalid response');
        }
        console.log('responseText ist ein valides JSON');
        tbData = JSON.parse(responseText);
        console.log('tbData:', tbData);
      } catch (error) {
        console.error('Failed to parse ThingsBoard response:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to authenticate with ThingsBoard',
          details: process.env.NODE_ENV === 'development' ? responseText : undefined
        });
      }

      if (!tbResponse.ok) {
        return res.status(401).json({
          success: false,
          error: 'ThingsBoard authentication failed',
          details: tbData.message || 'Unknown error'
        });
      }

      // ThingsBoard Token mit den Customer-spezifischen Credentials holen
      const tbToken = tbData.token
      
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
    console.error('Login error:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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