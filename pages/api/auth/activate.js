import sql from 'mssql';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token und Passwort sind erforderlich' });
  }

  // SQL-Konfiguration innerhalb der Handler-Funktion
  const config = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    database: process.env.MSSQL_DATABASE,
    server: process.env.MSSQL_SERVER,
    options: {
      encrypt: !isLocalConnection, // Disable encryption for local connections
      trustServerCertificate: true // Hinzugefügt
    }
  };

  let pool;
  try {
    pool = await sql.connect(config);

    // Prüfe ob der Token existiert und gültig ist
    const result = await pool.request()
      .input('token', sql.VarChar, token)
      .query(`
        SELECT userid
        FROM hm_users
        WHERE activationlink = @token
        AND status = 0
      `);

    if (result.recordset.length === 0) {
      return res.status(400).json({ 
        message: 'Ungültiger oder bereits verwendeter Aktivierungslink' 
      });
    }

    const userId = result.recordset[0].userid;

    // Hash das neue Passwort
    const hashedPassword = await bcrypt.hash(password, 10);

    // Aktualisiere den Benutzer
    await pool.request()
      .input('hashedPassword', sql.VarChar, hashedPassword)
      .input('userId', sql.Int, userId)
      .query(`
        UPDATE hm_users
        SET 
          password = @hashedPassword,
          status = 1,
          activationlink = NULL
        WHERE userid = @userId
      `);

    return res.status(200).json({ 
      success: true,
      message: 'Account erfolgreich aktiviert' 
    });

  } catch (error) {
    console.error('Activation Error:', error);
    return res.status(500).json({ 
      message: 'Fehler bei der Aktivierung',
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