import { getServerSession } from 'next-auth/next';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Versuche zuerst den Bearer Token
    let tbToken = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
        tbToken = decoded.tbToken;
      } catch (err) {
        console.error('JWT verification failed:', err);
      }
    }

    // Wenn kein gültiger Bearer Token, versuche Session
    if (!tbToken) {
      const session = await getSession({ req });
      if (session?.tbToken) {
        tbToken = session.tbToken;
      }
    }

    // Wenn keine Authentifizierung gefunden wurde
    if (!tbToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { deviceIds, startTs, endTs, interval, attribute } = req.query;

    if (!deviceIds) {
      return res.status(400).json({ error: 'deviceIds parameter is required' });
    }

    if (!attribute) {
      return res.status(400).json({ error: 'attribute parameter is required' });
    }

    // Parse device IDs (comma-separated)
    const deviceIdList = deviceIds.split(',');

    // Default to last 7 days if not specified
    const endTime = endTs ? parseInt(endTs) : Date.now();
    const startTime = startTs ? parseInt(startTs) : endTime - (7 * 24 * 60 * 60 * 1000);
    // Convert interval to milliseconds (default: 1 hour = 3600000 ms)
    const aggregationInterval = interval ? parseInt(interval) : 3600000;

    const telemetryData = [];

    // Fetch telemetry for each device
    for (const deviceId of deviceIdList) {
      try {
        // Use the specified attribute directly
        const attributeKeys = [attribute];
        //console.log(`Device ${deviceId} using attribute:`, attribute);

        // Try different ThingsBoard API endpoints for historical data
        let response = null;
        let historicalData = null;
        
        // Method 1: Try with aggregation
        try {
          response = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${attributeKeys.join(',')}&startTs=${startTime}&endTs=${endTime}&interval=${aggregationInterval}&agg=AVG`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${tbToken}`,
            },
          });
          
          if (response.ok) {
            historicalData = await response.json();
            //console.log(`Device ${deviceId} got aggregated data:`, JSON.stringify(historicalData, null, 2));
          }
        } catch (error) {
          console.log(`Device ${deviceId} aggregated API failed:`, error.message);
        }
        
        // Method 2: Try with aggregation but different parameters if Method 1 failed
        if (!historicalData) {
          try {
            response = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${attributeKeys.join(',')}&startTs=${startTime}&endTs=${endTime}&interval=${aggregationInterval}&agg=AVG&limit=10000`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`,
              },
            });
            
            if (response.ok) {
              historicalData = await response.json();
              //console.log(`Device ${deviceId} got raw data:`, JSON.stringify(historicalData, null, 2));
            }
          } catch (error) {
            console.log(`Device ${deviceId} raw API failed:`, error.message);
          }
        }
        
        // Method 3: Try without time range if previous methods failed
        if (!historicalData) {
          try {
            response = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${attributeKeys.join(',')}&limit=10000`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`,
              },
            });
            
            if (response.ok) {
              historicalData = await response.json();
              //console.log(`Device ${deviceId} got all data:`, JSON.stringify(historicalData, null, 2));
            }
          } catch (error) {
            console.log(`Device ${deviceId} all data API failed:`, error.message);
          }
        }

        // If no historical data found, try current values
        if (!historicalData) {
          //console.log(`No historical data for device ${deviceId}, trying current values`);
          const currentResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${attributeKeys.join(',')}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${tbToken}`,
            },
          });
          
          if (currentResponse.ok) {
            const currentTelemetry = await currentResponse.json();
            //console.log(`Device ${deviceId} current telemetry:`, JSON.stringify(currentTelemetry, null, 2));
            
            // Process current values
            const temperatureData = currentTelemetry[attribute];
            
            if (temperatureData && temperatureData.length > 0) {
              //console.log(`Device ${deviceId} has current data for key ${attribute}`);
              
              // Create a single data point for current value
              const currentPoint = temperatureData[0];
              const formattedData = [{
                ts: currentPoint.ts,
                value: currentPoint.value
              }];

              telemetryData.push({
                deviceId,
                key: attribute,
                data: formattedData,
                isCurrentValue: true
              });
            }
          }
          
          continue;
        }

        const deviceTelemetry = historicalData;
        
        //console.log(`Device ${deviceId} telemetry response:`, JSON.stringify(deviceTelemetry, null, 2));
        
        // Process the specified attribute
        const temperatureData = deviceTelemetry[attribute];
        
        if (temperatureData && temperatureData.length > 0) {
          //console.log(`Device ${deviceId} has ${temperatureData.length} data points for key ${attribute}`);
          
          // Filter data within the time range
          const filteredData = temperatureData.filter(point => {
            const timestamp = point.ts;
            return timestamp >= startTime && timestamp <= endTime;
          });

          //console.log(`Device ${deviceId} has ${filteredData.length} data points in time range for key ${attribute}`);

          if (filteredData.length > 0) {
            // Group by hour and calculate averages
            const hourlyData = {};
            filteredData.forEach(point => {
              const date = new Date(point.ts);
              const hourKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
              
              if (!hourlyData[hourKey]) {
                hourlyData[hourKey] = {
                  values: [],
                  count: 0
                };
              }
              
              hourlyData[hourKey].values.push(point.value);
              hourlyData[hourKey].count++;
            });

            // Calculate averages for each hour
            const aggregatedData = Object.entries(hourlyData).map(([timestamp, data]) => ({
              ts: parseInt(timestamp),
              value: data.values.reduce((sum, val) => sum + val, 0) / data.count
            }));

            // Sort by timestamp
            aggregatedData.sort((a, b) => a.ts - b.ts);

            //console.log(`Device ${deviceId} aggregated to ${aggregatedData.length} hourly data points`);

            telemetryData.push({
              deviceId,
              key: attribute,
              data: aggregatedData
            });
          } else {
            console.log(`Device ${deviceId} has no data in the specified time range for key ${attribute}`);
          }
        } else {
          console.log(`Device ${deviceId} has no data for key ${attribute}`);
        }
      } catch (error) {
        console.error(`Error fetching telemetry for device ${deviceId}:`, error);
      }
    }

    //console.log('=== FINAL TELEMETRY DATA ===');
    /*console.log('Time range:', {
      start: new Date(startTime).toISOString(),
      end: new Date(endTime).toISOString(),
      interval: `${aggregationInterval}ms (${aggregationInterval/1000/60} minutes)`
    });
    console.log('Total devices processed:', deviceIdList.length);
    console.log('Devices with telemetry data:', telemetryData.length);
    console.log('Detailed telemetry data:', JSON.stringify(telemetryData, null, 2));
    */
    
    res.status(200).json({
      success: true,
      data: telemetryData,
      timeRange: {
        start: startTime,
        end: endTime,
        interval: aggregationInterval
      }
    });

  } catch (error) {
    console.error('Error in telemetry aggregation API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 