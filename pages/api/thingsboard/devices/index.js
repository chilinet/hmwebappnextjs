import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';
import { debugLog, debugWarn } from '../../../../lib/appDebug';

const THINGSBOARD_URL = process.env.THINGSBOARD_URL;

async function getAuthAndCustomer(req, res) {
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

  if (!tbToken) {
    const session = await getServerSession(req, res, authOptions);
    if (session?.tbToken) {
      tbToken = session.tbToken;
      customerId = session.user?.customerid;
    }
  }

  if (!tbToken) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated',
      message: 'Kein gültiger ThingsBoard Token gefunden'
    });
  }

  if (!customerId) {
    try {
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.customerid) {
        customerId = session.user.customerid;
      } else if (session?.user?.userid) {
        const pool = await getConnection();
        const userResult = await pool.request()
          .input('userid', sql.Int, session.user.userid)
          .query(`SELECT customerid FROM hm_users WHERE userid = @userid`);
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

  return { tbToken, customerId };
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Create device in ThingsBoard and assign to customer
    if (!THINGSBOARD_URL) {
      return res.status(500).json({
        success: false,
        error: 'THINGSBOARD_URL not configured'
      });
    }
    const auth = await getAuthAndCustomer(req, res);
    if (!auth || auth.tbToken === undefined) return;
    const { tbToken, customerId } = auth;

    const body = req.body || {};
    const deveui = body.deveui != null ? String(body.deveui).trim() : '';
    const friendlyName = body.name || body.label || 'Device';
    const name = deveui ? `Device_${deveui}` : friendlyName;
    const type = body.type || 'Default';
    const label = body.label != null ? body.label : friendlyName;
    const deviceProfileId = body.deviceProfileId || null;

    try {
      const createPayload = { name, type, label };
      if (deviceProfileId) createPayload.deviceProfileId = { id: deviceProfileId, entityType: 'DEVICE_PROFILE' };

      const createRes = await fetch(`${THINGSBOARD_URL}/api/device`, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        },
        body: JSON.stringify(createPayload)
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        let errJson;
        try {
          errJson = JSON.parse(errText);
        } catch (_) {
          errJson = {};
        }
        const alreadyExists = errJson.message && (
          errJson.message.includes('already exists') ||
          errJson.errorCode === 31
        );
        if (alreadyExists && (name || friendlyName)) {
          const searchName = name || friendlyName;
          const tenantDevicesRes = await fetch(
            `${THINGSBOARD_URL}/api/tenant/devices?pageSize=100&page=0&textSearch=${encodeURIComponent(searchName)}`,
            {
              headers: {
                'accept': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`
              }
            }
          );
          if (tenantDevicesRes.ok) {
            const tenantData = await tenantDevicesRes.json();
            const devices = tenantData.data || tenantData || [];
            const existing = Array.isArray(devices) ? devices.find(d => (d.name || '').toString() === searchName) : null;
            if (existing && (existing.id?.id || existing.id)) {
              const deviceId = existing.id?.id || existing.id;
              return res.status(200).json({
                success: true,
                id: deviceId,
                idObj: existing.id,
                existing: true
              });
            }
          }
        }
        console.error('ThingsBoard create device error:', createRes.status, errText);
        return res.status(createRes.status).json({
          success: false,
          error: errJson.message || 'ThingsBoard device creation failed',
          details: errText
        });
      }

      const created = await createRes.json();
      const deviceId = created.id?.id || created.id;

      return res.status(201).json({
        success: true,
        id: deviceId,
        idObj: created.id
      });
    } catch (error) {
      console.error('Create device error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
    });
  }

  const auth = await getAuthAndCustomer(req, res);
  if (auth.tbToken === undefined) return;
  const { tbToken, customerId } = auth;

  try {
    // Hilfsfunktion zum Abrufen aller Geräte mit Pagination
    const fetchAllDevices = async (customerId, tbToken) => {
      const allDevices = [];
      let page = 0;
      const pageSize = 1000;
      let hasNext = true;

      while (hasNext) {
        try {
          const devicesResponse = await fetch(
            `${THINGSBOARD_URL}/api/customer/${customerId}/deviceInfos?pageSize=${pageSize}&page=${page}`,
            {
              headers: {
                'accept': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`
              }
            }
          );

          if (!devicesResponse.ok) {
            const errorText = await devicesResponse.text();
            console.error(`ThingsBoard API error on page ${page}:`, devicesResponse.status, errorText);
            break;
          }

          const devicesData = await devicesResponse.json();
          const devices = devicesData.data || [];
          allDevices.push(...devices);

          // Prüfe, ob weitere Seiten vorhanden sind
          const totalElements = devicesData.totalElements || 0;
          const totalPages = devicesData.totalPages || Math.ceil(totalElements / pageSize);
          hasNext = devices.length === pageSize && (page + 1) < totalPages;

          debugLog(`Fetched page ${page}: ${devices.length} devices (total so far: ${allDevices.length})`);
          
          page++;
        } catch (error) {
          console.error(`Error fetching devices page ${page}:`, error);
          break;
        }
      }

      return allDevices;
    };

    // Alle Devices des Kunden von ThingsBoard abrufen (mit Pagination)
    const devices = await fetchAllDevices(customerId, tbToken);
    
    debugLog(`Total devices fetched: ${devices.length}`);

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