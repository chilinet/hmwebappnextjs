import { getServerSession } from 'next-auth/next';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';

// Rekursiv alle untergeordneten Asset-IDs holen
async function getAllChildAssetIds(parentAssetId, token) {
  const childAssets = [];

  async function recurse(assetId) {
    const res = await fetch(`${process.env.THINGSBOARD_URL}/api/relations?fromId=${assetId}&fromType=ASSET&relationTypeGroup=COMMON`, {
      headers: {
        accept: 'application/json',
        'X-Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) return;

    const relations = await res.json();

    for (const rel of relations) {
      if (rel.to.entityType === 'ASSET') {
        childAssets.push(rel.to.id);
        await recurse(rel.to.id); // rekursiver Aufruf
      }
    }
  }

  await recurse(parentAssetId);
  return childAssets;
}

// Für alle Assets alle verbundenen Devices holen
async function getDevicesForAssets(assetIds, allDevices, token) {
  const foundDevices = [];

  for (const assetId of assetIds) {
    const res = await fetch(`${process.env.THINGSBOARD_URL}/api/relations?fromId=${assetId}&fromType=ASSET&relationTypeGroup=COMMON`, {
      headers: {
        accept: 'application/json',
        'X-Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) continue;

    const relations = await res.json();
    const deviceIds = relations
      .filter(r => r.to.entityType === 'DEVICE')
      .map(r => r.to.id);

    const matched = allDevices.filter(d => deviceIds.includes(d.id.id));
    foundDevices.push(...matched);
  }

  return foundDevices;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let tbToken = null;
    let customerId = null;
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
        tbToken = decoded.tbToken;
        customerId = decoded.customerId;
      } catch (err) {
        console.error('JWT verification failed:', err);
      }
    }

    if (!tbToken) {
      const session = await getSession({ req });
      if (session?.tbToken) {
        tbToken = session.tbToken;
        customerId = session.user?.customerid;
      }
    }

    if (!tbToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { nodeId } = req.query;
    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId parameter is required' });
    }

    if (!customerId) {
      const session = await getSession({ req });
      customerId = session?.user?.customerid;
      if (!customerId) {
        return res.status(400).json({ error: 'Customer ID not found' });
      }
    }

    const devicesResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/deviceInfos?pageSize=10000&page=0`,
      {
        headers: {
          accept: 'application/json',
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

    // Ziel-Asset laden (optional für Anzeige)
    const assetResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/asset/${nodeId}`,
      {
        headers: {
          accept: 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    const targetAsset = assetResponse.ok ? await assetResponse.json() : null;

    // Alle untergeordneten Assets rekursiv ermitteln
    const assetIds = [nodeId, ...(await getAllChildAssetIds(nodeId, tbToken))];

    // Alle Devices zu diesen Assets holen
    let relatedDevices = await getDevicesForAssets(assetIds, allDevices, tbToken);

    // Fallback (wenn keine Devices gefunden wurden)
    if (relatedDevices.length === 0 && targetAsset) {
      const assetName = targetAsset.name?.toLowerCase() || '';

      relatedDevices = allDevices.filter(device => {
        const dn = device.name?.toLowerCase() || '';
        const dl = device.label?.toLowerCase() || '';
        return dn.includes(assetName) || dl.includes(assetName);
      });
    }

    // Wenn keine Devices gefunden wurden, leeres Array zurückgeben
    if (relatedDevices.length === 0) {
      relatedDevices = [];
    }

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

    // API response preparation

    res.status(200).json({
      success: true,
      data: formattedDevices,
      nodeId,
      totalDevices: formattedDevices.length,
      assetName: targetAsset?.name || 'Unknown'
    });

  } catch (error) {
    console.error('Error in devices by node API:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
