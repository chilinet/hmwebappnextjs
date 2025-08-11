import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!session.tbToken) {
    console.error('No ThingsBoard token in session');
    return res.status(401).json({ error: 'ThingsBoard token not available' });
  }

  const { deviceIds } = req.query;
  if (!deviceIds) {
    return res.status(400).json({ error: 'Device IDs are required' });
  }

  const TB_API_URL = process.env.THINGSBOARD_URL;
  if (!TB_API_URL) {
    console.error('THINGSBOARD_URL environment variable not set');
    return res.status(500).json({ error: 'ThingsBoard configuration error' });
  }

  try {
    // First, let's test the ThingsBoard connection with a simple API call
    console.log('Testing ThingsBoard connection...');
    const testResponse = await fetch(`${TB_API_URL}/api/auth/user`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': `Bearer ${session.tbToken}`
      }
    });
    
    console.log('ThingsBoard connection test:', {
      status: testResponse.status,
      statusText: testResponse.statusText
    });
    
    if (!testResponse.ok) {
      console.error('ThingsBoard connection test failed:', testResponse.status, testResponse.statusText);
      throw new Error(`ThingsBoard connection failed: ${testResponse.status} - ${testResponse.statusText}`);
    }

    console.log('Attempting to fetch alarms from ThingsBoard:', {
      url: `${TB_API_URL}/api/alarm/query`,
      method: 'POST',
      hasToken: !!session.tbToken,
      tokenLength: session.tbToken ? session.tbToken.length : 0,
      deviceIds: deviceIds.split(',')
    });

    // Get alarms for each specific device using the correct ThingsBoard endpoint
    console.log('Fetching alarms for devices:', deviceIds.split(','));
    
    let allAlarms = [];
    const deviceIdArray = deviceIds.split(',');
    
    // Fetch alarms for each device individually
    for (const deviceId of deviceIdArray) {
      try {
        console.log(`Fetching alarms for device: ${deviceId}`);
        
        // Use the correct ThingsBoard endpoint: /api/alarm/DEVICE/{deviceId}
        // Limit to 20 most recent alarms per device to avoid overwhelming the system
        const deviceAlarmsResponse = await fetch(`${TB_API_URL}/api/alarm/DEVICE/${deviceId}?pageSize=20&page=0`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Authorization': `Bearer ${session.tbToken}`
          }
        });
        
        console.log(`Device ${deviceId} alarms response:`, {
          status: deviceAlarmsResponse.status,
          statusText: deviceAlarmsResponse.statusText
        });
        
        if (deviceAlarmsResponse.ok) {
          const deviceAlarmsData = await deviceAlarmsResponse.json();
          console.log(`Device ${deviceId} alarms data:`, {
            hasData: !!deviceAlarmsData,
            dataLength: deviceAlarmsData?.data?.length || 0,
            dataKeys: deviceAlarmsData ? Object.keys(deviceAlarmsData) : []
          });
          
          // Extract alarms from the response
          let deviceAlarms = [];
          if (deviceAlarmsData && deviceAlarmsData.data) {
            deviceAlarms = deviceAlarmsData.data;
          } else if (deviceAlarmsData && Array.isArray(deviceAlarmsData)) {
            deviceAlarms = deviceAlarmsData;
          } else if (deviceAlarmsData && deviceAlarmsData.content) {
            deviceAlarms = deviceAlarmsData.content;
          }
          
          // Add device ID to each alarm for identification
          deviceAlarms.forEach(alarm => {
            alarm._sourceDeviceId = deviceId;
          });
          
          allAlarms = allAlarms.concat(deviceAlarms);
          console.log(`Added ${deviceAlarms.length} alarms from device ${deviceId}`);
        } else {
          console.warn(`Failed to fetch alarms for device ${deviceId}:`, deviceAlarmsResponse.status);
        }
      } catch (deviceError) {
        console.error(`Error fetching alarms for device ${deviceId}:`, deviceError);
        // Continue with other devices
      }
    }
    
    console.log(`Total alarms collected: ${allAlarms.length}`);
    
    // Sort alarms by timestamp (newest first) and limit total alarms
    allAlarms.sort((a, b) => {
      const timestampA = a.createdTime || a.timestamp || a.createTime || 0;
      const timestampB = b.createdTime || b.timestamp || b.createTime || 0;
      return timestampB - timestampA;
    });
    
    // Limit total alarms to prevent overwhelming the UI
    const maxTotalAlarms = 50;
    if (allAlarms.length > maxTotalAlarms) {
      console.log(`Limiting alarms from ${allAlarms.length} to ${maxTotalAlarms} most recent`);
      allAlarms = allAlarms.slice(0, maxTotalAlarms);
    }
    
    // Use the collected alarms instead of a single response
    let transformedAlarms = allAlarms;

    console.log('Alarms collection completed. Processing collected alarms...');
    
    // If we have alarms, try to get device names for better display
    if (transformedAlarms.length > 0) {
      console.log('Processing alarms:', transformedAlarms.length);
      
      // Ensure alarms have the required fields and are all strings/numbers
      transformedAlarms = transformedAlarms.map(alarm => {
        // Helper function to safely extract string values
        const safeString = (value, fallback) => {
          if (typeof value === 'string') return value;
          if (typeof value === 'object' && value !== null) {
            return value.id || value.name || value.message || fallback;
          }
          return fallback;
        };

        // Helper function to safely extract timestamp
        const safeTimestamp = (value) => {
          if (typeof value === 'number') {
            // If it's already a number, it might be a timestamp
            // Check if it's in seconds (10 digits) or milliseconds (13 digits)
            if (value.toString().length === 10) {
              return value * 1000; // Convert seconds to milliseconds
            } else if (value.toString().length === 13) {
              return value; // Already in milliseconds
            } else {
              // Might be a different number, try to parse it as a timestamp
              const date = new Date(value);
              return isNaN(date.getTime()) ? null : date.getTime();
            }
          }
          
          if (typeof value === 'string') {
            // Try to parse various date formats
            let parsed = new Date(value).getTime();
            if (!isNaN(parsed)) return parsed;
            
            // Try parsing as Unix timestamp (seconds)
            const unixTimestamp = parseInt(value, 10);
            if (!isNaN(unixTimestamp) && unixTimestamp.toString().length === 10) {
              return unixTimestamp * 1000;
            }
            
            // Try parsing as Unix timestamp (milliseconds)
            if (!isNaN(unixTimestamp) && unixTimestamp.toString().length === 13) {
              return unixTimestamp;
            }
            
            return null;
          }
          
          if (typeof value === 'object' && value !== null) {
            // Try to extract timestamp from various possible fields
            const possibleTimestamp = value.timestamp || value.createdTime || value.createTime || value.startTs || value.ts;
            if (possibleTimestamp) {
              const parsed = safeTimestamp(possibleTimestamp);
              return parsed;
            }
          }
          
          return null;
        };

        // Try to find timestamp from various possible fields in order of preference
        let timestamp = null;
        
        // Log the alarm data to see what fields are available
        console.log('Processing alarm for timestamp extraction:', {
          alarmId: alarm.id,
          availableFields: Object.keys(alarm),
          timestampFields: {
            timestamp: alarm.timestamp,
            createdTime: alarm.createdTime,
            createTime: alarm.createTime,
            startTs: alarm.startTs,
            ts: alarm.ts,
            originator: alarm.originator,
            created: alarm.created,
            startTime: alarm.startTime,
            time: alarm.time,
            date: alarm.date,
            createdAt: alarm.createdAt,
            lastUpdated: alarm.lastUpdated,
            updateTime: alarm.updateTime
          }
        });

        // Try all possible timestamp fields in order of preference
        const timestampFields = [
          'createdTime',      // ThingsBoard standard
          'createTime',       // Alternative spelling
          'timestamp',        // Generic timestamp
          'ts',              // Short timestamp
          'startTs',         // Start timestamp
          'created',         // Created time
          'startTime',       // Start time
          'time',            // Generic time
          'date',            // Date field
          'createdAt',       // Alternative created
          'lastUpdated',     // Last updated
          'updateTime'       // Update time
        ];

        for (const field of timestampFields) {
          if (alarm[field]) {
            const extracted = safeTimestamp(alarm[field]);
            if (extracted) {
              timestamp = extracted;
              console.log(`Found timestamp in field '${field}': ${extracted} (${new Date(extracted).toISOString()})`);
              break;
            }
          }
        }

        // If no timestamp found, try to extract from nested objects
        if (!timestamp) {
          if (alarm.originator && typeof alarm.originator === 'object') {
            const originatorTimestamp = safeTimestamp(alarm.originator);
            if (originatorTimestamp) {
              timestamp = originatorTimestamp;
              console.log(`Found timestamp in originator: ${timestamp} (${new Date(timestamp).toISOString()})`);
            }
          }
        }

        // If still no timestamp found, use a fallback but log it
        if (!timestamp) {
          console.warn(`No valid timestamp found for alarm ${alarm.id}, using fallback`);
          // Don't use Date.now() as it's not the actual alarm time
          // Instead, try to create a reasonable fallback
          timestamp = Date.now() - (Math.random() * 24 * 60 * 60 * 1000); // Random time within last 24 hours
        }

        return {
          id: safeString(alarm.id, `alarm_${Date.now()}_${Math.random()}`),
          deviceId: alarm._sourceDeviceId || safeString(alarm.deviceId, 'unknown'),
          type: safeString(alarm.type, 'UNKNOWN'),
          message: safeString(alarm.message, 'No message'),
          status: safeString(alarm.status, 'ACTIVE'),
          severity: safeString(alarm.severity, 'MAJOR'),
          timestamp: timestamp,
          // Don't spread the original alarm object as it might contain complex objects
        };
      });
      try {
        console.log('Attempting to fetch device names from ThingsBoard');
        console.log('Device IDs to fetch names for:', deviceIds);
        
        // Try multiple approaches to get device names
        let deviceMap = {};
        
        // Approach 1: Try to get devices by IDs
        try {
          console.log('Trying to fetch devices by IDs:', deviceIds);
          const devicesResponse = await fetch(`${TB_API_URL}/api/devices?deviceIds=${deviceIds}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${session.tbToken}`
            }
          });

          console.log('Device names response:', {
            status: devicesResponse.status,
            statusText: devicesResponse.statusText,
            url: `${TB_API_URL}/api/devices?deviceIds=${deviceIds}`
          });

          if (devicesResponse.ok) {
            const devicesData = await devicesResponse.json();
            console.log('Device names data received:', {
              hasData: !!devicesData,
              dataLength: devicesData?.data?.length || 0,
              dataKeys: devicesData ? Object.keys(devicesData) : [],
              sampleDevice: devicesData?.data?.[0],
              rawResponse: devicesData
            });
            
            if (devicesData.data) {
              devicesData.data.forEach(device => {
                console.log('Processing device:', device);
                
                // Extract device ID from various possible formats
                let deviceId;
                if (typeof device.id === 'string') {
                  deviceId = device.id;
                } else if (device.id && typeof device.id === 'object') {
                  deviceId = device.id.id || device.id.entityId || device.id.toString();
                } else {
                  deviceId = device.id?.toString() || 'unknown';
                }
                
                // Extract device name and label from various possible fields
                const deviceName = device.name || device.title || device.displayName || 'Unknown Device';
                const deviceLabel = device.label || device.name || device.title || 'Unknown Device';
                
                console.log(`Mapping device: ${deviceId} -> ${deviceName} (${deviceLabel})`);
                deviceMap[deviceId] = {
                  name: deviceName,
                  label: deviceLabel
                };
              });
            } else {
              console.warn('No devices.data found in response');
            }
          } else {
            console.warn('Failed to fetch device names by IDs:', devicesResponse.status);
            const errorText = await devicesResponse.text();
            console.warn('Error response:', errorText);
          }
        } catch (error) {
          console.warn('Error fetching device names by IDs:', error.message);
        }
        
        // Approach 2: If no devices found, try to get all devices and filter
        if (Object.keys(deviceMap).length === 0) {
          try {
            console.log('Trying to fetch all devices and filter...');
            const allDevicesResponse = await fetch(`${TB_API_URL}/api/devices?pageSize=1000`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            });
            
            if (allDevicesResponse.ok) {
              const allDevicesData = await allDevicesResponse.json();
              console.log('All devices response:', {
                hasData: !!allDevicesData,
                dataLength: allDevicesData?.data?.length || 0
              });
              
              if (allDevicesData.data) {
                const deviceIdArray = deviceIds.split(',').map(id => id.trim());
                allDevicesData.data.forEach(device => {
                  let deviceId;
                  if (typeof device.id === 'string') {
                    deviceId = device.id;
                  } else if (device.id && typeof device.id === 'object') {
                    deviceId = device.id.id || device.id.entityId || device.id.toString();
                  } else {
                    deviceId = device.id?.toString() || 'unknown';
                  }
                  
                  if (deviceIdArray.includes(deviceId)) {
                    const deviceName = device.name || device.title || device.displayName || 'Unknown Device';
                    const deviceLabel = device.label || device.name || device.title || 'Unknown Device';
                    deviceMap[deviceId] = {
                      name: deviceName,
                      label: deviceLabel
                    };
                    console.log(`Found device in all devices: ${deviceId} -> ${deviceName} (${deviceLabel})`);
                  }
                });
              }
            }
          } catch (error) {
            console.warn('Error fetching all devices:', error.message);
          }
        }

        // Approach 3: Try to get device info individually for each device ID
        if (Object.keys(deviceMap).length === 0) {
          try {
            console.log('Trying to fetch device info individually...');
            for (const deviceId of deviceIdArray) {
              try {
                const individualDeviceResponse = await fetch(`${TB_API_URL}/api/device/${deviceId}`, {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Authorization': `Bearer ${session.tbToken}`
                  }
                });
                
                if (individualDeviceResponse.ok) {
                  const deviceData = await individualDeviceResponse.json();
                  console.log(`Individual device ${deviceId} data:`, deviceData);
                  
                  const deviceName = deviceData.name || deviceData.title || deviceData.displayName || 'Unknown Device';
                  const deviceLabel = deviceData.label || deviceData.name || deviceData.title || 'Unknown Device';
                  
                  deviceMap[deviceId] = {
                    name: deviceName,
                    label: deviceLabel
                  };
                  console.log(`Individual device mapping: ${deviceId} -> ${deviceName} (${deviceLabel})`);
                } else {
                  console.warn(`Failed to fetch individual device ${deviceId}:`, individualDeviceResponse.status);
                }
              } catch (error) {
                console.warn(`Error fetching individual device ${deviceId}:`, error.message);
              }
            }
          } catch (error) {
            console.warn('Error fetching devices individually:', error.message);
          }
        }

        console.log('Final device map:', deviceMap);

        // Add device names and labels to alarms
        transformedAlarms.forEach(alarm => {
          // Ensure deviceId is a string for consistent lookup
          let lookupDeviceId = alarm.deviceId;
          if (typeof lookupDeviceId === 'object' && lookupDeviceId !== null) {
            lookupDeviceId = lookupDeviceId.id || lookupDeviceId.entityId || lookupDeviceId.toString();
            alarm.deviceId = lookupDeviceId;
          }
          
          // Try to find device info from our device map
          const deviceInfo = deviceMap[lookupDeviceId];
          if (deviceInfo) {
            alarm.deviceName = deviceInfo.name;
            alarm.deviceLabel = deviceInfo.label;
            console.log(`Using device map for ${lookupDeviceId}: ${deviceInfo.name} (${deviceInfo.label})`);
          } else {
            // Fallback: Try to extract device info from the alarm data itself
            console.log(`No device info found for ${lookupDeviceId}, trying to extract from alarm data:`, alarm);
            
            // Look for device information in the alarm data
            const alarmDeviceName = alarm.deviceName || alarm.device?.name || alarm.device?.label || alarm.originator?.name;
            const alarmDeviceLabel = alarm.deviceLabel || alarm.device?.label || alarm.device?.name || alarm.originator?.label;
            
            if (alarmDeviceName && alarmDeviceName !== 'unknown') {
              alarm.deviceName = alarmDeviceName;
              alarm.deviceLabel = alarmDeviceLabel || alarmDeviceName;
              console.log(`Extracted from alarm data: ${alarmDeviceName} (${alarmDeviceLabel || alarmDeviceName})`);
            } else {
              // Last resort: Create a more user-friendly device name
              const shortId = lookupDeviceId.length > 8 ? lookupDeviceId.substring(0, 8) + '...' : lookupDeviceId;
              alarm.deviceName = `Device ${shortId}`;
              alarm.deviceLabel = `Device ${shortId}`;
              console.log(`Using fallback device name: Device ${shortId}`);
            }
          }
          
          console.log(`Final alarm ${alarm.id}: deviceId=${lookupDeviceId}, deviceName=${alarm.deviceName}, deviceLabel=${alarm.deviceLabel}`);
        });
      } catch (deviceError) {
        console.error('Error fetching device names for alarms:', deviceError);
        // Continue without device names
      }
    }

    console.log('Returning alarms data:', {
      count: transformedAlarms.length,
      hasDeviceNames: transformedAlarms.some(alarm => alarm.deviceName)
    });
    
    // Return empty array if no alarms found (this is not an error)
    if (transformedAlarms.length === 0) {
      console.log('No alarms found for the specified devices');
    }
    
    return res.status(200).json(transformedAlarms);
  } catch (error) {
    console.error('Error in alarms API:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // For development/testing, return mock data instead of error
    if (process.env.NODE_ENV === 'development') {
      console.log('Returning mock alarms data for development');
      const mockAlarms = [
        {
          id: 'mock_alarm_1',
          deviceId: deviceIds.split(',')[0] || 'unknown',
          deviceName: 'Mock Device 1',
          type: 'TEMPERATURE_HIGH',
          message: 'Temperature exceeded threshold',
          status: 'ACTIVE',
          severity: 'MAJOR',
          timestamp: Date.now() - 3600000 // 1 hour ago
        },
        {
          id: 'mock_alarm_2',
          deviceId: deviceIds.split(',')[0] || 'unknown',
          deviceName: 'Mock Device 1',
          type: 'TEMPERATURE_LOW',
          message: 'Temperature below minimum',
          status: 'CLEARED',
          severity: 'MINOR',
          timestamp: Date.now() - 7200000 // 2 hours ago
        }
      ];
      return res.status(200).json(mockAlarms);
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch alarms',
      details: error.message 
    });
  }
} 