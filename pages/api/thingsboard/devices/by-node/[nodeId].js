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
    let customerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
        tbToken = decoded.tbToken;
        customerId = decoded.customerId;
      } catch (err) {
        console.error('JWT verification failed:', err);
      }
    }

    // Wenn kein gültiger Bearer Token, versuche Session
    if (!tbToken) {
      const session = await getSession({ req });
      if (session?.tbToken) {
        tbToken = session.tbToken;
        customerId = session.user?.customerid;
      }
    }

    //console.log('--------------------------------');
    //console.log('Customer ID :', customerId);
    //console.log('--------------------------------');

    // Wenn keine Authentifizierung gefunden wurde
    if (!tbToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { nodeId } = req.query;

    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId parameter is required' });
    }

    // If no customer ID found, try to get it from session
    if (!customerId) {
      try {
        const session = await getSession({ req });
        if (session?.user?.customerid) {
          customerId = session.user.customerid;
        }
      } catch (error) {
        console.error('Error getting customer ID from session:', error);
      }
    }

    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID not found' });
    }

    // Get all devices for the customer from ThingsBoard
    const devicesResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/deviceInfos?pageSize=10000&page=0`,
      {
        headers: {
          'accept': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    if (!devicesResponse.ok) {
      console.error('ThingsBoard devices API error:', devicesResponse.status);
      return res.status(500).json({ error: 'Failed to fetch devices from ThingsBoard' });
    }

    const devicesData = await devicesResponse.json();
    const allDevices = devicesData.data || [];

    // Get the asset (node) details to understand the hierarchy
    const assetResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/asset/${nodeId}`,
      {
        headers: {
          'accept': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    let targetAsset = null;
    if (assetResponse.ok) {
      targetAsset = await assetResponse.json();
    }

    // Get relations to find devices connected to this asset and its children
    const relationsResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/relations?fromId=${nodeId}&fromType=ASSET&relationTypeGroup=COMMON`,
      {
        headers: {
          'accept': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    let relatedDevices = [];

    console.log('--------------------------------');
    console.log('Relations Response:', relationsResponse);
    console.log('--------------------------------');  

    if (relationsResponse.ok) {
      const relations = await relationsResponse.json();
      
      // Find all device relations
      const deviceRelations = relations.filter(r => r.to.entityType === 'DEVICE');
      
      // Get device IDs from relations
      const deviceIds = deviceRelations.map(r => r.to.id);
      
      // Filter devices that are related to this asset
      relatedDevices = allDevices.filter(device => 
        deviceIds.includes(device.id.id)
      );
    }

    // If no direct relations found, try to find devices by asset name pattern
    if (relatedDevices.length === 0 && targetAsset) {
      const assetName = targetAsset.name?.toLowerCase() || '';
      
      // Try to find devices that might be related by name pattern
      relatedDevices = allDevices.filter(device => {
        const deviceName = device.name?.toLowerCase() || '';
        const deviceLabel = device.label?.toLowerCase() || '';
        
        // Check if device name contains asset name or vice versa
        return deviceName.includes(assetName) || 
               assetName.includes(deviceName) ||
               deviceLabel.includes(assetName) ||
               assetName.includes(deviceLabel);
      });
    }

    // If still no devices found, return all devices for the customer (fallback)
    if (relatedDevices.length === 0) {
      console.log('No specific devices found for node, returning all customer devices as fallback');
      relatedDevices = allDevices;
    }

    // Format devices for response
    const formattedDevices = relatedDevices.map(device => ({
      id: device.id.id,
      name: device.name,
      type: device.type,
      label: device.label || device.name,
      active: device.active,
      lastActivityTime: device.lastActivityTime,
      additionalInfo: device.additionalInfo || {},
      createdTime: device.createdTime,
      tenantId: device.tenantId?.id,
      customerId: device.customerId?.id
    }));

    console.log('=== DEVICES BY NODE API ===');
    console.log('Node ID:', nodeId);
    console.log('Asset name:', targetAsset?.name || 'Unknown');
    console.log('Total devices found:', formattedDevices.length);
    console.log('Device details:', JSON.stringify(formattedDevices, null, 2));
    
    res.status(200).json({
      success: true,
      data: formattedDevices,
      nodeId: nodeId,
      totalDevices: formattedDevices.length,
      assetName: targetAsset?.name || 'Unknown'
    });

  } catch (error) {
    console.error('Error in devices by node API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 