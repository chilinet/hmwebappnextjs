import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import sql from 'mssql';
import mqtt from 'mqtt';
import fs from 'fs';

// Preshared Key für Authentifizierung (optional, für externe Clients)
const LNS_API_KEY = process.env.LNS_API_KEY;

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
    const { deviceId, frm_payload, confirmed = false, priority = 'NORMAL' } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId (ThingsBoard Device ID) is required' });
    }

    if (!frm_payload) {
      return res.status(400).json({ error: 'frm_payload (HEX) is required' });
    }

    // HEX-Payload validieren
    if (typeof frm_payload !== 'string') {
      return res.status(400).json({ error: 'frm_payload must be a HEX string' });
    }

    // HEX-String validieren
    if (!/^[0-9a-fA-F]+$/.test(frm_payload)) {
      return res.status(400).json({ error: 'Invalid HEX string format' });
    }

    // Priority validieren
    const validPriorities = ['LOWEST', 'LOW', 'BELOW_NORMAL', 'NORMAL', 'ABOVE_NORMAL', 'HIGH', 'HIGHEST'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${validPriorities.join(', ')}` });
    }

    // ThingsBoard-Authentifizierung
    const THINGSBOARD_URL = process.env.THINGSBOARD_URL;
    const THINGSBOARD_USERNAME = process.env.THINGSBOARD_USERNAME;
    const THINGSBOARD_PASSWORD = process.env.THINGSBOARD_PASSWORD;

    if (!THINGSBOARD_URL || !THINGSBOARD_USERNAME || !THINGSBOARD_PASSWORD) {
      return res.status(500).json({
        error: 'ThingsBoard configuration incomplete',
        details: 'Missing THINGSBOARD_URL, THINGSBOARD_USERNAME, or THINGSBOARD_PASSWORD in environment variables'
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
          username: THINGSBOARD_USERNAME,
          password: THINGSBOARD_PASSWORD
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
    } catch (error) {
      console.error('[LNS] Error fetching ThingsBoard attributes:', error);
      return res.status(500).json({
        error: 'Failed to fetch device attributes from ThingsBoard',
        details: error.message,
        deviceId: deviceId
      });
    }

    // Weiter mit der bestehenden Logik, verwende die ermittelten Werte
    // (name2, deviceEui, f_port wurden jetzt aus ThingsBoard geholt)

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
              SELECT name2, [user] as username, passwort, url, type
              FROM ${tableName}
              WHERE name2 = @name2 AND type = 0
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
      if (!connectionResult || lastError) {
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
        error: 'Network connection not found or not MQTT type',
        name2: name2,
        details: 'No connection found with the specified name2 and type=0 (MQTT)'
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
    const hexBuffer = Buffer.from(frm_payload, 'hex');
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
          f_port: parseInt(f_port),
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
              f_port: parseInt(f_port),
              frm_payload_hex: frm_payload,
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

