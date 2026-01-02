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
 * - name2: Name2 aus nwconnections Tabelle (Format: "typ:applicationid", z.B. "ttn:2")
 * - deviceEui: Device EUI (z.B. "eui-7066e1fffe01ac4a")
 * - f_port: F-Port (z.B. 10)
 * - frm_payload: Payload als HEX-String (z.B. "03F40B")
 * - confirmed: Boolean (optional, default: false)
 * - priority: String (optional, default: "NORMAL")
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
    const { name2, deviceEui, f_port, frm_payload, confirmed = false, priority = 'NORMAL' } = req.body;

    if (!name2) {
      return res.status(400).json({ error: 'name2 is required (format: "typ:applicationid", e.g. "ttn:2")' });
    }

    if (!deviceEui) {
      return res.status(400).json({ error: 'deviceEui is required' });
    }

    if (f_port === undefined || f_port === null) {
      return res.status(400).json({ error: 'f_port is required' });
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

