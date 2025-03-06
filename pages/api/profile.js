import { getSession } from 'next-auth/react'
import jwt from 'jsonwebtoken'
import sql from 'mssql';

const JWT_SECRET = process.env.NEXTAUTH_SECRET

const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: true
  }
};

export default async function handler(req, res) {
  // Erst prüfen ob eine NextAuth Session existiert
  const session = await getSession({ req })
  let username

  if (!session) {
      // Wenn keine Session, dann nach Bearer Token suchen
    // console.log('No session found');

    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const token = authHeader.split(' ')[1]
    
    try {
      // Token validieren und userid extrahieren
      const decoded = jwt.verify(token, JWT_SECRET)
      username = decoded.username // Nehme den  username aus dem Token
      // console.log('Decoded Token:', decoded);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' })
    }
  } else {
      // console.log('Session found');
     // console.log('Session:', session);
     // console.log('Session user:', session.user);
      username = session.user.name // Nehme die ID aus der Session
  }

  // Ab hier ist der Zugriff authentifiziert
  // Entweder durch Session oder validen Token
  try {
    await sql.connect(config);
   // console.log('Processing request for username:', username);

    switch (req.method) {
      case 'GET':
        // Erst User-Daten aus SQL holen
        const result = await sql.query`
          SELECT 
            userid,
            username,
            email,
            role,
            customerid,
            firstname,
            lastname,
            tb_username,
            tb_password,
            createdttm,
            updatedttm
          FROM hm_users 
          WHERE username = ${username}
        `;

        if (result.recordset.length === 0) {
          return res.status(404).json({ 
            success: false, 
            error: 'User not found'
          });
        }

        const user = result.recordset[0];

        // Wenn ein Customer ID vorhanden ist, hole die Daten von ThingsBoard
        let customerName = null;
        if (user.customerid) {
          const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/customer/${user.customerid}`, {
            headers: {
              'X-Authorization': `Bearer ${session?.tbToken || decoded.tbToken}`
            }
          });

          if (tbResponse.ok) {
            const customerData = await tbResponse.json();
            customerName = customerData.title;
          }
        }
        
        res.status(200).json({
          success: true,
          data: {
            id: user.userid,
            username: user.username,
            email: user.email,
            rolle: user.role,
            customerid: user.customerid,
            customerName: customerName,
            firstName: user.firstname,
            lastName: user.lastname,
            tbUsername: user.tb_username,
            createdAt: user.createdttm,
            updatedAt: user.updatedttm
          }
        });
        break;

      case 'PUT':
        // Benutzerdaten aktualisieren
        const { email, firstName, lastName } = req.body;

        await sql.query`
          UPDATE hm_users
          SET 
            email = ${email},
            firstname = ${firstName},
            lastname = ${lastName},
            updatedttm = GETDATE()
          WHERE username = ${username}
        `;

        return res.json({ message: 'Profil erfolgreich aktualisiert' });

      default:
        res.setHeader('Allow', ['GET', 'PUT']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Profile error:', error)
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    })
  } finally {
    await sql.close();
  }
} 