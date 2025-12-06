import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import thingsboardAuth from './auth';
import axios from 'axios';
import sql from 'mssql';

const config = {
  user: 'hmroot',
  password: '9YJLpf6CfyteKzoN',
  server: 'hmcdev01.database.windows.net',
  database: 'hmcdev',
  options: {
    encrypt: !isLocalConnection, // Disable encryption for local connections
    trustServerCertificate: true
  }
};

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  try {
    // Hole die Thingsboard-Credentials über customerid aus customer_settings
    await sql.connect(config);
    const result = await sql.query`
      SELECT 
        u.customerid,
        cs.tb_username,
        cs.tb_password
      FROM hm_users u
      LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
      WHERE u.userid = ${session.user.id}
    `;

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Benutzer nicht gefunden' });
    }

    const { customerid, tb_username, tb_password } = result.recordset[0];

    // Prüfe ob ThingsBoard Credentials vorhanden sind
    if (!tb_username || !tb_password) {
      return res.status(401).json({ 
        message: 'Keine Thingsboard-Zugangsdaten für diesen Customer konfiguriert' 
      });
    }

    // Token von Thingsboard mit den Customer-Credentials holen
    const token = await thingsboardAuth(tb_username, tb_password);
    const headers = { 'X-Authorization': `Bearer ${token}` };
    const baseUrl = `${process.env.THINGSBOARD_URL}/api`;

    switch (req.method) {
      case 'GET':
        // Kunden auslesen
        const response = await axios.get(
          `${baseUrl}/customers?pageSize=100&page=0`,
          { headers }
        );
        return res.json(response.data);

      case 'POST':
        // Neuen Kunden anlegen
        const newCustomer = await axios.post(
          `${baseUrl}/customer`,
          req.body,
          { headers }
        );
        return res.json(newCustomer.data);

      case 'PUT':
        // Kunden aktualisieren
        const updatedCustomer = await axios.post(
          `${baseUrl}/customer`,
          req.body,
          { headers }
        );
        return res.json(updatedCustomer.data);

      case 'DELETE':
        // Kunden löschen
        const { customerId } = req.query;
        await axios.delete(
          `${baseUrl}/customer/${customerId}`,
          { headers }
        );
        return res.json({ message: 'Kunde erfolgreich gelöscht' });

      default:
        return res.status(405).json({ message: 'Methode nicht erlaubt' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      message: 'Fehler bei der Kommunikation mit der API',
      error: error.response?.data || error.message 
    });
  } finally {
    await sql.close();
  }
} 