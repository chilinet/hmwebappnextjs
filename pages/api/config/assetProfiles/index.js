import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';

async function refreshThingsBoardToken(session) {
  try {
    // Get user data from database to get ThingsBoard credentials
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('userid', sql.Int, session.user.userid)
      .query(`
        SELECT u.customerid, cs.tb_username, cs.tb_password, cs.tb_url
        FROM hm_users u
        LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
        WHERE u.userid = @userid
      `);

    if (userResult.recordset.length === 0 || !userResult.recordset[0].tb_username) {
      throw new Error('User or ThingsBoard credentials not found');
    }

    const userData = userResult.recordset[0];
    const tbUrl = userData.tb_url || process.env.THINGSBOARD_URL;
    
    // ThingsBoard Login durchführen
    const tbResponse = await fetch(
      `${tbUrl}/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: userData.tb_username,
          password: userData.tb_password
        }),
      }
    );

    if (!tbResponse.ok) {
      throw new Error('ThingsBoard login failed');
    }

    const tbData = await tbResponse.json();
    return tbData.token;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const TB_API_URL = process.env.THINGSBOARD_URL;
    let tbToken = session.tbToken;
    
    // Make initial request
    let response = await fetch(`${TB_API_URL}/api/assetProfiles?pageSize=100&page=0`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `Bearer ${tbToken}`
      }
    });

    // If token expired (401), try to refresh it and retry
    if (response.status === 401) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      let errorJson = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, ignore
      }
      
      // Check if it's a token expiration error
      if (errorJson?.message === 'Token has expired' || errorText.includes('Token has expired')) {
        console.log('Token expired, attempting refresh...');
        
        try {
          // Refresh token
          tbToken = await refreshThingsBoardToken(session);
          console.log('✅ Token refreshed successfully, retrying request...');
          
          // Retry the request with new token
          response = await fetch(`${TB_API_URL}/api/assetProfiles?pageSize=100&page=0`, {
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${tbToken}`
            }
          });
        } catch (refreshError) {
          console.error('Failed to refresh token:', refreshError);
          throw new Error(`Token refresh failed: ${refreshError.message}`);
        }
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error(`ThingsBoard API error (${response.status}):`, errorText);
      throw new Error(`Error fetching asset profiles: ${response.status} ${response.statusText || 'Unknown error'} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Error in asset profiles API:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to fetch asset profiles',
      details: error.message,
      type: error.name
    });
  }
} 