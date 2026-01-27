import sql from 'mssql';
import bcrypt from 'bcryptjs';

// Determine if this is a local connection
const isLocalConnection = process.env.MSSQL_SERVER === '127.0.0.1' || 
                          process.env.MSSQL_SERVER === 'localhost' ||
                          process.env.MSSQL_SERVER?.includes('localhost');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token und Passwort sind erforderlich' });
  }

  // Validate and sanitize token
  const sanitizedToken = String(token).trim();
  if (!sanitizedToken || sanitizedToken.length === 0) {
    return res.status(400).json({ message: 'Ungültiger Token' });
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
    // Verwende VarChar mit maximaler Länge (500 sollte für JWT-Tokens ausreichen)
    const result = await pool.request()
      .input('token', sql.VarChar(500), sanitizedToken)
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
    // Verwende VarChar mit maximaler Länge für das gehashte Passwort (bcrypt erzeugt 60 Zeichen)
    await pool.request()
      .input('hashedPassword', sql.VarChar(255), hashedPassword)
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
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      number: error.number,
      originalError: error.originalError?.message
    });
    
    // Spezifische Fehlermeldungen für bekannte SQL-Fehler
    let errorMessage = 'Fehler bei der Aktivierung';
    if (error.message && error.message.includes('pattern')) {
      errorMessage = 'Ungültiger Token-Format. Bitte verwenden Sie den Link aus der E-Mail.';
    } else if (error.message && error.message.includes('string')) {
      errorMessage = 'Ungültiger Token. Bitte verwenden Sie den Link aus der E-Mail.';
    } else if (error.originalError) {
      errorMessage = error.originalError.message || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return res.status(500).json({ 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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