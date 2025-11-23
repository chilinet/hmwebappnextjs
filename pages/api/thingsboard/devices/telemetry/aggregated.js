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

    const { deviceIds, startTs, endTs, interval, attribute, limit = '100' } = req.query;

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
    // Parse limit parameter (default: 100 data points)
    const maxDataPoints = parseInt(limit) || 100;

    const telemetryData = [];

    // Fetch telemetry for each device
    for (const deviceId of deviceIdList) {
      try {
        // Use the specified attribute directly
        const attributeKeys = [attribute];

        // Try different ThingsBoard API endpoints for historical data
        let response = null;
        let historicalData = null;
        
        // Method 1: Try with aggregation and limit (only for numeric attributes)
        // Skip aggregation for text attributes like signalQuality
        const isTextAttribute = attribute === 'signalQuality' || attribute === 'raw' || attribute === 'hall_sensor_state';
        if (!isTextAttribute) {
          try {
            response = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${attributeKeys.join(',')}&startTs=${startTime}&endTs=${endTime}&interval=${aggregationInterval}&agg=AVG&limit=${maxDataPoints}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`,
              },
            });
            
            if (response.ok) {
              historicalData = await response.json();
            }
          } catch (error) {
            // Aggregated API failed, continue to fallback
          }
        }
        
        // Method 2: Try with limit but without aggregation if Method 1 failed
        if (!historicalData) {
          try {
            response = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${attributeKeys.join(',')}&startTs=${startTime}&endTs=${endTime}&limit=${maxDataPoints}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`,
              },
            });
            
            if (response.ok) {
              historicalData = await response.json();
            }
          } catch (error) {
            // Raw API failed, continue to fallback
          }
        }
        
        // Method 3: Try with limit but without time range if previous methods failed
        if (!historicalData) {
          try {
            response = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${attributeKeys.join(',')}&limit=${maxDataPoints}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`,
              },
            });
            
            if (response.ok) {
              historicalData = await response.json();
            }
          } catch (error) {
            // All data API failed
          }
        }

        // Method 4: For text attributes, try the latest values endpoint
        if (!historicalData && isTextAttribute) {
          try {
            response = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/latest?keys=${attributeKeys.join(',')}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`,
              },
            });
            
            if (response.ok) {
              const latestData = await response.json();
              console.log(`[hall_sensor_state] Latest data for device ${deviceId}:`, latestData);
              // Convert latest values format to timeseries format
              if (latestData && latestData[attribute]) {
                historicalData = {
                  [attribute]: [{
                    ts: latestData[attribute].ts,
                    value: latestData[attribute].value
                  }]
                };
                console.log(`[hall_sensor_state] Converted historicalData:`, historicalData);
              } else {
                console.log(`[hall_sensor_state] No data found in latestData for attribute ${attribute}:`, latestData);
              }
            } else {
              console.log(`[hall_sensor_state] Latest values API failed for device ${deviceId}:`, response.status, response.statusText);
            }
          } catch (error) {
            console.error(`[hall_sensor_state] Latest values API error for device ${deviceId}:`, error);
          }
        }

        // If no historical data found, try current values
        if (!historicalData) {
          const currentResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${attributeKeys.join(',')}&limit=1`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Authorization': `Bearer ${tbToken}`,
            },
          });
          
          if (currentResponse.ok) {
            const currentTelemetry = await currentResponse.json();
            
            // Process current values
            const temperatureData = currentTelemetry[attribute];
            
            if (temperatureData && temperatureData.length > 0) {
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
        
        // Process the specified attribute
        const temperatureData = deviceTelemetry[attribute];
        
        if (temperatureData && temperatureData.length > 0) {
          // Filter data within the time range (skip filtering for text attributes)
          const filteredData = isTextAttribute 
            ? temperatureData 
            : temperatureData.filter(point => {
                const timestamp = point.ts;
                return timestamp >= startTime && timestamp <= endTime;
              });

          if (filteredData.length > 0) {
            // Limit the number of data points to improve performance
            let processedData = filteredData;
            
            // If we have more data points than the limit, sample them intelligently
            if (filteredData.length > maxDataPoints) {
              // Sort by timestamp first
              filteredData.sort((a, b) => a.ts - b.ts);
              
              // Calculate step size for sampling
              const step = Math.ceil(filteredData.length / maxDataPoints);
              processedData = [];
              
              for (let i = 0; i < filteredData.length; i += step) {
                processedData.push(filteredData[i]);
                if (processedData.length >= maxDataPoints) break;
              }
              
              // Always include the last data point
              if (processedData.length > 0 && processedData[processedData.length - 1] !== filteredData[filteredData.length - 1]) {
                processedData[processedData.length - 1] = filteredData[filteredData.length - 1];
              }
            }

            // Group by hour and calculate averages (only if we have aggregation interval)
            let aggregatedData;
            if (aggregationInterval >= 3600000) { // 1 hour or more
              const hourlyData = {};
              processedData.forEach(point => {
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
              aggregatedData = Object.entries(hourlyData).map(([timestamp, data]) => ({
                ts: parseInt(timestamp),
                value: data.values.reduce((sum, val) => sum + val, 0) / data.count
              }));

              // Sort by timestamp
              aggregatedData.sort((a, b) => a.ts - b.ts);
            } else {
              // For smaller intervals, use the data as-is
              aggregatedData = processedData.map(point => ({
                ts: point.ts,
                value: point.value
              }));
            }

            telemetryData.push({
              deviceId,
              key: attribute,
              data: aggregatedData,
              dataPoints: aggregatedData.length,
              originalDataPoints: filteredData.length
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

    res.status(200).json({
      success: true,
      data: telemetryData,
      timeRange: {
        start: startTime,
        end: endTime,
        interval: aggregationInterval
      },
      limits: {
        maxDataPoints: maxDataPoints,
        actualDataPoints: telemetryData.reduce((sum, device) => sum + (device.data?.length || 0), 0)
      }
    });

  } catch (error) {
    console.error('Error in telemetry aggregation API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 