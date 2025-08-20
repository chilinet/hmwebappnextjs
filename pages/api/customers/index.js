import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { getConnection } from '../../../lib/db';
import sql from 'mssql';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ message: 'Nicht authentifiziert' });
  }

  switch (req.method) {
    case 'GET':
      try {
        const pool = await getConnection();
        const result = await pool.request()
          .query(`
            SELECT id, name, title, email, phone, address, address2, city, country, state, zip, 
                   additional_info, created_time, updated_time, last_sync
            FROM customers
            ORDER BY name ASC
          `);
        
        res.status(200).json(result.recordset);
      } catch (error) {
        console.error('GET Error:', error);
        res.status(500).json({ error: error.message });
      }
      break;

    case 'POST':
      try {
        const { id, name, title, email, phone, address, address2, city, country, state, zip, additional_info } = req.body;
        
        if (!id || !name) {
          return res.status(400).json({ message: 'ID und Name sind erforderlich' });
        }

        const pool = await getConnection();
        await pool.request()
          .input('id', sql.NVarChar, id)
          .input('name', sql.NVarChar, name)
          .input('title', sql.NVarChar, title || '')
          .input('email', sql.NVarChar, email || '')
          .input('phone', sql.NVarChar, phone || '')
          .input('address', sql.NVarChar, address || '')
          .input('address2', sql.NVarChar, address2 || '')
          .input('city', sql.NVarChar, city || '')
          .input('country', sql.NVarChar, country || '')
          .input('state', sql.NVarChar, state || '')
          .input('zip', sql.NVarChar, zip || '')
          .input('additional_info', sql.NVarChar, JSON.stringify(additional_info || {}))
          .query(`
            IF EXISTS (SELECT 1 FROM customers WHERE id = @id)
              UPDATE customers 
              SET name = @name, title = @title, email = @email, phone = @phone,
                  address = @address, address2 = @address2, city = @city, country = @country,
                  state = @state, zip = @zip, additional_info = @additional_info, last_sync = GETDATE()
              WHERE id = @id
            ELSE
              INSERT INTO customers (id, name, title, email, phone, address, address2, city, country, state, zip, additional_info, last_sync)
              VALUES (@id, @name, @title, @email, @phone, @address, @address2, @city, @country, @state, @zip, @additional_info, GETDATE())
          `);

        res.status(200).json({ message: 'Customer erfolgreich gespeichert' });
      } catch (error) {
        console.error('POST Error:', error);
        res.status(500).json({ error: error.message });
      }
      break;

    default:
      res.status(405).json({ message: 'Methode nicht erlaubt' });
  }
}
