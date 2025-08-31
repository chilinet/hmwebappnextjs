import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { getConnection } from "../../../../../lib/db";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authentifizierung prüfen
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deviceId = req.query.id;
    const { action, parameters, device } = req.body;

    // Debug-Logging
    console.log('API Debug - Request query:', req.query);
    console.log('API Debug - Request body:', req.body);
    console.log('API Debug - Extracted deviceId:', deviceId);
    console.log('API Debug - Extracted action:', action);
    console.log('API Debug - Device object:', device);

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    if (!device) {
      return res.status(400).json({ error: 'Device object is required' });
    }

    // Erlaubte Aktionen definieren
    const allowedActions = ['reset', 'recalibrate', 'requestParameters'];
    
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action. Allowed actions: ' + allowedActions.join(', ') 
      });
    }

    // Device-Profile und deren unterstützte Aktionen definieren
    const deviceProfiles = {
      'vicki': {
        name: 'MClimate Thermostat ',
        description: 'MClimate Thermostat',
        supportedActions: {
          reset: {
            description: 'Thermostat zurücksetzen',
            function: 'resetVicki',
            parameters: [],
            hex: '0x30'
          },
          recalibrate: {
            description: 'Sensor neu kalibrieren',
            function: 'recalibrateLHT52',
            parameters: ['calibrationType', 'referenceValues']
          },
          requestParameters: {
            description: 'Aktuelle Parameter abfragen',
            function: 'requestParametersLHT52',
            parameters: ['parameterTypes']
          }
        }
      },
      'LSE01': {
        name: 'LSE01 Sensor',
        description: 'Licht- und Sonneneinstrahlungssensor',
        supportedActions: {
          reset: {
            description: 'Sensor zurücksetzen',
            function: 'resetLSE01',
            parameters: ['resetType', 'resetMode']
          },
          recalibrate: {
            description: 'Sensor neu kalibrieren',
            function: 'recalibrateLSE01',
            parameters: ['calibrationType', 'referenceValues']
          },
          requestParameters: {
            description: 'Aktuelle Parameter abfragen',
            function: 'requestParametersLSE01',
            parameters: ['parameterTypes']
          }
        }
      },
      'LPS22HB': {
        name: 'LPS22HB Sensor',
        description: 'Luftdrucksensor',
        supportedActions: {
          reset: {
            description: 'Sensor zurücksetzen',
            function: 'resetLPS22HB',
            parameters: ['resetType', 'resetMode']
          },
          recalibrate: {
            description: 'Sensor neu kalibrieren',
            function: 'recalibrateLPS22HB',
            parameters: ['calibrationType', 'referenceValues']
          },
          requestParameters: {
            description: 'Aktuelle Parameter abfragen',
            function: 'requestParametersLPS22HB',
            parameters: ['parameterTypes']
          }
        }
      },
      'default': {
        name: 'Unbekanntes Gerät',
        description: 'Standard-Device-Profile',
        supportedActions: {
          reset: {
            description: 'Gerät zurücksetzen',
            function: 'resetDefault',
            parameters: ['resetType']
          },
          recalibrate: {
            description: 'Gerät neu kalibrieren',
            function: 'recalibrateDefault',
            parameters: ['calibrationType']
          },
          requestParameters: {
            description: 'Aktuelle Parameter abfragen',
            function: 'requestParametersDefault',
            parameters: ['parameterTypes']
          }
        }
      }
    };

    // Device-Profile aus dem Device-Objekt extrahieren
    const deviceType = device.type || 'default';
    const deviceProfile = deviceProfiles[deviceType] || deviceProfiles['default'];
    
    // Prüfen, ob die Aktion für dieses Device-Profile unterstützt wird
    if (!deviceProfile.supportedActions[action]) {
      return res.status(400).json({
        error: `Action '${action}' is not supported for device type '${deviceType}'`,
        supportedActions: Object.keys(deviceProfile.supportedActions),
        deviceProfile: deviceProfile.name
      });
    }

    // Integrationstyp aus der Inventory-Tabelle holen
    let integrationType = null;
    try {
      const connection = await getConnection();
      const result = await connection.request().query(`SELECT nwconnectionid FROM inventory WHERE deviceid = '${deviceId}'`);
      if (result.recordset && result.recordset.length > 0) {
        integrationType = result.recordset[0].nwconnectionid;
        console.log(`[DEVICE ACTION] Integration type for device ${deviceId}: ${integrationType}`);
      } else {
        console.log(`[DEVICE ACTION] Could not find inventory data for device ${deviceId}`);
      }
    } catch (error) {
      console.log(`[DEVICE ACTION] Error fetching inventory data: ${error.message}`);
    }

    // Aktuelle Zeit für Logging
    const timestamp = new Date().toISOString();
    
    // Log der Aktion mit Device-Profile-Informationen
    console.log(`[DEVICE ACTION] ${timestamp} - Device: ${deviceId}, Type: ${deviceType}, Profile: ${deviceProfile.name}, Action: ${action}, Integration Type: ${integrationType}, User: ${session.user.email}, Parameters:`, parameters || 'none');

    // Melita API Integration für vicki Reset mit Integrationstyp 1
    if (deviceType === 'vicki' && action === 'reset' && integrationType === 1) {
      try {
        console.log(`[DEVICE ACTION] Sending reset command to Melita API for vicki device ${deviceId}`);
        
        // Hex 0x30 in Base64 konvertieren
        const hexCommand = '30';
        const base64Payload = Buffer.from(hexCommand, 'hex').toString('base64');
        
        // Verwende die vorhandene Melita API
        const melitaResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/melita/downlink`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.cookie || ''
          },
          body: JSON.stringify({
            deviceEui: device.name, // devEUI aus device.name
            payload: base64Payload, // "MA==" (Hex 0x30 in Base64)
            priority: "HIGH",
            confirmed: false,
            fPort: 2
          })
        });

        if (melitaResponse.ok) {
          const melitaResult = await melitaResponse.json();
          console.log(`[DEVICE ACTION] Melita API call successful:`, melitaResult);
        } else {
          const melitaError = await melitaResponse.text();
          console.log(`[DEVICE ACTION] Melita API call failed: ${melitaResponse.status} - ${melitaError}`);
        }
        
      } catch (melitaError) {
        console.log(`[DEVICE ACTION] Error calling Melita API: ${melitaError.message}`);
      }
    }

    // TODO: Hier später die tatsächliche Implementierung der Aktionen für jedes Device-Profile hinzufügen
    // Die Funktionen sind in deviceProfile.supportedActions[action].function definiert
    
    // Beispiel für zukünftige Implementierung:
    // switch(deviceProfile.supportedActions[action].function) {
    //   case 'resetLHT52':
    //     // Spezifische Reset-Logik für LHT52
    //     break;
    //   case 'recalibrateLHT52':
    //     // Spezifische Rekalibrierungs-Logik für LHT52
    //     break;
    //   // ... weitere Fälle
    // }

    // Erfolgreiche Antwort mit Device-Profile-Informationen
    return res.status(200).json({
      success: true,
      message: `Action '${action}' for device type '${deviceType}' logged successfully`,
      timestamp: timestamp,
      deviceId: deviceId,
      deviceType: deviceType,
      deviceProfile: deviceProfile.name,
      action: action,
      actionDescription: deviceProfile.supportedActions[action].description,
      function: deviceProfile.supportedActions[action].function,
      supportedParameters: deviceProfile.supportedActions[action].parameters,
      integrationType: integrationType,
      melitaApiCalled: (deviceType === 'vicki' && action === 'reset' && integrationType === 1),
      parameters: parameters || null,
      user: session.user.email
    });

  } catch (error) {
    console.error('Error in device actions API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}
