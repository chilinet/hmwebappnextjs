import { getSession } from 'next-auth/react'
import { getServerSession } from "next-auth/next"
import sql from 'mssql'
import { authOptions } from "../../auth/[...nextauth]";

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
  const { id } = req.query

  let tbToken = null

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  tbToken = session.tbToken;
  
  if (!tbToken) {
    return res.status(401).json({ 
      success: false, 
      error: 'No valid ThingsBoard token found'
    });
  }

  console.log('************************************************');
  console.log(req.method);
  console.log('************************************************');
  
  let pool;
  try {
    pool = await sql.connect(config)
    console.log('sql.connect');

    switch (req.method) {
      case 'GET':
        // Einzelnen Benutzer laden
        console.log('GET');
        const userResult = await pool.request()
          .input('id', sql.Int, id)
          .query(`
            SELECT 
              userid as id,
              username,
              email,
              firstname as firstName,
              lastname as lastName,
              role,
              customerid,
              status,
              createdttm as createdAt,
              updatedttm as updatedAt
            FROM hm_users
            WHERE userid = @id
          `)
        
        const user = userResult

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
        const { email, firstName, lastName, role, customerid, status } = req.body
        console.log('Updating user:', { id, email, firstName, lastName, role, customerid, status })

        // Baue die UPDATE-Query dynamisch auf, je nachdem welche Felder übergeben wurden
        let updateFields = []
        let updateValues = {}

        if (email !== undefined) {
          updateFields.push('email = @email')
          updateValues.email = email
        }
        if (firstName !== undefined) {
          updateFields.push('firstname = @firstName')
          updateValues.firstName = firstName
        }
        if (lastName !== undefined) {
          updateFields.push('lastname = @lastName')
          updateValues.lastName = lastName
        }
        if (role !== undefined) {
          updateFields.push('role = @role')
          updateValues.role = role
        }
        if (customerid !== undefined) {
          updateFields.push('customerid = @customerid')
          updateValues.customerid = customerid
        }
        if (status !== undefined) {
          updateFields.push('status = @status')
          updateValues.status = status
        }

        // Füge updatedttm immer hinzu
        updateFields.push('updatedttm = GETDATE()')

        if (updateFields.length === 1) {
          // Nur updatedttm wurde aktualisiert, keine anderen Felder
          return res.status(400).json({
            success: false,
            message: 'Keine Felder zum Aktualisieren angegeben'
          })
        }

        // Erstelle die SQL-Query mit parametrisierten Werten
        const updateQuery = `
          UPDATE hm_users
          SET ${updateFields.join(', ')}
          WHERE userid = @id
        `

        const request = pool.request()
        request.input('id', sql.Int, id)
        
        // Füge alle Werte hinzu
        Object.keys(updateValues).forEach(key => {
          if (key === 'customerid' && updateValues[key]) {
            request.input(key, sql.UniqueIdentifier, updateValues[key])
          } else if (key === 'role' || key === 'status') {
            request.input(key, sql.Int, updateValues[key])
          } else {
            request.input(key, sql.NVarChar, updateValues[key])
          }
        })

        await request.query(updateQuery)

        return res.status(200).json({
          success: true,
          message: 'Benutzer erfolgreich aktualisiert'
        })

      case 'DELETE':
        // Benutzer löschen
        console.log('DELETE');
        await pool.request()
          .input('id', sql.Int, id)
          .query(`
            DELETE FROM hm_users
            WHERE userid = @id
          `)

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
    if (pool) {
      await pool.close()
    }
  }
} 