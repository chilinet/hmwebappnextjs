import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import sql from 'mssql';
import mqtt from 'mqtt';
import fs from 'fs';
import { getMelitaApiConnection, getMelitaToken } from "../../../lib/melitaAuth";

// Preshared Key für Authentifizierung (optional, für externe Clients)
const LNS_API_KEY = process.env.LNS_API_KEY;
const MELITA_DOWNLINK_ENDPOINT = '/api/iot-gateway/lorawan/{deviceEui}/queue';
const DEFAULT_HTTP_DOWNLINK_PATH = '/api/downlink';
const SUPPORTED_INTEGRATIONS = new Set(['ttn', 'melita']);

// Hilfsfunktion zur Authentifizierung
function authenticateRequest(req) {
  // Zuerst Session prüfen (für Web-UI)
  // Dann API-Key prüfen (für externe Clients)
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  
  // Prüfe Authorization Header (Bearer Token)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (LNS_API_KEY && token === LNS_API_KEY) {
      return true;
    }
  }
  
  // Prüfe X-API-Key Header
  if (apiKey && LNS_API_KEY && apiKey === LNS_API_KEY) {
    return true;
  }
  
  // Prüfe Query Parameter
  if (req.query.key && LNS_API_KEY && req.query.key === LNS_API_KEY) {
    return true;
  }
  
  return false;
}

function normalizeIntegration(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('melita')) return 'melita';
  if (raw.includes('thingpark') || raw.includes('actility')) return 'thingpark';
  if (raw.includes('ttn') || raw.includes('tti') || raw.includes('thingsstack')) return 'ttn';
  return raw;
}

function sanitizeHex(input) {
  return String(input || '').trim().replace(/\s+/g, '').toLowerCase();
}

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw}`.replace(/\/+$/, '');
}

function resolveHexPayload(body = {}) {
  const frmPayload = body.frm_payload ?? body.payloadHex;
  if (frmPayload != null && String(frmPayload).trim() !== '') {
    const hex = sanitizeHex(frmPayload);
    if (!/^[0-9a-f]+$/i.test(hex)) {
      throw new Error('Invalid HEX string format');
    }
    return hex;
  }

  const rawPayload = body.payload;
  const encoding = String(body.payloadEncoding || '').trim().toLowerCase();
  if (rawPayload == null || String(rawPayload).trim() === '') {
    throw new Error('frm_payload (HEX) or payload is required');
  }

  if (!encoding || encoding === 'hex') {
    const hex = sanitizeHex(rawPayload);
    if (!/^[0-9a-f]+$/i.test(hex)) {
      throw new Error('Invalid HEX string format');
    }
    return hex;
  }

  if (encoding === 'base64') {
    const base64Value = String(rawPayload).trim();
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Value)) {
      throw new Error('Invalid base64 string format');
    }
    return Buffer.from(base64Value, 'base64').toString('hex');
  }

  throw new Error('Unsupported payloadEncoding. Use hex or base64.');
}

async function sendDownlinkToMelita({ deviceEui, payloadHex, confirmed, fPort }) {
  const melitaConn = await getMelitaApiConnection();
  if (!melitaConn?.apiKey || !melitaConn?.baseUrl) {
    throw new Error('Melita API not configured');
  }
  const token = await getMelitaToken({ apiKey: melitaConn.apiKey, baseUrl: melitaConn.baseUrl });
  const cleanEui = String(deviceEui || '').trim().replace(/^eui-/i, '');
  const payloadBase64 = Buffer.from(payloadHex, 'hex').toString('base64');
  const endpoint = MELITA_DOWNLINK_ENDPOINT.replace('{deviceEui}', encodeURIComponent(cleanEui));
  const url = `${String(melitaConn.baseUrl).replace(/\/+$/, '')}${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      confirmed: !!confirmed,
      data: payloadBase64,
      devEUI: cleanEui,
      fPort: Number(fPort),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Melita downlink failed: ${response.status} ${text}`.trim());
  }
  return response.json().catch(() => ({}));
}

async function sendDownlinkOverHttpsAdapter({
  connection,
  deviceEui,
  payloadHex,
  confirmed,
  fPort,
  priority,
  integration,
  applicationId,
}) {
  const baseUrl = normalizeBaseUrl(connection?.url);
  if (!baseUrl) throw new Error('HTTPS connection URL missing');

  const payloadBase64 = Buffer.from(payloadHex, 'hex').toString('base64');
  const configuredPath = String(process.env.LNS_HTTP_DOWNLINK_PATH || DEFAULT_HTTP_DOWNLINK_PATH).trim();
  const downlinkPath = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
  const url = `${baseUrl}${downlinkPath}`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const apiKey = String(connection?.apiKey || '').trim();
  const username = String(connection?.username || connection?.user || '').trim();
  const password = String(connection?.passwort || connection?.password || '').trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['x-api-key'] = apiKey;
  } else if (username && password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      integration: normalizeIntegration(integration),
      applicationId: String(applicationId || '').trim(),
      deviceEui: String(deviceEui || '').trim().replace(/^eui-/i, ''),
      fPort: Number(fPort),
      confirmed: !!confirmed,
      priority,
      payloadHex,
      payloadBase64,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTPS downlink failed: ${response.status} ${text}`.trim());
  }
  return response.json().catch(() => ({}));
}

/**
 * LNS Downlink API
 * Sendet eine Downlink-Nachricht an einen IoT LNS über MQTT
 * 
 * Request Body:
 * - deviceId: ThingsBoard Device ID (z.B. "123e4567-e89b-12d3-a456-426614174000")
 * - frm_payload: Payload als HEX-String (z.B. "03F40B")
 * - confirmed: Boolean (optional, default: false)
 * - priority: String (optional, default: "NORMAL")
 * 
 * Die folgenden Werte werden aus ThingsBoard Client-Attributen ermittelt:
 * - device_id → deviceEui
 * - fPort → f_port
 * - integration + applicationid → name2 (Format: "integration:applicationid")
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authentifizierung prüfen: Session (für Web-UI) oder API-Key (für externe Clients)
    const session = await getServerSession(req, res, authOptions);
    const isApiKeyAuth = authenticateRequest(req);
    
    if (!session && !isApiKeyAuth) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required. Use session (for web UI) or API key (for external clients).',
        details: LNS_API_KEY 
          ? 'Use Authorization: Bearer <key>, X-API-Key: <key> or ?key=<key>'
          : 'API key authentication not configured. Set LNS_API_KEY environment variable or use web session.'
      });
    }
    
    // Für Logging: Email aus Session oder 'api-key' für externe Clients
    const userEmail = session?.user?.email || 'api-key-client';

    // Request-Body validieren
    const { deviceId, confirmed = false, priority = 'NORMAL' } = req.body || {};

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId (ThingsBoard Device ID) is required' });
    }

    let payloadHex;
    try {
      payloadHex = resolveHexPayload(req.body || {});
    } catch (payloadErr) {
      return res.status(400).json({ error: payloadErr.message });
    }

    // Priority validieren
    const validPriorities = ['LOWEST', 'LOW', 'BELOW_NORMAL', 'NORMAL', 'ABOVE_NORMAL', 'HIGH', 'HIGHEST'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${validPriorities.join(', ')}` });
    }

    // ThingsBoard-Authentifizierung (tenant credentials for server-side operations)
    const THINGSBOARD_URL = process.env.THINGSBOARD_URL;
    const tbUser = process.env.TENNANT_THINGSBOARD_USERNAME || process.env.THINGSBOARD_USERNAME;
    const tbPass = process.env.TENNANT_THINGSBOARD_PASSWORD || process.env.THINGSBOARD_PASSWORD;

    if (!THINGSBOARD_URL || !tbUser || !tbPass) {
      return res.status(500).json({
        error: 'ThingsBoard configuration incomplete',
        details: 'Missing THINGSBOARD_URL and TENNANT_THINGSBOARD_USERNAME/PASSWORD (or THINGSBOARD_USERNAME/PASSWORD) in environment variables'
      });
    }

    // ThingsBoard Token holen
    let tbToken;
    try {
      const tbLoginResponse = await fetch(`${THINGSBOARD_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: tbUser,
          password: tbPass
        }),
      });

      if (!tbLoginResponse.ok) {
        const errorText = await tbLoginResponse.text();
        return res.status(401).json({
          error: 'ThingsBoard authentication failed',
          details: errorText
        });
      }

      const tbLoginData = await tbLoginResponse.json();
      tbToken = tbLoginData.token;
    } catch (error) {
      console.error('[LNS] ThingsBoard login error:', error);
      return res.status(500).json({
        error: 'Failed to authenticate with ThingsBoard',
        details: error.message
      });
    }

    // Device Client-Attribute von ThingsBoard abrufen
    let deviceAttributes;
    let deviceEui, f_port, name2;
    
    try {
      const attributesResponse = await fetch(
        `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes/CLIENT_SCOPE`,
        {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!attributesResponse.ok) {
        const errorText = await attributesResponse.text();
        return res.status(attributesResponse.status).json({
          error: 'Failed to fetch device attributes from ThingsBoard',
          details: errorText,
          deviceId: deviceId
        });
      }

      const attributesData = await attributesResponse.json();
      
      // Konvertiere Array zu Objekt für einfacheren Zugriff
      deviceAttributes = {};
      attributesData.forEach(attr => {
        deviceAttributes[attr.key] = attr.value;
      });

      // Erforderliche Attribute prüfen
      deviceEui = deviceAttributes.device_id;
      f_port = deviceAttributes.fPort;
      const integration = deviceAttributes.integration;
      const applicationid = deviceAttributes.applicationid;

      if (!deviceEui) {
        return res.status(400).json({
          error: 'Missing required device attribute',
          details: 'device_id attribute not found in ThingsBoard client attributes',
          deviceId: deviceId,
          availableAttributes: Object.keys(deviceAttributes)
        });
      }

      if (f_port === undefined || f_port === null) {
        return res.status(400).json({
          error: 'Missing required device attribute',
          details: 'fPort attribute not found in ThingsBoard client attributes',
          deviceId: deviceId,
          availableAttributes: Object.keys(deviceAttributes)
        });
      }

      if (!integration || !applicationid) {
        return res.status(400).json({
          error: 'Missing required device attributes',
          details: 'integration and/or applicationid attributes not found in ThingsBoard client attributes',
          deviceId: deviceId,
          availableAttributes: Object.keys(deviceAttributes)
        });
      }

      // name2 aus integration und applicationid erstellen
      name2 = `${integration}:${applicationid}`;

      const normalizedIntegration = normalizeIntegration(integration);
      if (!SUPPORTED_INTEGRATIONS.has(normalizedIntegration)) {
        return res.status(422).json({
          error: 'Unsupported integration for downlink delivery',
          integration: normalizedIntegration || 'unknown',
          supportedIntegrations: Array.from(SUPPORTED_INTEGRATIONS),
        });
      }
      if (normalizedIntegration === 'melita') {
        const melitaResult = await sendDownlinkToMelita({
          deviceEui,
          payloadHex,
          confirmed,
          fPort: Number(req.body?.fPort ?? f_port),
        });

        return res.status(200).json({
          success: true,
          message: 'Downlink message sent successfully',
          integration: normalizedIntegration,
          transport: 'https',
          encoding: { input: 'hex', provider: 'base64' },
          deviceId,
          deviceEui,
          payload: {
            frm_payload_hex: payloadHex,
            frm_payload_base64: Buffer.from(payloadHex, 'hex').toString('base64'),
            confirmed,
            f_port: Number(req.body?.fPort ?? f_port),
            priority,
          },
          result: melitaResult,
          timestamp: new Date().toISOString(),
          user: userEmail,
        });
      }
    } catch (error) {
      console.error('[LNS] Error fetching ThingsBoard attributes:', error);
      return res.status(500).json({
        error: 'Failed to fetch device attributes from ThingsBoard',
        details: error.message,
        deviceId: deviceId
      });
    }

    // Weiter mit der bestehenden Logik; fPort kann pro Request überschrieben werden.
    const effectiveFPort = Number(req.body?.fPort ?? f_port);

    // MSSQL-Zugangsdaten aus .env lesen
    const mssqlConfig = {
      user: process.env.MSSQL_USER,
      password: process.env.MSSQL_PASSWORD,
      server: process.env.MSSQL_SERVER,
      database: process.env.MSSQL_DATABASE,
      port: process.env.MSSQL_PORT ? parseInt(process.env.MSSQL_PORT) : 1433,
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 30000,
        requestTimeout: 30000,
      },
    };

    // Validierung der Konfiguration
    if (!mssqlConfig.user || !mssqlConfig.password || !mssqlConfig.server || !mssqlConfig.database) {
      return res.status(500).json({
        error: 'Database configuration incomplete',
        details: 'Missing MSSQL environment variables. Required: MSSQL_USER, MSSQL_PASSWORD, MSSQL_SERVER, MSSQL_DATABASE',
        missing: {
          user: !mssqlConfig.user,
          password: !mssqlConfig.password,
          server: !mssqlConfig.server,
          database: !mssqlConfig.database
        }
      });
    }

    // Verbindungsdaten aus nwconnections Tabelle abrufen
    let pool;
    let connectionResult;
    
    try {
      // Erstelle direkte Verbindung mit .env-Variablen
      pool = await sql.connect(mssqlConfig);
      
      // Versuche verschiedene Tabellennamen/Schemas
      const tableVariants = [
        `${mssqlConfig.database}.dbo.nwconnections`,
        'dbo.nwconnections',
        'nwconnections'
      ];
      
      let lastError = null;
      
      for (const tableName of tableVariants) {
        try {
          connectionResult = await pool.request()
            .input('name2', sql.NVarChar, name2)
            .query(`
              SELECT name2, [user] as username, passwort, url, type, [APIkey] AS apiKey
              FROM ${tableName}
              WHERE name2 = @name2
            `);
          // Erfolgreich, breche Schleife ab
          break;
        } catch (error) {
          lastError = error;
          // Weiter mit nächstem Varianten
          continue;
        }
      }
      // console.log('************************************************')
      // console.log(connectionResult);
      // console.log('************************************************')   
      
      // Wenn alle Versuche fehlgeschlagen sind
      if (!connectionResult) {
        console.error('[LNS] Database query error:', lastError);
        await pool.close();
        return res.status(500).json({
          error: 'Database query failed',
          details: lastError?.message || 'Failed to query nwconnections table',
          hint: 'Please check if the table "nwconnections" exists in your database',
          attemptedTables: tableVariants,
          database: mssqlConfig.database,
          server: mssqlConfig.server
        });
      }
    } catch (connectionError) {
      console.error('[LNS] Database connection error:', connectionError);
      return res.status(500).json({
        error: 'Database connection failed',
        details: connectionError.message,
        database: mssqlConfig.database,
        server: mssqlConfig.server
      });
    }

    if (connectionResult.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ 
        error: 'Network connection not found',
        name2: name2,
        details: 'No connection found with the specified name2'
      });
    }

    const connection = connectionResult.recordset[0];
    
    // Verbindung schließen nach erfolgreicher Abfrage
    await pool.close();

    // name2 parsen: Format "typ:applicationid" (z.B. "ttn:2")
    let applicationId = null;
    if (connection.name2) {
      const parts = connection.name2.split(':');
      if (parts.length >= 2) {
        applicationId = parts.slice(1).join(':'); // Falls mehrere Doppelpunkte vorhanden sind
      }
    }

    const connectionType = Number(connection.type);
    const normalizedIntegration = normalizeIntegration(deviceAttributes.integration);
    if (connectionType === 1) {
      const httpResult = await sendDownlinkOverHttpsAdapter({
        connection,
        deviceEui,
        payloadHex,
        confirmed,
        fPort: effectiveFPort,
        priority,
        integration: normalizedIntegration,
        applicationId,
      });

      return res.status(200).json({
        success: true,
        message: 'Downlink message sent successfully',
        integration: normalizedIntegration || 'unknown',
        transport: 'https',
        encoding: { input: 'hex', provider: 'hex/base64' },
        deviceId,
        deviceEui,
        payload: {
          frm_payload_hex: payloadHex,
          frm_payload_base64: Buffer.from(payloadHex, 'hex').toString('base64'),
          confirmed,
          f_port: effectiveFPort,
          priority,
        },
        result: httpResult,
        timestamp: new Date().toISOString(),
        user: userEmail,
      });
    }

    
   // console.log('************************************************')
   // console.log(connection);
   // console.log('************************************************')

    // username aus connection holen (kann als 'username' oder 'user' kommen)
    const username = connection.username || connection.user;
    
    if (!username || !connection.passwort || !connection.url) {
      await pool.close();
      return res.status(400).json({ 
        error: 'Incomplete connection data',
        details: 'Missing user, password, or URL in nwconnections table',
        missing: {
          user: !username,
          passwort: !connection.passwort,
          url: !connection.url
        },
        connectionData: {
          hasUser: !!username,
          hasUsername: !!connection.username,
          hasUserField: !!connection.user,
          hasPasswort: !!connection.passwort,
          hasUrl: !!connection.url,
          name2: connection.name2,
          type: connection.type,
          allFields: Object.keys(connection)
        }
      });
    }

    // CA-Zertifikat-Pfad aus .env
    const caFilePath = process.env.MQTT_CA_FILE || '/etc/ssl/cert.pem';
    
    // Prüfen ob CA-Datei existiert
    const caFileExists = fs.existsSync(caFilePath);
    if (!caFileExists) {
      console.warn(`[LNS] CA file not found at ${caFilePath}, proceeding without CA verification`);
    }

    // URL parsen: Falls Port bereits enthalten ist, trennen
    let mqttHost = connection.url;
    let mqttPort = 8883;
    
    // Prüfe ob URL bereits Port enthält (z.B. "host:8883")
    if (mqttHost.includes(':')) {
      const urlParts = mqttHost.split(':');
      mqttHost = urlParts[0];
      if (urlParts[1]) {
        mqttPort = parseInt(urlParts[1]) || 8883;
      }
    }
    
    // Entferne Protokoll-Präfix falls vorhanden (z.B. "mqtts://host")
    mqttHost = mqttHost.replace(/^(mqtts?|ws|wss):\/\//, '');
    
    // MQTT-Verbindungsoptionen
    const mqttOptions = {
      hostname: mqttHost, // Verwende hostname statt host
      port: mqttPort,
      username: username,
      password: connection.passwort,
      protocol: 'mqtts', // MQTT over TLS
      rejectUnauthorized: caFileExists, // Nur verifizieren wenn CA-Datei vorhanden
      ...(caFileExists && { ca: fs.readFileSync(caFilePath) })
    };
    
    console.log(`[LNS] MQTT connection options:`, {
      hostname: mqttOptions.hostname,
      port: mqttOptions.port,
      protocol: mqttOptions.protocol,
      username: mqttOptions.username,
      hasPassword: !!mqttOptions.password,
      hasCA: caFileExists
    });

    // HEX-Payload zu Base64 konvertieren (wie im Beispiel)
    const hexBuffer = Buffer.from(payloadHex, 'hex');
    const base64Payload = hexBuffer.toString('base64');

    // Device EUI Format normalisieren: Falls kein "eui-" Präfix vorhanden ist, hinzufügen
    let normalizedDeviceEui = deviceEui.trim();
    if (!normalizedDeviceEui.toLowerCase().startsWith('eui-')) {
      normalizedDeviceEui = `eui-${normalizedDeviceEui}`;
    }

    // Topic generieren: v3/{username}/devices/{deviceEui}/down/push
    const topic = `v3/${username}/devices/${normalizedDeviceEui}/down/push`;

    // Downlink-Message erstellen
    const downlinkMessage = {
      downlinks: [
        {
          f_port: parseInt(effectiveFPort),
          frm_payload: base64Payload,
          confirmed: confirmed,
          priority: priority
        }
      ]
    };

    // MQTT-Client erstellen und verbinden
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(mqttOptions);

      client.on('connect', () => {
        console.log(`[LNS] MQTT connected to ${connection.url}`);
        
        // Nachricht publizieren
        client.publish(topic, JSON.stringify(downlinkMessage), { qos: 1 }, (err) => {
          client.end();
          
          if (err) {
            console.error('[LNS] MQTT publish error:', err);
            return reject({
              status: 500,
              error: 'Failed to publish MQTT message',
              details: err.message
            });
          }

          console.log(`[LNS] Downlink message sent successfully to topic: ${topic}`);
          
          resolve({
            success: true,
            message: 'Downlink message sent successfully',
            name2: name2,
            deviceEui: deviceEui,
            deviceEuiNormalized: normalizedDeviceEui,
            topic: topic,
            payload: {
              f_port: parseInt(effectiveFPort),
              frm_payload_hex: payloadHex,
              frm_payload_base64: base64Payload,
              confirmed: confirmed,
              priority: priority
            },
            timestamp: new Date().toISOString(),
            user: userEmail
          });
        });
      });

      client.on('error', (err) => {
        console.error('[LNS] MQTT connection error:', err);
        client.end();
        reject({
          status: 500,
          error: 'MQTT connection failed',
          details: err.message
        });
      });

      // Timeout nach 10 Sekunden
      setTimeout(() => {
        if (client.connected) {
          client.end();
        }
        reject({
          status: 500,
          error: 'MQTT connection timeout',
          details: 'Connection attempt timed out after 10 seconds'
        });
      }, 10000);
    }).then((result) => {
      return res.status(200).json(result);
    }).catch((error) => {
      const status = error.status || 500;
      return res.status(status).json({
        error: error.error || 'Failed to send downlink message',
        details: error.details || error.message,
        timestamp: new Date().toISOString()
      });
    });

  } catch (error) {
    console.error('[LNS] API Error:', error);
    
    return res.status(500).json({
      error: 'Failed to send downlink message',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

