import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import sql from 'mssql';
import { withPoolRetry } from '../../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const data = await withPoolRetry(
      async (pool) => {
        const result = await pool
          .request()
          .input('userid', sql.Int, session.user.userid)
          .query(`
            SELECT role, customerid, tenantid,
              default_entry_asset_id, default_entry_override_user
            FROM hm_users
            WHERE userid = @userid
          `);

        if (result.recordset.length === 0) {
          return { notFound: true };
        }

        const row = result.recordset[0];
        return {
          notFound: false,
          role: row.role,
          customerid: row.customerid,
          tenantid: row.tenantid,
          defaultEntryAssetId: row.default_entry_asset_id
            ? String(row.default_entry_asset_id)
            : null,
          defaultEntryOverrideUser: !!row.default_entry_override_user
        };
      },
      { attempts: 3 }
    );

    if (data.notFound) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      role: data.role,
      customerid: data.customerid,
      tenantid: data.tenantid,
      defaultEntryAssetId: data.defaultEntryAssetId,
      defaultEntryOverrideUser: data.defaultEntryOverrideUser
    });
  } catch (error) {
    console.error('Database Error:', error);

    if (error.code === 'ECONNCLOSED' || error.code === 'ECONNRESET') {
      return res.status(503).json({
        message: 'Database connection lost, please try again',
        error: 'Connection closed'
      });
    }

    return res.status(500).json({
      message: 'Database error',
      error: error.message
    });
  }
}
