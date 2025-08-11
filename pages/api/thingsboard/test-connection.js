import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!session.tbToken) {
    return res.status(401).json({ error: 'ThingsBoard token not available' });
  }

  const TB_API_URL = process.env.THINGSBOARD_URL;
  if (!TB_API_URL) {
    return res.status(500).json({ error: 'THINGSBOARD_URL environment variable not set' });
  }

  try {
    // Test 1: Basic connection test
    const testResponse = await fetch(`${TB_API_URL}/api/auth/user`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `Bearer ${session.tbToken}`
      }
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      return res.status(500).json({
        error: 'ThingsBoard connection failed',
        status: testResponse.status,
        statusText: testResponse.statusText,
        details: errorText
      });
    }

    const userData = await testResponse.json();
    
    // Test 2: Try to get some basic data
    let devicesResponse;
    try {
      devicesResponse = await fetch(`${TB_API_URL}/api/customer/${session.customerid}/devices?pageSize=5&page=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      });
    } catch (deviceError) {
      // Devices test failed
    }

    // Test 3: Try multiple alarms endpoints
    let alarmsResponse;
    let alarmsEndpoint = 'none';
    let alarmsStatus = 'N/A';
    
    try {
      // Try device-specific alarms endpoint
      const testDeviceId = 'test-device-id'; // This will fail but we can see the response
      alarmsResponse = await fetch(`${TB_API_URL}/api/device/${testDeviceId}/alarms?pageSize=5&page=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      });
      
      if (alarmsResponse.status === 404) {
        // Endpoint exists but device not found - this is good!
        alarmsEndpoint = 'device-specific';
        alarmsStatus = '404 (endpoint exists)';
      } else if (alarmsResponse.status === 405) {
        // Method not allowed - try GET on query endpoint
        alarmsResponse = await fetch(`${TB_API_URL}/api/alarm/query?pageSize=5&page=0`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        });
        
        if (alarmsResponse.status === 400) {
          alarmsEndpoint = 'query-get';
          alarmsStatus = '400 (endpoint exists, bad request)';
        } else {
          alarmsEndpoint = 'query-get';
          alarmsStatus = alarmsResponse.status.toString();
        }
      } else {
        alarmsEndpoint = 'device-specific';
        alarmsStatus = alarmsResponse.status.toString();
      }
    } catch (alarmError) {
      alarmsStatus = `Error: ${alarmError.message}`;
    }

    return res.status(200).json({
      success: true,
      message: 'ThingsBoard connection successful',
      connection: {
        url: TB_API_URL,
        user: userData,
        tokenValid: true
      },
      tests: {
        user: {
          success: true,
          status: testResponse.status
        },
        devices: {
          success: devicesResponse?.ok || false,
          status: devicesResponse?.status || 'N/A'
        },
        alarms: {
          success: alarmsResponse?.ok || false,
          status: alarmsStatus,
          endpoint: alarmsEndpoint
        }
      }
    });

  } catch (error) {
    console.error('Error testing ThingsBoard connection:', error);
    return res.status(500).json({
      error: 'Failed to test ThingsBoard connection',
      details: error.message
    });
  }
} 