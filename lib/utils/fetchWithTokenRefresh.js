import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../pages/api/auth/[...nextauth]';
import { getConnection } from '../db';
import { getThingsboardToken } from '../services/tokenRefreshService';
import sql from 'mssql';

/**
 * Fetches from ThingsBoard with automatic token refresh on 401 errors
 * @param {string} url - ThingsBoard API URL
 * @param {object} options - Fetch options
 * @param {object} session - NextAuth session object
 * @param {object} req - Request object (for session refresh)
 * @param {object} res - Response object (for session refresh)
 * @returns {Promise<Response>} API response
 */
export async function fetchWithTokenRefresh(url, options = {}, session, req = null, res = null) {
  if (!session || !session.tbToken) {
    throw new Error('No ThingsBoard token available in session');
  }

  let tbToken = session.tbToken;
  const customerId = session.user?.customerid || session.customerid;

  if (!customerId) {
    throw new Error('No customer ID found in session');
  }

  // Make initial request
  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-Authorization': `Bearer ${tbToken}`,
    }
  });

  // If token expired (401), try to refresh it
  if (response.status === 401) {
    console.log(`Token expired for customer ${customerId}, attempting refresh...`);
    
    try {
      // Get customer settings from database
      const connection = await getConnection();
      const result = await connection.request()
        .input('customer_id', sql.UniqueIdentifier, customerId)
        .query(`
          SELECT tb_username, tb_password, tb_url
          FROM customer_settings 
          WHERE customer_id = @customer_id
        `);

      if (result.recordset.length === 0) {
        throw new Error(`Customer ${customerId} not found in database`);
      }

      const customer = result.recordset[0];
      const tbUrl = (customer.tb_url || process.env.THINGSBOARD_URL).endsWith('/') 
        ? (customer.tb_url || process.env.THINGSBOARD_URL).slice(0, -1) 
        : (customer.tb_url || process.env.THINGSBOARD_URL);
      
      // Get new token
      const newToken = await getThingsboardToken(
        customer.tb_username, 
        customer.tb_password, 
        tbUrl
      );

      // Update database with new token
      const expiryDate = new Date();
      expiryDate.setMinutes(expiryDate.getMinutes() + 15);

      await connection.request()
        .input('customer_id', sql.UniqueIdentifier, customerId)
        .input('token', sql.VarChar, newToken)
        .input('expiry', sql.DateTime, expiryDate)
        .query(`
          UPDATE customer_settings 
          SET tbtoken = @token,
              tbtokenexpiry = @expiry,
              updatedttm = GETDATE()
          WHERE customer_id = @customer_id
        `);

      await connection.close();

      console.log(`✅ Token refreshed for customer ${customerId}, retrying request...`);
      
      // Update session token if possible
      if (req && res) {
        try {
          const updatedSession = await getServerSession(req, res, authOptions);
          if (updatedSession) {
            updatedSession.tbToken = newToken;
          }
        } catch (sessionError) {
          console.warn('Could not update session:', sessionError);
        }
      }
      
      // Retry the request with new token
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'X-Authorization': `Bearer ${newToken}`,
        }
      });
    } catch (refreshError) {
      console.error(`❌ Failed to refresh token for customer ${customerId}:`, refreshError);
      throw new Error(`Token refresh failed: ${refreshError.message}`);
    }
  }

  return response;
}

