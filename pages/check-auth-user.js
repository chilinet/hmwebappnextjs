require('dotenv').config();
const sql = require('mssql');
const bcrypt = require('bcryptjs');

const isLocal = process.env.MSSQL_SERVER === '127.0.0.1' || process.env.MSSQL_SERVER === 'localhost';
const config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: { encrypt: !isLocal, trustServerCertificate: true }
};

(async () => {
  try {
    const pool = await sql.connect(config);
    console.log('DB connection: OK');
    const r = await pool.request()
      .input('username', sql.NVarChar, 'Anders')
      .query("SELECT userid, username, password, status FROM hm_users WHERE username = @username");
    await pool.close();
    if (r.recordset.length === 0) {
      console.log('User Anders: NOT FOUND');
      return;
    }
    const u = r.recordset[0];
    const pwd = (u.password || '').trim();
    console.log('User Anders: FOUND');
    console.log('password length:', pwd.length);
    console.log('password starts with:', pwd.substring(0, 7) + '...');
    console.log('status:', u.status);
    console.log('bcrypt.compare(Start$12345, stored):', bcrypt.compareSync('Start$12345', pwd));
  } catch (e) {
    console.error('DB error:', e.message);
  }
})();