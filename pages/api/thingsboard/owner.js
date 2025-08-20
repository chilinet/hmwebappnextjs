import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check authentication
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, customerId, deviceId } = req.query;
    
    // Validate required parameters
    if (!type || !customerId || !deviceId) {
      return res.status(400).json({ error: 'Missing required parameters: type, customerId, deviceId' });
    }
    
    // Validate type parameter
    if (!['TENANT', 'CUSTOMER'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be TENANT or CUSTOMER' });
    }

    // Check if THINGSBOARD_URL is configured
    if (!process.env.THINGSBOARD_URL) {
      return res.status(500).json({ error: 'THINGSBOARD_URL environment variable not set' });
    }

    // Get ThingsBoard token from session or context
    let tbToken;
    try {
      const tokenResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/thingsboard/auth`);
      if (!tokenResponse.ok) {
        throw new Error('Failed to get ThingsBoard token');
      }
      const tokenData = await tokenResponse.json();
      tbToken = tokenData.token;
    } catch (error) {
      console.error('Error getting ThingsBoard token:', error);
      return res.status(500).json({ error: 'Failed to get ThingsBoard authentication token' });
    }

    // Make request to ThingsBoard
    const thingsboardUrl = `${process.env.THINGSBOARD_URL}/api/owner/${type}/${customerId}/DEVICE/${deviceId}`;
    
    console.log(`Making ThingsBoard request to: ${thingsboardUrl}`);
    
    const response = await fetch(thingsboardUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Authorization': `Bearer ${tbToken}`
      },
      body: JSON.stringify([]) // Empty array as per the API specification
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ThingsBoard API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: `ThingsBoard API error: ${response.status}`,
        details: errorText
      });
    }

    const result = await response.json();
    
    return res.status(200).json({
      success: true,
      message: `Device ${deviceId} successfully assigned to ${type} ${customerId}`,
      data: result
    });

  } catch (error) {
    console.error('Error in owner API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
