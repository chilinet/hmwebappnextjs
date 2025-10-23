import { getThingsboardToken } from '../services/tokenRefreshService';
import { getConnection } from '../db';
import sql from 'mssql';

/**
 * Helper function to make ThingsBoard API calls with automatic token refresh
 * @param {string} url - ThingsBoard API URL
 * @param {object} options - Fetch options
 * @param {string} customerId - Customer ID for token refresh
 * @returns {Promise<Response>} API response
 */
export async function makeThingsBoardRequest(url, options, customerId) {
  let connection = null;
  let currentToken = null;
  
  try {
    // Get current token from database
    connection = await getConnection();
    const result = await connection.request()
      .input('customer_id', sql.UniqueIdentifier, customerId)
      .query(`
        SELECT tbtoken, tb_username, tb_password, tb_url, tbtokenexpiry
        FROM customer_settings 
        WHERE customer_id = @customer_id
      `);

    if (result.recordset.length === 0) {
      throw new Error(`Customer ${customerId} not found in database`);
    }

    const customer = result.recordset[0];
    currentToken = customer.tbtoken;

    if (!currentToken) {
      throw new Error(`No token found for customer ${customerId}`);
    }

    // Make initial request with current token
    let response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-Authorization': `Bearer ${currentToken}`,
      }
    });

    // If token expired (401), try to refresh it
    if (response.status === 401) {
      console.log(`Token expired for customer ${customerId}, attempting refresh...`);
      
      const tbUrl = customer.tb_url.endsWith('/') ? customer.tb_url.slice(0, -1) : customer.tb_url;
      
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

      console.log(`✅ Token refreshed for customer ${customerId}, retrying request...`);
      
      // Retry the request with new token
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'X-Authorization': `Bearer ${newToken}`,
        }
      });
    }

    return response;

  } catch (error) {
    console.error(`❌ Failed to make ThingsBoard request for customer ${customerId}:`, error);
    throw error;
  } finally {
    // Ensure connection is properly closed
    if (connection) {
      try {
        await connection.close();
      } catch (closeError) {
        console.log('Connection close error (ignored):', closeError.message);
      }
    }
  }
}
