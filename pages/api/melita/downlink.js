import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { getMelitaApiConnection, getMelitaToken } from "../../../lib/melitaAuth";

const POSSIBLE_DOWNLINK_ENDPOINTS = [
  '/api/iot-gateway/lorawan/{deviceEui}/queue'
];

// Downlink-Nachricht an Melita.io senden
async function sendDownlinkToMelita(deviceEui, payload, authToken, confirmed, fPort, baseUrl) {
  const normalizedBaseUrl = (String(baseUrl || '').trim()).replace(/\/+$/, '');
  
  // Device EUI Format validieren (sollte 16 Zeichen Hex-String sein)
  if (!/^[0-9a-fA-F]{16}$/.test(deviceEui)) {
    debugLog(`[MELITA] Device EUI format validation failed: ${deviceEui}`);
    debugLog(`[MELITA] Expected: 16 character hex string, got: ${deviceEui.length} characters`);
    
    // Versuche es trotzdem, falls es ein gültiges Format ist
    debugLog(`[MELITA] Proceeding with device EUI: ${deviceEui}`);
  }
  
  // Verschiedene Downlink-Endpunkte testen
  for (const endpointTemplate of POSSIBLE_DOWNLINK_ENDPOINTS) {
    try {
      const endpoint = endpointTemplate.replace('{deviceEui}', deviceEui);
      const downlinkUrl = `${normalizedBaseUrl}${endpoint}`;
      
      debugLog(`[MELITA] Trying downlink endpoint: ${downlinkUrl}`);
      
      const response = await fetch(downlinkUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          confirmed: confirmed,
          data: payload,
          devEUI: deviceEui,
          fPort: fPort
        })
      });

      debugLog(`[MELITA] Endpoint ${endpoint} response status:`, response.status);
      
      if (response.ok) {
        const result = await response.json();
        debugLog(`[MELITA] Downlink sent successfully via ${endpoint}:`, result);
        return result;
      } else {
        const errorText = await response.text();
        debugLog(`[MELITA] Endpoint ${endpoint} failed: ${response.status} - ${errorText}`);
        
        // Spezielle Behandlung für 404 (Device EUI nicht gefunden)
        if (response.status === 404) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error && errorData.error.message && errorData.error.message.includes('Invalid Device EUI')) {
              throw new Error(`Device EUI '${deviceEui}' is not registered in Melita.io. Please check if the device is properly registered.`);
            }
          } catch (parseError) {
            // Falls JSON-Parsing fehlschlägt, verwende den ursprünglichen Fehler
          }
        }
      }
    } catch (error) {
      debugLog(`[MELITA] Endpoint ${endpointTemplate} error:`, error.message);
    }
  }

  // Alle Endpunkte fehlgeschlagen
  throw new Error(`All possible downlink endpoints failed for device EUI '${deviceEui}'. Please check if the device is registered in Melita.io.`);
}

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

    // Request-Body validieren
    const { deviceEui, payload, priority = 'NORMAL', confirmed = true, fPort = 2 } = req.body;

    if (!deviceEui) {
      return res.status(400).json({ error: 'deviceEui is required' });
    }

    if (!payload) {
      return res.status(400).json({ error: 'payload (base64) is required' });
    }

    // Base64-Payload validieren
    if (typeof payload !== 'string') {
      return res.status(400).json({ error: 'payload must be a base64 string' });
    }

    // Base64-String validieren (einfache Prüfung)
    try {
      // Prüfen ob es ein gültiger Base64-String ist
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
        return res.status(400).json({ error: 'Invalid base64 string format' });
      }
      
      // Optional: Decodieren um zu prüfen ob es gültig ist
      Buffer.from(payload, 'base64');
    } catch (error) {
      return res.status(400).json({ error: 'Invalid base64 payload' });
    }

    const melitaConn = await getMelitaApiConnection();
    if (!melitaConn?.apiKey || !melitaConn?.baseUrl) {
      return res.status(500).json({
        error: 'Melita API nicht konfiguriert',
        details: 'Keine Melita Verbindung in mw/nwconnections gefunden und MELITA_API_KEY/MELITA_BASE_URL nicht gesetzt.',
      });
    }

    const authToken = await getMelitaToken({ apiKey: melitaConn.apiKey, baseUrl: melitaConn.baseUrl });
    const baseUrl = melitaConn.baseUrl;

    // Downlink-Nachricht senden
    const result = await sendDownlinkToMelita(deviceEui, payload, authToken, confirmed, fPort, baseUrl);

    // Erfolgreiche Antwort
    return res.status(200).json({
      success: true,
      message: 'Downlink message sent successfully to Melita.io',
      deviceEui: deviceEui,
      payload: payload,
      payloadLength: payload.length,
      payloadDecoded: Buffer.from(payload, 'base64').toString('hex'),
      priority: priority,
      confirmed: confirmed,
      fPort: fPort,
      result: result,
      timestamp: new Date().toISOString(),
      user: session.user.email
    });

  } catch (error) {
    console.error('[MELITA] API Error:', error);
    
    return res.status(500).json({
      error: 'Failed to send downlink message',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
