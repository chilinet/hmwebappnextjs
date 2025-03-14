import { getSession } from 'next-auth/react'
import jwt from 'jsonwebtoken'
import sql from 'mssql'

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
  const { id } = req.query

  // Authentifizierung prüfen
  let authToken = null
  let tbToken = null

  // Versuche zuerst den Bearer Token
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    authToken = authHeader.split(' ')[1]
    try {
      const decoded = jwt.verify(authToken, process.env.NEXTAUTH_SECRET)
      tbToken = decoded.tbToken
    } catch (err) {
      console.error('JWT verification failed:', err)
    }
  }

  // Wenn kein gültiger Bearer Token, versuche Session
  if (!tbToken) {
    const session = await getSession({ req })
    if (session?.tbToken) {
      tbToken = session.tbToken
    }
  }

  // Wenn keine Authentifizierung gefunden wurde
  if (!tbToken) {
    console.error('Authentication failed - No valid token found')
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated',
      details: {
        hasAuthHeader: !!authHeader,
        hasSession: !!(await getSession({ req }))
      }
    })
  }

  console.log('************************************************');
  console.log(req.method);
  console.log('************************************************');
  
  try {
    await sql.connect(config)
    console.log('sql.connect');

    switch (req.method) {
      case 'GET':
        // Einzelnen Benutzer laden
        console.log('GET');
        const user = await sql.query`
          SELECT 
            userid as id,
            username,
            email,
            firstname as firstName,
            lastname as lastName,
            role,
            customerid,
            createdttm as createdAt,
            updatedttm as updatedAt
          FROM hm_users
          WHERE userid = ${id}
        `

        if (user.recordset.length === 0) {
          return res.status(404).json({ 
            success: false, 
            error: 'Benutzer nicht gefunden' 
          })
        }

        const userData = user.recordset[0]
        console.log('Raw user data from DB:', userData) // Debug Log

        // Wenn ein Customer ID vorhanden ist, hole die Daten von ThingsBoard
        if (userData.customerid) {
          try {
            const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/customer/${userData.customerid}`, {
              headers: {
                'X-Authorization': `Bearer ${tbToken}`
              }
            })

            if (tbResponse.ok) {
              const customerData = await tbResponse.json()
              userData.customerName = customerData.title
            }
          } catch (error) {
            console.error('Error fetching customer data:', error)
            userData.customerName = 'Fehler beim Laden'
          }
        }

        console.log('Processed user data:', userData) // Debug Log

        return res.status(200).json({
          success: true,
          data: {
            id: userData.id,
            username: userData.username,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role,
            customerid: userData.customerid ? userData.customerid.toString() : '', // Explizit als String
            customerName: userData.customerName || '',
            createdAt: userData.createdAt,
            updatedAt: userData.updatedAt
          }
        })

      case 'PUT':
        const { email, firstName, lastName, role, customerid } = req.body
        console.log('Updating user:', { id, email, firstName, lastName, role, customerid })

        await sql.query`
          UPDATE hm_users
          SET 
            email = ${email},
            firstname = ${firstName},
            lastname = ${lastName},
            role = ${role},
            customerid = ${customerid},
            updatedttm = GETDATE()
          WHERE userid = ${id}
        `

        return res.status(200).json({
          success: true,
          message: 'Benutzer erfolgreich aktualisiert'
        })

      case 'DELETE':
        // Benutzer löschen
        console.log('DELETE');
        await sql.query`
          DELETE FROM hm_users
          WHERE userid = ${id}
        `

        return res.status(200).json({
          success: true,
          message: 'User deleted successfully'
        })

      default:
        console.log('default');
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
        res.status(405).end(`Method ${req.method} Not Allowed`)
    }
  } catch (error) {
    console.error('User API error:', error)
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: {
        method: req.method,
        id: id,
        hasToken: !!tbToken
      }
    })
  } finally {
    await sql.close()
  }
} 