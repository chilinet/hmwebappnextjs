import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

// Melita.io Konfiguration
const MELITA_API_KEY = process.env.MELITA_API_KEY;
const MELITA_BASE_URL = process.env.MELITA_BASE_URL;

// Alternative API-Endpunkte testen
const POSSIBLE_AUTH_ENDPOINTS = [
  '/api/iot-gateway/auth/generate'
];

const POSSIBLE_DOWNLINK_ENDPOINTS = [
  '/api/iot-gateway/lorawan/{deviceEui}/queue'
];

// Token-Cache für Melita.io
let melitaTokenCache = {
  authToken: null,
  expiry: 0
};

// Melita.io Token generieren oder aus Cache holen
async function getMelitaToken() {
  const now = Math.floor(Date.now() / 1000);
  
  // Prüfen ob der Cache-Token noch gültig ist
  if (melitaTokenCache.authToken && melitaTokenCache.expiry > now) {
    console.log('[MELITA] Using cached token, expires in', melitaTokenCache.expiry - now, 'seconds');
    return melitaTokenCache.authToken;
  }

  try {
    console.log('[MELITA] Generating new auth token...');
    console.log('[MELITA] Using API Key:', MELITA_API_KEY ? 'Present' : 'Missing');
    console.log('[MELITA] Using Base URL:', MELITA_BASE_URL);
    
    // Base-URL korrekt formatieren (keine doppelten Slashes)
    const baseUrl = MELITA_BASE_URL.endsWith('/') ? MELITA_BASE_URL.slice(0, -1) : MELITA_BASE_URL;
    
    // Verschiedene Auth-Endpunkte testen
    for (const endpoint of POSSIBLE_AUTH_ENDPOINTS) {
      try {
        const authUrl = `${baseUrl}${endpoint}`;
        console.log(`[MELITA] Trying auth endpoint: ${authUrl}`);
        
        const response = await fetch(authUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'accept': '*/*',
            'ApiKey': MELITA_API_KEY
          }
        });

        console.log(`[MELITA] Endpoint ${endpoint} response status:`, response.status);
        
        if (response.ok) {
          const authData = await response.json();
          console.log(`[MELITA] Success with endpoint ${endpoint}:`, authData);
          
          // Token im Cache speichern
          melitaTokenCache = {
            authToken: authData.authToken,
            expiry: authData.expiry
          };

          console.log('[MELITA] New token generated, expires at', new Date(authData.expiry * 1000).toISOString());
          return authData.authToken;
        } else {
          const errorText = await response.text();
          console.log(`[MELITA] Endpoint ${endpoint} failed: ${response.status} - ${errorText}`);
        }
      } catch (error) {
        console.log(`[MELITA] Endpoint ${endpoint} error:`, error.message);
      }
    }

    // Alle Endpunkte fehlgeschlagen
    throw new Error('All possible auth endpoints failed. Please check the API configuration.');
  } catch (error) {
    console.error('[MELITA] Error generating auth token:', error);
    throw new Error(`Failed to authenticate with Melita.io: ${error.message}`);
  }
}

// Downlink-Nachricht an Melita.io senden
async function sendDownlinkToMelita(deviceEui, payload, authToken, confirmed, fPort) {
  // Base-URL korrekt formatieren
  const baseUrl = MELITA_BASE_URL.endsWith('/') ? MELITA_BASE_URL.slice(0, -1) : MELITA_BASE_URL;
  
  // Device EUI Format validieren (sollte 16 Zeichen Hex-String sein)
  if (!/^[0-9a-fA-F]{16}$/.test(deviceEui)) {
    console.log(`[MELITA] Device EUI format validation failed: ${deviceEui}`);
    console.log(`[MELITA] Expected: 16 character hex string, got: ${deviceEui.length} characters`);
    
    // Versuche es trotzdem, falls es ein gültiges Format ist
    console.log(`[MELITA] Proceeding with device EUI: ${deviceEui}`);
  }
  
  // Verschiedene Downlink-Endpunkte testen
  for (const endpointTemplate of POSSIBLE_DOWNLINK_ENDPOINTS) {
    try {
      const endpoint = endpointTemplate.replace('{deviceEui}', deviceEui);
      const downlinkUrl = `${baseUrl}${endpoint}`;
      
      console.log(`[MELITA] Trying downlink endpoint: ${downlinkUrl}`);
      
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

      console.log(`[MELITA] Endpoint ${endpoint} response status:`, response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[MELITA] Downlink sent successfully via ${endpoint}:`, result);
        return result;
      } else {
        const errorText = await response.text();
        console.log(`[MELITA] Endpoint ${endpoint} failed: ${response.status} - ${errorText}`);
        
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
      console.log(`[MELITA] Endpoint ${endpointTemplate} error:`, error.message);
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

    // Melita.io Token holen
    const authToken = await getMelitaToken();

    // Downlink-Nachricht senden
    const result = await sendDownlinkToMelita(deviceEui, payload, authToken, confirmed, fPort);

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
