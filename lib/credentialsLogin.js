import sql from 'mssql';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getConnection } from './db';

/**
 * Shared credentials check for NextAuth and mobile API.
 * @returns {Promise<object|null>} NextAuth user object or null
 */
export async function authenticateCredentials(username, password) {
  if (!username || !password) {
    return null;
  }

  try {
    const pool = await getConnection();

    const result = await pool
      .request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT 
          u.userid,
          u.username,
          u.email,
          u.password,
          u.customerid,
          u.role,
          u.status,
          u.default_entry_asset_id,
          cs.tb_username,
          cs.tb_password,
          cs.tb_url
        FROM hm_users u
        LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
        WHERE u.username = @username
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    const user = result.recordset[0];

    if (user.status === 0) {
      console.log(`Login attempt blocked: User ${username} is inactive (status: 0)`);
      return null;
    }

    if (user.status === 99) {
      console.log(`Login attempt blocked: User ${username} is locked (status: 99)`);
      return null;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return null;
    }

    let tbData = null;
    try {
      const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: user.tb_username,
          password: user.tb_password
        })
      });

      tbData = await tbResponse.json();

      if (!tbResponse.ok) {
        console.error('ThingsBoard login failed:', tbData);
        return null;
      }
    } catch (tbError) {
      console.error('ThingsBoard connection error:', tbError);
      tbData = { token: null, refreshToken: null };
    }

    const secret =
      process.env.NEXTAUTH_SECRET ||
      (process.env.NODE_ENV === 'development' ? 'development-secret-change-in-production' : undefined);
    if (!secret) {
      console.error('NEXTAUTH_SECRET is required to sign login tokens');
      return null;
    }

    return {
      id: user.userid.toString(),
      name: user.username,
      email: user.email,
      userid: user.userid,
      customerid: user.customerid,
      role: user.role,
      defaultEntryAssetId:
        user.default_entry_asset_id != null ? String(user.default_entry_asset_id) : null,
      token: jwt.sign(
        {
          username: user.username,
          userid: user.userid,
          customerid: user.customerid,
          customerId: user.customerid,
          role: user.role,
          tbToken: tbData?.token || null
        },
        secret,
        { expiresIn: '8h' }
      ),
      tbToken: tbData?.token || null,
      refreshToken: tbData?.refreshToken || null,
      tbTokenExpires: tbData?.token ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}
