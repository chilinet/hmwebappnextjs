import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import thingsboardAuth from '../auth';
import axios from 'axios';
import sql from 'mssql';

const config = {
  user: 'hmroot',
  password: '9YJLpf6CfyteKzoN',
  server: 'hmcdev01.database.windows.net',
  database: 'hmcdev',
  options: {
    encrypt: true
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Methode nicht erlaubt' });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ message: 'Customer ID erforderlich' });
    }

    // Hole die Thingsboard-Credentials des Benutzers aus der Datenbank
    await sql.connect(config);
    const result = await sql.query`
      SELECT tb_username, tb_password
      FROM hm_users
      WHERE userid = ${session.user.id}
    `;

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Keine Thingsboard-Zugangsdaten gefunden' });
    }

    const { tb_username, tb_password } = result.recordset[0];

    // Token von Thingsboard mit den Benutzer-Credentials holen
    const token = await thingsboardAuth(tb_username, tb_password);
    const headers = { 'X-Authorization': `Bearer ${token}` };
    const baseUrl = `${process.env.THINGSBOARD_URL}/api`;

    // Customer-Details von ThingsBoard abrufen
    const response = await axios.get(
      `${baseUrl}/customer/${id}`,
      { headers }
    );

    return res.json(response.data);

  } catch (error) {
    console.error('API Error:', error);
    
    // Wenn der Customer nicht gefunden wird, geben wir null zurück
    if (error.response?.status === 404) {
      return res.json(null);
    }
    
    return res.status(500).json({ 
      message: 'Fehler bei der Kommunikation mit der API',
      error: error.response?.data || error.message 
    });
  } finally {
    await sql.close();
  }
}
