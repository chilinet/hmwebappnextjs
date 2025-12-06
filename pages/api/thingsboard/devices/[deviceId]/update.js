import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import thingsboardAuth from '../../auth';
import axios from 'axios';
import sql from 'mssql';

// Determine if this is a local connection
const isLocalConnection = (process.env.MSSQL_SERVER || 'hmcdev01.database.windows.net') === '127.0.0.1' || 
                          (process.env.MSSQL_SERVER || 'hmcdev01.database.windows.net') === 'localhost' ||
                          (process.env.MSSQL_SERVER || 'hmcdev01.database.windows.net')?.includes('localhost');

const config = {
  user: process.env.MSSQL_USER || 'hmroot',
  password: process.env.MSSQL_PASSWORD || '9YJLpf6CfyteKzoN',
  server: process.env.MSSQL_SERVER || 'hmcdev01.database.windows.net',
  database: process.env.MSSQL_DATABASE || 'hmcdev',
  options: {
    encrypt: !isLocalConnection, // Disable encryption for local connections
    trustServerCertificate: true
  }
};

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ message: 'Methode nicht erlaubt' });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  try {
    const { deviceId } = req.query;
    const { customerId, deviceData } = req.body;

    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID erforderlich' });
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

    // Hole aktuelle Geräteinformationen von ThingsBoard
    const deviceResponse = await axios.get(
      `${baseUrl}/device/${deviceId}`,
      { headers }
    );

    if (!deviceResponse.ok) {
      return res.status(404).json({ message: 'Gerät in ThingsBoard nicht gefunden' });
    }

    const currentDevice = deviceResponse.data;

    // Aktualisiere die Customer-Zuordnung
    if (customerId) {
      // Hole Customer-Informationen
      const customerResponse = await axios.get(
        `${baseUrl}/customer/${customerId}`,
        { headers }
      );

      if (customerResponse.status !== 200) {
        return res.status(400).json({ message: 'Customer in ThingsBoard nicht gefunden' });
      }

      const customer = customerResponse.data;

      // Aktualisiere das Gerät mit der neuen Customer-Zuordnung
      const updateData = {
        ...currentDevice,
        customerId: {
          id: customer.id.id || customer.id,
          entityType: 'CUSTOMER'
        }
      };

      // Sende Update an ThingsBoard
      const updateResponse = await axios.post(
        `${baseUrl}/device`,
        updateData,
        { headers }
      );

      if (updateResponse.status !== 200) {
        throw new Error(`ThingsBoard Update fehlgeschlagen: ${updateResponse.statusText}`);
      }

      console.log(`Gerät ${deviceId} erfolgreich in ThingsBoard auf Customer ${customerId} aktualisiert`);
    }

    // Aktualisiere auch andere Geräteeigenschaften falls vorhanden
    if (deviceData) {
      const updateData = {
        ...currentDevice,
        ...deviceData
      };

      // Sende Update an ThingsBoard
      const updateResponse = await axios.post(
        `${baseUrl}/device`,
        updateData,
        { headers }
      );

      if (updateResponse.status !== 200) {
        throw new Error(`ThingsBoard Update fehlgeschlagen: ${updateResponse.statusText}`);
      }
    }

    return res.json({
      message: 'Gerät erfolgreich in ThingsBoard aktualisiert',
      deviceId: deviceId,
      customerId: customerId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('ThingsBoard Update Error:', error);
    return res.status(500).json({ 
      message: 'Fehler beim Aktualisieren des Geräts in ThingsBoard',
      error: error.response?.data || error.message 
    });
  } finally {
    await sql.close();
  }
}
