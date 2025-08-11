import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get session and validate authentication
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if we have ThingsBoard token
    if (!session.tbToken) {
      return res.status(401).json({ error: 'ThingsBoard token not available' });
    }

    // Get device ID and keys from query parameters
    const { deviceId, keys, startTs, endTs } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    if (!keys) {
      return res.status(400).json({ error: 'Keys are required' });
    }

    // Check if THINGSBOARD_URL is configured
    const thingsboardUrl = process.env.THINGSBOARD_URL;
    if (!thingsboardUrl) {
      return res.status(500).json({ error: 'ThingsBoard URL not configured' });
    }

    // Construct the ThingsBoard API URL with time range if provided
    let telemetryUrl = `${thingsboardUrl}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${encodeURIComponent(keys)}`;
    
    // Add time range parameters if provided
    if (startTs && endTs) {
      telemetryUrl += `&startTs=${startTs}&endTs=${endTs}`;
    }

    // Fetch telemetry data from ThingsBoard
    const telemetryResponse = await fetch(telemetryUrl, {
      headers: {
        'Accept': 'application/json',
        'X-Authorization': `Bearer ${session.tbToken}`
      }
    });

    if (!telemetryResponse.ok) {
      const errorText = await telemetryResponse.text();
      console.error('ThingsBoard telemetry API error:', telemetryResponse.status, errorText);
      return res.status(telemetryResponse.status).json({ 
        error: `ThingsBoard API error: ${telemetryResponse.status}`,
        details: errorText
      });
    }

    const telemetryData = await telemetryResponse.json();

    // Return the telemetry data as-is
    res.status(200).json(telemetryData);

  } catch (error) {
    console.error('Error fetching telemetry data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
} 