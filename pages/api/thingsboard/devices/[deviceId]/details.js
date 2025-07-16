import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';

const THINGSBOARD_URL = process.env.THINGSBOARD_URL;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
    });
  }

  const { deviceId } = req.query;

  // Authentifizierung prüfen
  let tbToken = null;

  // Versuche zuerst den Bearer Token
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
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
      message: 'Kein gültiger ThingsBoard Token gefunden'
    });
  }

  // Device ID validieren
  if (!deviceId) {
    return res.status(400).json({
      success: false,
      error: 'Missing device ID',
      message: 'Device ID ist erforderlich'
    });
  }

  try {
    // Device-Details von ThingsBoard abrufen
    const deviceResponse = await fetch(
      `${THINGSBOARD_URL}/api/device/${deviceId}`,
      {
        headers: {
          'accept': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    if (!deviceResponse.ok) {
      const errorText = await deviceResponse.text();
      console.error('ThingsBoard API error:', deviceResponse.status, errorText);
      
      return res.status(deviceResponse.status).json({
        success: false,
        error: 'ThingsBoard API error',
        message: `Fehler beim Abrufen der Device-Details: ${deviceResponse.status}`,
        details: errorText
      });
    }

    const deviceData = await deviceResponse.json();

    // Neueste Telemetriedaten abrufen
    const telemetryResponse = await fetch(
      `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?keys=${[
        'batteryVoltage',
        'channel',
        'fCnt',
        'PercentValveOpen',
        'rssi',
        'snr',
        'sf',
        'motorPosition',
        'motorRange',
        'raw',
        'relativeHumidity',
        'sensorTemperature',
        'targetTemperature',
        'manualTargetTemperatureUpdate',
        'powerSourceStatus'
      ].join(',')}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    let telemetry = {};
    if (telemetryResponse.ok) {
      const telemetryData = await telemetryResponse.json();
      Object.entries(telemetryData).forEach(([key, values]) => {
        let value = values[0]?.value || null;
        if (key === 'PercentValveOpen' && value !== null) {
          value = Math.round(value);
        }
        telemetry[key] = value;
      });
    }

    // Attribute abrufen
    const attributesResponse = await fetch(
      `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes`,
      {
        headers: {
          'X-Authorization': `Bearer ${tbToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let attributes = {
      server: {},
      shared: {},
      client: {}
    };

    if (attributesResponse.ok) {
      const attributesData = await attributesResponse.json();
      attributesData.forEach(attr => {
        const key = attr.key;
        const value = attr.value;
        const lastUpdateTs = attr.lastUpdateTs;
        
        let type = 'shared'; // Standard
        if (key.startsWith('server_')) {
          type = 'server';
        } else if (key.startsWith('client_')) {
          type = 'client';
        }
        
        attributes[type][key] = {
          value: value,
          lastUpdateTs: lastUpdateTs,
          lastUpdate: new Date(lastUpdateTs).toISOString()
        };
      });
    }

    // Asset-Hierarchie abrufen
    let assetInfo = null;
    try {
      const relationsResponse = await fetch(
        `${THINGSBOARD_URL}/api/relations?toId=${deviceId}&toType=DEVICE&relationTypeGroup=COMMON`,
        {
          headers: {
            'accept': 'application/json',
            'X-Authorization': `Bearer ${tbToken}`
          }
        }
      );

      if (relationsResponse.ok) {
        const relations = await relationsResponse.json();
        const assetRelation = relations.find(r => r.from.entityType === 'ASSET');
        if (assetRelation) {
          assetInfo = {
            id: assetRelation.from.id,
            name: assetRelation.from.name || 'Unbekannt',
            type: assetRelation.from.type || 'ASSET'
          };
        }
      }
    } catch (error) {
      console.error(`Error getting asset info for device ${deviceId}:`, error);
    }

    // Verfügbare Telemetrie-Keys abrufen
    const availableKeysResponse = await fetch(
      `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/keys/timeseries`,
      {
        headers: {
          'X-Authorization': `Bearer ${tbToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let availableTelemetryKeys = [];
    if (availableKeysResponse.ok) {
      availableTelemetryKeys = await availableKeysResponse.json();
    }

    // Verfügbare Attribute-Keys abrufen
    const availableAttributesResponse = await fetch(
      `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/keys/attributes`,
      {
        headers: {
          'X-Authorization': `Bearer ${tbToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let availableAttributeKeys = {
      server: [],
      shared: [],
      client: []
    };

    if (availableAttributesResponse.ok) {
      const availableAttributesData = await availableAttributesResponse.json();
      availableAttributesData.forEach(key => {
        let type = 'shared';
        if (key.startsWith('server_')) {
          type = 'server';
        } else if (key.startsWith('client_')) {
          type = 'client';
        }
        availableAttributeKeys[type].push(key);
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        device: {
          id: deviceData.id?.id,
          name: deviceData.name,
          type: deviceData.type,
          label: deviceData.label || deviceData.name,
          active: deviceData.active,
          lastActivityTime: deviceData.lastActivityTime,
          additionalInfo: deviceData.additionalInfo || {},
          createdTime: deviceData.createdTime,
          tenantId: deviceData.tenantId?.id,
          customerId: deviceData.customerId?.id
        },
        telemetry: {
          current: telemetry,
          availableKeys: availableTelemetryKeys
        },
        attributes: {
          current: attributes,
          availableKeys: availableAttributeKeys
        },
        asset: assetInfo,
        summary: {
          hasTelemetry: Object.keys(telemetry).length > 0,
          hasAttributes: Object.values(attributes).some(scope => Object.keys(scope).length > 0),
          hasAsset: assetInfo !== null,
          totalTelemetryKeys: availableTelemetryKeys.length,
          totalAttributeKeys: Object.values(availableAttributeKeys).reduce((sum, keys) => sum + keys.length, 0)
        }
      }
    });

  } catch (error) {
    console.error('Device details API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler beim Verarbeiten der Anfrage',
      details: error.message
    });
  }
} 