import sql from 'mssql'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const sqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur POST-Anfragen sind erlaubt'
    });
  }

  const { username, password } = req.body;

  console.log('Mobile login attempt:', { username, password: password ? '***' : 'missing' });

  if (!username || !password) {
    console.log('Missing credentials');
    return res.status(400).json({
      success: false,
      error: 'Missing credentials',
      message: 'Benutzername und Passwort sind erforderlich'
    });
  }

  try {
    const pool = await sql.connect(sqlConfig)
    
    // User und Settings abfragen
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT 
          u.userid,
          u.username,
          u.email,
          u.password,
          u.customerid,
          u.role,
          cs.tb_username,
          cs.tb_password,
          cs.tb_url
        FROM hm_users u
        LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
        WHERE u.username = @username
      `)

    await pool.close()

    console.log('Database query result:', result.recordset.length, 'users found');

    if (result.recordset.length === 0) {
      console.log('No user found for username:', username);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Ungültige Anmeldedaten'
      });
    }

    const user = result.recordset[0]
    console.log('User found:', { username: user.username, email: user.email, role: user.role });

    // Passwort überprüfen
    const passwordMatch = await bcrypt.compare(password, user.password)
    console.log('Password match:', passwordMatch);
    
    if (!passwordMatch) {
      console.log('Password does not match for user:', username);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Ungültige Anmeldedaten'
      });
    }

    // ThingsBoard Login
    const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: user.tb_username,
        password: user.tb_password
      })
    })

    const tbData = await tbResponse.json()
    
    if (!tbResponse.ok) {
      return res.status(401).json({
        success: false,
        error: 'ThingsBoard login failed',
        message: 'ThingsBoard-Anmeldung fehlgeschlagen'
      });
    }
    
    // JWT Token für mobile App erstellen
    const mobileToken = jwt.sign(
      { 
        username: user.username,
        userid: user.userid,
        customerid: user.customerid,
        role: user.role,
        tbToken: tbData.token,
        refreshToken: tbData.refreshToken,
      },
      process.env.NEXTAUTH_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      success: true,
      data: {
        token: mobileToken,
        user: {
          id: user.userid.toString(),
          name: user.username,
          email: user.email,
          userid: user.userid,
          customerid: user.customerid,
          role: user.role,
        },
        tbToken: tbData.token,
        refreshToken: tbData.refreshToken,
        tbTokenExpires: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }
    });

  } catch (error) {
    console.error('Mobile login error:', error)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler'
    });
  }
}
