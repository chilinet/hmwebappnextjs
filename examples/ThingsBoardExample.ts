import { thingsBoardDeviceManager } from '../lib/ThingsBoardClient';

// Beispiel für die Verwendung in einer Next.js API Route
export async function exampleApiHandler(req: any, res: any) {
  try {
    const { customerId, userId } = req.query;

    if (customerId) {
      // Beispiel 1: Alle Devices eines Kunden abrufen
      const devices = await thingsBoardDeviceManager.getDevices(customerId, {
        pageSize: 50,
        page: 0,
        sortProperty: 'name',
        sortOrder: 'ASC'
      });

      // Beispiel 2: Telemetriedaten für ein spezifisches Device abrufen
      if (devices.data.length > 0) {
        const deviceId = devices.data[0].id.id;
        const telemetry = await thingsBoardDeviceManager.getDeviceTelemetryLast7Days(
          deviceId,
          customerId,
          ['temperature', 'humidity', 'batteryVoltage']
        );

        // Beispiel 3: Device-Attribute abrufen
        const attributes = await thingsBoardDeviceManager.getDeviceAttributes(
          deviceId,
          customerId,
          'SERVER_SCOPE'
        );

        return res.status(200).json({
          success: true,
          devices: devices.data,
          telemetry,
          attributes
        });
      }
    } else if (userId) {
      // Beispiel 4: Devices für einen Benutzer abrufen (automatisch Customer ID ermitteln)
      const devicesWithCustomer = await thingsBoardDeviceManager.getDevicesByUser(
        parseInt(userId),
        {
          pageSize: 100,
          active: true
        }
      );

      return res.status(200).json({
        success: true,
        devices: devicesWithCustomer.data,
        customerId: devicesWithCustomer.customerId
      });
    }

    return res.status(400).json({
      success: false,
      error: 'customerId oder userId erforderlich'
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
}

// Beispiel für die Verwendung in einer anderen API Route
export async function deviceDetailsApiHandler(req: any, res: any) {
  try {
    const { deviceId, customerId } = req.query;

    if (!deviceId || !customerId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId und customerId erforderlich'
      });
    }

    // Device-Details abrufen
    const device = await thingsBoardDeviceManager.getDevice(deviceId, customerId);

    // Neueste Telemetriedaten abrufen
    const endTs = Date.now();
    const startTs = endTs - (24 * 60 * 60 * 1000); // Letzte 24 Stunden
    const telemetry = await thingsBoardDeviceManager.getDeviceTelemetry(
      deviceId,
      customerId,
      ['temperature', 'humidity', 'batteryVoltage', 'PercentValveOpen'],
      startTs,
      endTs,
      5 * 60 * 1000, // 5 Minuten Interval
      100, // Max 100 Datenpunkte
      'AVG'
    );

    // Device-Attribute abrufen
    const serverAttributes = await thingsBoardDeviceManager.getDeviceAttributes(
      deviceId,
      customerId,
      'SERVER_SCOPE'
    );

    const sharedAttributes = await thingsBoardDeviceManager.getDeviceAttributes(
      deviceId,
      customerId,
      'SHARED_SCOPE'
    );

    return res.status(200).json({
      success: true,
      device,
      telemetry,
      attributes: {
        server: serverAttributes,
        shared: sharedAttributes
      }
    });

  } catch (error) {
    console.error('Device Details API Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
}

// Beispiel für die Verwendung in einer API Route zum Erstellen eines neuen Devices
export async function createDeviceApiHandler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Nur POST-Anfragen erlaubt'
      });
    }

    const { customerId, name, type, label, deviceProfileId, additionalInfo } = req.body;

    if (!customerId || !name || !type) {
      return res.status(400).json({
        success: false,
        error: 'customerId, name und type sind erforderlich'
      });
    }

    const newDevice = await thingsBoardDeviceManager.createDevice(customerId, {
      name,
      type,
      label,
      deviceProfileId,
      additionalInfo
    });

    return res.status(201).json({
      success: true,
      device: newDevice
    });

  } catch (error) {
    console.error('Create Device API Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
}

// Beispiel für die Verwendung in einer API Route zum Setzen von Device-Attributen
export async function setDeviceAttributesApiHandler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Nur POST-Anfragen erlaubt'
      });
    }

    const { deviceId, customerId, scope, attributes } = req.body;

    if (!deviceId || !customerId || !scope || !attributes) {
      return res.status(400).json({
        success: false,
        error: 'deviceId, customerId, scope und attributes sind erforderlich'
      });
    }

    await thingsBoardDeviceManager.setDeviceAttributes(
      deviceId,
      customerId,
      scope,
      attributes
    );

    return res.status(200).json({
      success: true,
      message: 'Device-Attribute erfolgreich gesetzt'
    });

  } catch (error) {
    console.error('Set Device Attributes API Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
}

// Beispiel für die Verwendung in einer API Route zum Suchen von Devices
export async function searchDevicesApiHandler(req: any, res: any) {
  try {
    const { customerId, searchTerm, pageSize = 50, page = 0 } = req.query;

    if (!customerId || !searchTerm) {
      return res.status(400).json({
        success: false,
        error: 'customerId und searchTerm sind erforderlich'
      });
    }

    const searchResults = await thingsBoardDeviceManager.searchDevices(
      customerId,
      searchTerm,
      {
        pageSize: parseInt(pageSize),
        page: parseInt(page),
        sortProperty: 'name',
        sortOrder: 'ASC'
      }
    );

    return res.status(200).json({
      success: true,
      ...searchResults
    });

  } catch (error) {
    console.error('Search Devices API Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    });
  }
}

// Beispiel für die Verwendung außerhalb von API Routes (z.B. in Cron Jobs)
export async function exampleCronJob() {
  try {
    // Hier würden Sie die Customer IDs aus der Datenbank abrufen
    const customerIds = ['customer-id-1', 'customer-id-2'];

    for (const customerId of customerIds) {
      try {
        // Alle aktiven Devices abrufen
        const devices = await thingsBoardDeviceManager.getDevices(customerId, {
          active: true,
          pageSize: 1000
        });

        // Für jedes Device die Telemetriedaten der letzten 7 Tage abrufen
        for (const device of devices.data) {
          const telemetry = await thingsBoardDeviceManager.getDeviceTelemetryLast7Days(
            device.id.id,
            customerId,
            ['temperature', 'humidity', 'batteryVoltage']
          );

          // Hier könnten Sie die Daten verarbeiten oder speichern
          console.log(`Device ${device.name}:`, telemetry);
        }
      } catch (error) {
        console.error(`Fehler bei Customer ${customerId}:`, error);
      }
    }
  } catch (error) {
    console.error('Cron Job Error:', error);
  }
}

// Beispiel für die Verwendung in einem React Hook (Client-seitig)
// Hinweis: Dies würde in einer separaten .tsx Datei stehen
/*
import { useState, useEffect } from 'react';

export function useDeviceTelemetry(deviceId: string, customerId: string, keys: string[]) {
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchTelemetry() {
      try {
        setLoading(true);
        const response = await fetch(`/api/thingsboard/devices/${deviceId}/timeseries?customerId=${customerId}&keys=${keys.join(',')}&last7Days=true`);
        const data = await response.json();
        
        if (data.success) {
          setTelemetry(data.telemetry);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (deviceId && customerId && keys.length > 0) {
      fetchTelemetry();
    }
  }, [deviceId, customerId, keys.join(',')]);

  return { telemetry, loading, error };
}
*/ 