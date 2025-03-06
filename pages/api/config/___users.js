import { getSession } from 'next-auth/react'
import jwt from 'jsonwebtoken'
import sql from 'mssql'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.NEXTAUTH_SECRET

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: true
  }
}

export default async function handler(req, res) {
  // Session oder Token Authentifizierung prüfen
  const session = await getSession({ req })
  let decoded

  if (!session) {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    try {
      const token = authHeader.split(' ')[1]
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }

  try {
    await sql.connect(config)

    switch (req.method) {
      case 'GET':
        // Liste aller Benutzer
        const result = await sql.query`
          SELECT 
            userid,
            username,
            email,
            firstname,
            lastname,
            role,
            customerid,
            createdttm,
            updatedttm
          FROM hm_users
          ORDER BY username
        `

        // ThingsBoard Token aus Session oder decodiertem Token
        const tbToken = session?.tbToken || decoded?.tbToken

        // Hole Customer Namen von ThingsBoard für alle Benutzer mit customerid
        const users = await Promise.all(result.recordset.map(async (user) => {
          if (user.customerid) {
            try {
              const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/customer/${user.customerid}`, {
                headers: {
                  'X-Authorization': `Bearer ${tbToken}`
                }
              })

              if (tbResponse.ok) {
                const customerData = await tbResponse.json()
                user.customerName = customerData.title
              }
            } catch (error) {
              console.error('Error fetching customer data:', error)
              user.customerName = 'Fehler beim Laden'
            }
          }
          return {
            id: user.userid,
            username: user.username,
            email: user.email,
            firstName: user.firstname,
            lastName: user.lastname,
            role: user.role,
            customerid: user.customerid,
            customerName: user.customerName,
            createdAt: user.createdttm,
            updatedAt: user.updatedttm
          }
        }))

        return res.status(200).json({
          success: true,
          data: users
        })

      case 'POST':
        // Neuen Benutzer erstellen
        const { username, email, firstName, lastName, role, password } = req.body

        // Prüfen ob Benutzer bereits existiert
        const checkUser = await sql.query`
          SELECT username FROM hm_users WHERE username = ${username}
        `
        if (checkUser.recordset.length > 0) {
          return res.status(400).json({ 
            success: false, 
            error: 'Benutzername existiert bereits' 
          })
        }

        // Passwort hashen
        const hashedPassword = await bcrypt.hash(password, 10)

        // Benutzer erstellen
        await sql.query`
          INSERT INTO hm_users (
            username,
            email,
            firstname,
            lastname,
            role,
            password,
            createdttm,
            updatedttm
          )
          VALUES (
            ${username},
            ${email},
            ${firstName},
            ${lastName},
            ${role},
            ${hashedPassword},
            GETDATE(),
            GETDATE()
          )
        `

        return res.status(201).json({
          success: true,
          message: 'Benutzer erfolgreich erstellt'
        })

      default:
        res.setHeader('Allow', ['GET', 'POST'])
        res.status(405).end(`Method ${req.method} Not Allowed`)
    }
  } catch (error) {
    console.error('Users API error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    })
  } finally {
    await sql.close()
  }
} 