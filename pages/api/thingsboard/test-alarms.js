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
    console.log('Testing ThingsBoard alarms endpoints...');
    
    const results = {
      connection: {
        url: TB_API_URL,
        tokenValid: true
      },
      endpoints: {}
    };

    // Test 1: Device-specific alarms endpoint
    try {
      console.log('Testing /api/device/{id}/alarms...');
      const deviceResponse = await fetch(`${TB_API_URL}/api/device/test-device/alarms?pageSize=5&page=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      });
      
      results.endpoints['device-specific'] = {
        exists: true,
        method: 'GET',
        status: deviceResponse.status,
        statusText: deviceResponse.statusText,
        note: deviceResponse.status === 404 ? 'Endpoint exists, device not found' : 
              deviceResponse.status === 405 ? 'Method not allowed' : 
              deviceResponse.status === 401 ? 'Unauthorized' : 'Other response'
      };
    } catch (error) {
      results.endpoints['device-specific'] = {
        exists: false,
        error: error.message
      };
    }

    // Test 2: Simple alarms endpoint
    try {
      console.log('Testing /api/alarms...');
      const simpleResponse = await fetch(`${TB_API_URL}/api/alarms?pageSize=5&page=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      });
      
      results.endpoints['simple'] = {
        exists: true,
        method: 'GET',
        status: simpleResponse.status,
        statusText: simpleResponse.statusText
      };
    } catch (error) {
      results.endpoints['simple'] = {
        exists: false,
        error: error.message
      };
    }

    // Test 3: Customer alarms endpoint
    try {
      console.log('Testing /api/customer/{id}/alarms...');
      const customerResponse = await fetch(`${TB_API_URL}/api/customer/${session.customerid}/alarms?pageSize=5&page=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      });
      
      results.endpoints['customer'] = {
        exists: true,
        method: 'GET',
        status: customerResponse.status,
        statusText: customerResponse.statusText
      };
    } catch (error) {
      results.endpoints['customer'] = {
        exists: false,
        error: error.message
      };
    }

    // Test 4: Query endpoint with GET
    try {
      console.log('Testing /api/alarm/query with GET...');
      const queryGetResponse = await fetch(`${TB_API_URL}/api/alarm/query?pageSize=5&page=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      });
      
      results.endpoints['query-get'] = {
        exists: true,
        method: 'GET',
        status: queryGetResponse.status,
        statusText: queryGetResponse.statusText
      };
    } catch (error) {
      results.endpoints['query-get'] = {
        exists: false,
        error: error.message
      };
    }

    // Test 5: Query endpoint with POST
    try {
      console.log('Testing /api/alarm/query with POST...');
      const queryPostResponse = await fetch(`${TB_API_URL}/api/alarm/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        },
        body: JSON.stringify({
          pageSize: 5,
          page: 0
        })
      });
      
      results.endpoints['query-post'] = {
        exists: true,
        method: 'POST',
        status: queryPostResponse.status,
        statusText: queryPostResponse.statusText
      };
    } catch (error) {
      results.endpoints['query-post'] = {
        exists: false,
        error: error.message
      };
    }

    // Test 6: Try to get actual alarms from a real device
    try {
      console.log('Trying to get actual alarms from customer devices...');
      const devicesResponse = await fetch(`${TB_API_URL}/api/customer/${session.customerid}/devices?pageSize=1&page=0`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      });
      
      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json();
        if (devicesData.data && devicesData.data.length > 0) {
          const realDeviceId = devicesData.data[0].id.id;
          console.log('Found real device, testing alarms:', realDeviceId);
          
          const realAlarmsResponse = await fetch(`${TB_API_URL}/api/device/${realDeviceId}/alarms?pageSize=5&page=0`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${session.tbToken}`
            }
          });
          
          results.realDeviceTest = {
            deviceId: realDeviceId,
            status: realAlarmsResponse.status,
            statusText: realAlarmsResponse.statusText,
            hasAlarms: realAlarmsResponse.ok
          };
          
          if (realAlarmsResponse.ok) {
            const alarmsData = await realAlarmsResponse.json();
            results.realDeviceTest.alarmCount = alarmsData.data?.length || 0;
            results.realDeviceTest.sampleAlarm = alarmsData.data?.[0] || null;
          }
        } else {
          results.realDeviceTest = {
            error: 'No devices found for customer'
          };
        }
      } else {
        results.realDeviceTest = {
          error: `Failed to get devices: ${devicesResponse.status}`
        };
      }
    } catch (error) {
      results.realDeviceTest = {
        error: error.message
      };
    }

    console.log('Alarms test results:', results);
    return res.status(200).json(results);

  } catch (error) {
    console.error('Error testing alarms:', error);
    return res.status(500).json({
      error: 'Failed to test alarms',
      details: error.message
    });
  }
} 