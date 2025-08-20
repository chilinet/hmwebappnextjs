import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import thingsboardAuth from '../thingsboard/auth';
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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode nicht erlaubt' });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  try {
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

    // Erstelle die customers-Tabelle falls sie nicht existiert
    await sql.query`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='customers' AND xtype='U')
      CREATE TABLE customers (
        id NVARCHAR(36) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        title NVARCHAR(500),
        email NVARCHAR(255),
        phone NVARCHAR(50),
        address NVARCHAR(500),
        address2 NVARCHAR(500),
        city NVARCHAR(100),
        country NVARCHAR(100),
        state NVARCHAR(100),
        zip NVARCHAR(20),
        additional_info NVARCHAR(MAX),
        created_time BIGINT,
        updated_time BIGINT,
        last_sync DATETIME2 DEFAULT GETDATE()
      )
    `;

    // Hole alle Customers von ThingsBoard
    const response = await axios.get(
      `${baseUrl}/customers?pageSize=1000&page=0`,
      { headers }
    );

    const customers = response.data.data || response.data || [];
    let syncedCount = 0;
    let updatedCount = 0;
    let insertedCount = 0;

    // Synchronisiere jeden Customer
    for (const customer of customers) {
      try {
        // Prüfe ob Customer bereits existiert
        const existingCustomer = await sql.query`
          SELECT id FROM customers WHERE id = ${customer.id.id || customer.id}
        `;

        if (existingCustomer.recordset.length > 0) {
          // Update existierenden Customer
          await sql.query`
            UPDATE customers 
            SET name = ${customer.name || ''},
                title = ${customer.title || ''},
                email = ${customer.email || ''},
                phone = ${customer.phone || ''},
                address = ${customer.address || ''},
                address2 = ${customer.address2 || ''},
                city = ${customer.city || ''},
                country = ${customer.country || ''},
                state = ${customer.state || ''},
                zip = ${customer.zip || ''},
                additional_info = ${JSON.stringify(customer.additionalInfo || {})},
                created_time = ${customer.createdTime || 0},
                updated_time = ${customer.updatedTime || 0},
                last_sync = GETDATE()
            WHERE id = ${customer.id.id || customer.id}
          `;
          updatedCount++;
        } else {
          // Füge neuen Customer hinzu
          await sql.query`
            INSERT INTO customers (
              id, name, title, email, phone, address, address2, city, country, state, zip, 
              additional_info, created_time, updated_time, last_sync
            ) VALUES (
              ${customer.id.id || customer.id},
              ${customer.name || ''},
              ${customer.title || ''},
              ${customer.email || ''},
              ${customer.phone || ''},
              ${customer.address || ''},
              ${customer.address2 || ''},
              ${customer.city || ''},
              ${customer.country || ''},
              ${customer.state || ''},
              ${customer.zip || ''},
              ${JSON.stringify(customer.additionalInfo || {})},
              ${customer.createdTime || 0},
              ${customer.updatedTime || 0},
              GETDATE()
            )
          `;
          insertedCount++;
        }
        syncedCount++;
      } catch (error) {
        console.error(`Fehler beim Synchronisieren von Customer ${customer.id}:`, error);
      }
    }

    return res.json({
      message: 'Customer-Synchronisation abgeschlossen',
      total: customers.length,
      synced: syncedCount,
      inserted: insertedCount,
      updated: updatedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sync Error:', error);
    return res.status(500).json({ 
      message: 'Fehler bei der Customer-Synchronisation',
      error: error.response?.data || error.message 
    });
  } finally {
    await sql.close();
  }
}
