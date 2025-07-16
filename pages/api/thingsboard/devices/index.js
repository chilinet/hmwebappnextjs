import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';

const THINGSBOARD_URL = process.env.THINGSBOARD_URL;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
    });
  }

  // Authentifizierung prüfen
  let tbToken = null;
  let customerId = null;

  // Versuche zuerst den Bearer Token
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

  // Wenn keine Authentifizierung gefunden wurde
  if (!tbToken) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
      message: 'Kein gültiger ThingsBoard Token gefunden'
    });
  }

  // Wenn keine Customer ID gefunden wurde, versuche sie aus der Session zu holen
  if (!customerId) {
    try {
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.customerid) {
        customerId = session.user.customerid;
      } else {
        // Fallback: Hole Customer ID aus der Datenbank
        const pool = await getConnection();
        const userResult = await pool.request()
          .input('userid', sql.Int, session?.user?.userid)
          .query(`
            SELECT customerid
            FROM hm_users
            WHERE userid = @userid
          `);

        if (userResult.recordset.length > 0) {
          customerId = userResult.recordset[0].customerid;
        }
      }
    } catch (error) {
      console.error('Error getting customer ID:', error);
    }
  }

  if (!customerId) {
    return res.status(400).json({
      success: false,
      error: 'Missing customer ID',
      message: 'Customer ID konnte nicht ermittelt werden'
    });
  }

  try {
    // Alle Devices des Kunden von ThingsBoard abrufen
    const devicesResponse = await fetch(
      `${THINGSBOARD_URL}/api/customer/${customerId}/deviceInfos?pageSize=1000&page=0`,
      {
        headers: {
          'accept': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    if (!devicesResponse.ok) {
      const errorText = await devicesResponse.text();
      console.error('ThingsBoard API error:', devicesResponse.status, errorText);
      
      return res.status(devicesResponse.status).json({
        success: false,
        error: 'ThingsBoard API error',
        message: `Fehler beim Abrufen der Devices: ${devicesResponse.status}`,
        details: errorText
      });
    }

    const devicesData = await devicesResponse.json();
    const devices = devicesData.data || [];

    // Für jedes Device die neuesten Telemetriedaten abrufen
    const devicesWithTelemetry = await Promise.all(
      devices.map(async (device) => {
        try {
          // Neueste Telemetriedaten abrufen
          const telemetryResponse = await fetch(
            `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${device.id.id}/values/timeseries?keys=${[
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

          // Asset-Hierarchie abrufen (falls verfügbar)
          let assetInfo = null;
          try {
            const relationsResponse = await fetch(
              `${THINGSBOARD_URL}/api/relations?toId=${device.id.id}&toType=DEVICE&relationTypeGroup=COMMON`,
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
                  name: assetRelation.from.name || 'Unbekannt'
                };
              }
            }
          } catch (error) {
            console.error(`Error getting asset info for device ${device.id.id}:`, error);
          }

          return {
            id: device.id.id,
            name: device.name,
            type: device.type,
            label: device.label || device.name,
            active: device.active,
            lastActivityTime: device.lastActivityTime,
            additionalInfo: device.additionalInfo || {},
            telemetry: telemetry,
            asset: assetInfo,
            createdTime: device.createdTime,
            tenantId: device.tenantId?.id,
            customerId: device.customerId?.id
          };
        } catch (error) {
          console.error(`Error processing device ${device.id.id}:`, error);
          return {
            id: device.id.id,
            name: device.name,
            type: device.type,
            label: device.label || device.name,
            active: device.active,
            lastActivityTime: device.lastActivityTime,
            additionalInfo: device.additionalInfo || {},
            telemetry: {},
            asset: null,
            createdTime: device.createdTime,
            tenantId: device.tenantId?.id,
            customerId: device.customerId?.id,
            error: 'Fehler beim Abrufen der Telemetriedaten'
          };
        }
      })
    );

    // Statistiken berechnen
    const stats = {
      total: devicesWithTelemetry.length,
      active: devicesWithTelemetry.filter(d => d.active).length,
      inactive: devicesWithTelemetry.filter(d => !d.active).length,
      withTelemetry: devicesWithTelemetry.filter(d => Object.keys(d.telemetry).length > 0).length,
      withAsset: devicesWithTelemetry.filter(d => d.asset).length
    };

    return res.status(200).json({
      success: true,
      data: {
        customerId: customerId,
        devices: devicesWithTelemetry,
        statistics: stats,
        summary: {
          totalDevices: stats.total,
          activeDevices: stats.active,
          inactiveDevices: stats.inactive,
          devicesWithTelemetry: stats.withTelemetry,
          devicesWithAsset: stats.withAsset
        }
      }
    });

  } catch (error) {
    console.error('Devices API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler beim Verarbeiten der Anfrage',
      details: error.message
    });
  }
} 