import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import sql from 'mssql'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.NEXTAUTH_SECRET

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
}

// Rollen-Mapping hinzufügen
const ROLE_MAPPING = {
  'USER': 1,
  'ADMIN': 2
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  // POST-Methode für das Erstellen eines neuen Benutzers
  if (req.method === 'POST') {
    let pool;
    try {
      const {
        username,
        email,
        firstName,
        lastName,
        role,
        password,
        customerid,
        tenantid
      } = req.body;

      // Debug-Info
      console.log('Received user data:', {
        username,
        email,
        firstName,
        lastName,
        role,
        customerid,
        tenantid
      });

      if (!tenantid) {
        return res.status(400).json({
          message: 'tenantid is required'
        });
      }

      if (!customerid && role !== 1) {
        return res.status(400).json({
          message: 'customerid is required for non-superadmin users'
        });
      }

      // Hash das Passwort
      const hashedPassword = await bcrypt.hash(password, 10);

      pool = await sql.connect(config);

      // Prüfe ob der Benutzername bereits existiert
      const checkUser = await pool.request()
        .input('username', sql.NVarChar, username)
        .query('SELECT userid FROM hm_users WHERE username = @username');

      if (checkUser.recordset.length > 0) {
        return res.status(400).json({
          message: 'Username already exists'
        });
      }

      // Füge den neuen Benutzer ein
      const result = await pool.request()
        .input('username', sql.NVarChar, username)
        .input('email', sql.NVarChar, email)
        .input('firstname', sql.NVarChar, firstName)
        .input('lastname', sql.NVarChar, lastName)
        .input('role', sql.Int, role)
        .input('password', sql.NVarChar, hashedPassword)
        .input('customerid', sql.UniqueIdentifier, customerid)
        .input('tenantid', sql.UniqueIdentifier, tenantid)
        .input('status', sql.Int, 0)
        .input('createdttm', sql.DateTime, new Date())
        .input('updatedttm', sql.DateTime, new Date())
        .query(`
          INSERT INTO hm_users (
            username, email, firstname, lastname, role,
            password, customerid, tenantid, status,
            createdttm, updatedttm
          )
          VALUES (
            @username, @email, @firstname, @lastname, @role,
            @password, @customerid, @tenantid, @status,
            @createdttm, @updatedttm
          );
          SELECT SCOPE_IDENTITY() AS userid;
        `);

      const newUserId = result.recordset[0].userid;

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        userid: newUserId
      });

    } catch (error) {
      console.error('Database Error:', error);
      return res.status(500).json({
        message: 'Error creating user',
        error: error.message
      });
    } finally {
      if (pool) {
        try {
          await pool.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  // GET-Methode für das Abrufen der Benutzerliste (vorheriger Code bleibt gleich)
  if (req.method === 'GET') {
    let pool = null;
    let users = [];

    try {
      // Erstelle eine neue Verbindung
      pool = await new sql.ConnectionPool(config).connect();

      // Zuerst die Rolle und customerid des aktuellen Benutzers holen
      const userResult = await pool.request()
        .input('userid', sql.Int, session.user.userid)
        .query(`
          SELECT role, customerid, tenantid
          FROM hm_users
          WHERE userid = @userid
        `);

      const currentUser = userResult.recordset[0];

      if (!currentUser) {
        throw new Error('Current user not found');
      }

      let query = '';
      const request = pool.request();

      if (currentUser.role === 1) { // Superadmin
        request.input('tenantid', sql.UniqueIdentifier, currentUser.tenantid);
        query = `
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
          WHERE tenantid = @tenantid
          ORDER BY username
        `;
      } else if (currentUser.role === 2) { // Customer Admin
        request.input('customerid', sql.UniqueIdentifier, currentUser.customerid);
        query = `
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
          WHERE customerid = @customerid
          ORDER BY username
        `;
      } else {
        throw new Error('Keine Berechtigung für Benutzerverwaltung');
      }

      const result = await request.query(query);
      users = result.recordset;

    } catch (error) {
      console.error('Database Error:', error);
      return res.status(500).json({ 
        message: 'Database error',
        error: error.message 
      });
    } finally {
      if (pool) {
        await pool.close();
      }
    }

    // Nach dem Schließen der Datenbankverbindung die ThingsBoard-Anfragen durchführen
    try {
      const enrichedUsers = await Promise.all(users.map(async (user) => {
        if (user.customerid) {
          try {
            const response = await fetch(`${process.env.THINGSBOARD_URL}/api/customer/${user.customerid}`, {
              headers: {
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            });

            if (response.ok) {
              const customerData = await response.json();
              return {
                ...user,
                customerName: customerData.title
              };
            }
          } catch (error) {
            console.error('Error fetching customer data:', error);
          }
          return {
            ...user,
            customerName: 'Fehler beim Laden'
          };
        }
        return user;
      }));

      return res.json({
        success: true,
        data: enrichedUsers
      });

    } catch (error) {
      console.error('ThingsBoard API Error:', error);
      return res.status(500).json({ 
        message: 'Error fetching customer data',
        error: error.message 
      });
    }
  }
} 