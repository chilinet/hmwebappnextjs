import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import thingsboardAuth from '../thingsboard/auth';
import axios from 'axios';
import sql from 'mssql';
import { getConnection } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode nicht erlaubt' });
  }

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  try {
    const pool = await getConnection();

    let tb_username = process.env.TENNANT_THINGSBOARD_USERNAME || process.env.THINGSBOARD_USERNAME;
    let tb_password = process.env.TENNANT_THINGSBOARD_PASSWORD || process.env.THINGSBOARD_PASSWORD;

    // Use .env credentials if set; otherwise fall back to customer_settings in DB
    if (!tb_username || !tb_password) {
      const result = await pool.request()
        .input('userid', sql.Int, session.user.userid ?? session.user.id)
        .query(`
          SELECT cs.tb_username, cs.tb_password
          FROM hm_users u
          LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
          WHERE u.userid = @userid
        `);

      if (result.recordset.length === 0) {
        return res.status(401).json({ message: 'Benutzer nicht gefunden' });
      }

      const row = result.recordset[0];
      tb_username = row.tb_username;
      tb_password = row.tb_password;

      if (!tb_username || !tb_password) {
        return res.status(401).json({
          message: 'Keine Thingsboard-Zugangsdaten konfiguriert. Setzen Sie TENNANT_THINGSBOARD_USERNAME/PASSWORD (oder THINGSBOARD_USERNAME/PASSWORD) in .env oder in den Customer-Einstellungen.'
        });
      }
    }

    // Token von Thingsboard mit den Credentials holen (.env oder DB)
    const token = await thingsboardAuth(tb_username, tb_password);
    const headers = { 'X-Authorization': `Bearer ${token}` };
    const baseUrl = `${process.env.THINGSBOARD_URL}/api`;

    // Erstelle die customers-Tabelle falls sie nicht existiert
    await pool.request().query(`
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
    `);

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
        const customerId = customer.id?.id || customer.id;
        const existingCustomer = await pool.request()
          .input('id', sql.NVarChar(36), customerId)
          .query('SELECT id FROM customers WHERE id = @id');

        if (existingCustomer.recordset.length > 0) {
          // Update existierenden Customer
          await pool.request()
            .input('id', sql.NVarChar(36), customerId)
            .input('name', sql.NVarChar(255), customer.name || '')
            .input('title', sql.NVarChar(500), customer.title || '')
            .input('email', sql.NVarChar(255), customer.email || '')
            .input('phone', sql.NVarChar(50), customer.phone || '')
            .input('address', sql.NVarChar(500), customer.address || '')
            .input('address2', sql.NVarChar(500), customer.address2 || '')
            .input('city', sql.NVarChar(100), customer.city || '')
            .input('country', sql.NVarChar(100), customer.country || '')
            .input('state', sql.NVarChar(100), customer.state || '')
            .input('zip', sql.NVarChar(20), customer.zip || '')
            .input('additional_info', sql.NVarChar(sql.MAX), JSON.stringify(customer.additionalInfo || {}))
            .input('created_time', sql.BigInt, customer.createdTime || 0)
            .input('updated_time', sql.BigInt, customer.updatedTime || 0)
            .query(`
              UPDATE customers 
              SET name = @name, title = @title, email = @email, phone = @phone,
                  address = @address, address2 = @address2, city = @city, country = @country,
                  state = @state, zip = @zip, additional_info = @additional_info,
                  created_time = @created_time, updated_time = @updated_time, last_sync = GETDATE()
              WHERE id = @id
            `);
          updatedCount++;
        } else {
          // Füge neuen Customer hinzu
          await pool.request()
            .input('id', sql.NVarChar(36), customerId)
            .input('name', sql.NVarChar(255), customer.name || '')
            .input('title', sql.NVarChar(500), customer.title || '')
            .input('email', sql.NVarChar(255), customer.email || '')
            .input('phone', sql.NVarChar(50), customer.phone || '')
            .input('address', sql.NVarChar(500), customer.address || '')
            .input('address2', sql.NVarChar(500), customer.address2 || '')
            .input('city', sql.NVarChar(100), customer.city || '')
            .input('country', sql.NVarChar(100), customer.country || '')
            .input('state', sql.NVarChar(100), customer.state || '')
            .input('zip', sql.NVarChar(20), customer.zip || '')
            .input('additional_info', sql.NVarChar(sql.MAX), JSON.stringify(customer.additionalInfo || {}))
            .input('created_time', sql.BigInt, customer.createdTime || 0)
            .input('updated_time', sql.BigInt, customer.updatedTime || 0)
            .query(`
              INSERT INTO customers (
                id, name, title, email, phone, address, address2, city, country, state, zip, 
                additional_info, created_time, updated_time, last_sync
              ) VALUES (
                @id, @name, @title, @email, @phone, @address, @address2, @city, @country, @state, @zip,
                @additional_info, @created_time, @updated_time, GETDATE()
              )
            `);
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
    // Shared pool is not closed by this route
  }
}
