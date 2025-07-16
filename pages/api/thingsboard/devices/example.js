import { thingsBoardDeviceManager } from '../../../../lib/ThingsBoardClient';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
    });
  }

  try {
    const { customerId, userId, action } = req.query;

    // Beispiel 1: Devices für einen Kunden abrufen
    if (action === 'getDevices' && customerId) {
      const devices = await thingsBoardDeviceManager.getDevices(customerId, {
        pageSize: 50,
        page: 0,
        sortProperty: 'name',
        sortOrder: 'ASC'
      });

      return res.status(200).json({
        success: true,
        data: devices
      });
    }

    // Beispiel 2: Devices für einen Benutzer abrufen (automatisch Customer ID ermitteln)
    if (action === 'getDevicesByUser' && userId) {
      const devicesWithCustomer = await thingsBoardDeviceManager.getDevicesByUser(
        parseInt(userId),
        {
          pageSize: 100,
          active: true
        }
      );

      return res.status(200).json({
        success: true,
        data: devicesWithCustomer
      });
    }

    // Beispiel 3: Device-Details mit Telemetrie abrufen
    if (action === 'getDeviceDetails' && customerId && req.query.deviceId) {
      const deviceId = req.query.deviceId;
      
      // Device-Details abrufen
      const device = await thingsBoardDeviceManager.getDevice(deviceId, customerId);

      // Telemetriedaten der letzten 7 Tage abrufen
      const telemetry = await thingsBoardDeviceManager.getDeviceTelemetryLast7Days(
        deviceId,
        customerId,
        ['temperature', 'humidity', 'batteryVoltage', 'PercentValveOpen']
      );

      // Device-Attribute abrufen
      const attributes = await thingsBoardDeviceManager.getDeviceAttributes(
        deviceId,
        customerId,
        'SERVER_SCOPE'
      );

      return res.status(200).json({
        success: true,
        data: {
          device,
          telemetry,
          attributes
        }
      });
    }

    // Beispiel 4: Devices suchen
    if (action === 'searchDevices' && customerId && req.query.searchTerm) {
      const searchResults = await thingsBoardDeviceManager.searchDevices(
        customerId,
        req.query.searchTerm,
        {
          pageSize: parseInt(req.query.pageSize) || 50,
          page: parseInt(req.query.page) || 0,
          sortProperty: 'name',
          sortOrder: 'ASC'
        }
      );

      return res.status(200).json({
        success: true,
        data: searchResults
      });
    }

    // Beispiel 5: Telemetriedaten für einen Zeitraum abrufen
    if (action === 'getTelemetry' && customerId && req.query.deviceId && req.query.keys) {
      const deviceId = req.query.deviceId;
      const keys = req.query.keys.split(',');
      const startTs = parseInt(req.query.startTs) || Date.now() - (24 * 60 * 60 * 1000); // Standard: letzte 24h
      const endTs = parseInt(req.query.endTs) || Date.now();
      const interval = parseInt(req.query.interval) || 5 * 60 * 1000; // Standard: 5 Minuten
      const agg = req.query.agg || 'AVG';

      const telemetry = await thingsBoardDeviceManager.getDeviceTelemetry(
        deviceId,
        customerId,
        keys,
        startTs,
        endTs,
        interval,
        parseInt(req.query.limit) || 100,
        agg
      );

      return res.status(200).json({
        success: true,
        data: {
          deviceId,
          keys,
          timeRange: {
            start: new Date(startTs).toISOString(),
            end: new Date(endTs).toISOString()
          },
          interval,
          aggregation: agg,
          telemetry
        }
      });
    }

    // Standard-Antwort mit verfügbaren Aktionen
    return res.status(400).json({
      success: false,
      error: 'Ungültige Aktion oder fehlende Parameter',
      message: 'Verfügbare Aktionen: getDevices, getDevicesByUser, getDeviceDetails, searchDevices, getTelemetry',
      examples: {
        getDevices: '/api/thingsboard/devices/example?action=getDevices&customerId=YOUR_CUSTOMER_ID',
        getDevicesByUser: '/api/thingsboard/devices/example?action=getDevicesByUser&userId=YOUR_USER_ID',
        getDeviceDetails: '/api/thingsboard/devices/example?action=getDeviceDetails&customerId=YOUR_CUSTOMER_ID&deviceId=YOUR_DEVICE_ID',
        searchDevices: '/api/thingsboard/devices/example?action=searchDevices&customerId=YOUR_CUSTOMER_ID&searchTerm=YOUR_SEARCH_TERM',
        getTelemetry: '/api/thingsboard/devices/example?action=getTelemetry&customerId=YOUR_CUSTOMER_ID&deviceId=YOUR_DEVICE_ID&keys=temperature,humidity,batteryVoltage&startTs=1704067200000&endTs=1704153600000&interval=300000&limit=100&agg=AVG'
      }
    });

  } catch (error) {
    console.error('ThingsBoard Example API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unbekannter Fehler',
      message: 'Fehler beim Verarbeiten der Anfrage'
    });
  }
} 