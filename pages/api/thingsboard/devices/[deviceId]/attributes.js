import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';

const THINGSBOARD_URL = process.env.THINGSBOARD_URL;

export default async function handler(req, res) {
  const { deviceId } = req.query;

  // Authentifizierung prüfen
  let tbToken = null;

  // Versuche zuerst den Bearer Token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
      tbToken = decoded.tbToken;
    } catch (err) {
      console.error('JWT verification failed:', err);
    }
  }

  // Wenn kein gültiger Bearer Token, versuche Session
  if (!tbToken) {
    const session = await getSession({ req });
    if (session?.tbToken) {
      tbToken = session.tbToken;
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

  // Device ID validieren
  if (!deviceId) {
    return res.status(400).json({
      success: false,
      error: 'Missing device ID',
      message: 'Device ID ist erforderlich'
    });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Hole alle Attribute des Devices
        const attributesResponse = await fetch(
          `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes`,
          {
            headers: {
              'X-Authorization': `Bearer ${tbToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!attributesResponse.ok) {
          const errorText = await attributesResponse.text();
          console.error('ThingsBoard API error:', attributesResponse.status, errorText);
          
          return res.status(attributesResponse.status).json({
            success: false,
            error: 'ThingsBoard API error',
            message: `Fehler beim Abrufen der Device-Attribute: ${attributesResponse.status}`,
            details: errorText
          });
        }

        const attributesData = await attributesResponse.json();
        
        // Strukturiere die Daten für bessere Verwendung
        const structuredAttributes = {
          server: {},
          shared: {},
          client: {}
        };

        // Gruppiere Attribute nach Typ
        attributesData.forEach(attr => {
          const key = attr.key;
          const value = attr.value;
          const lastUpdateTs = attr.lastUpdateTs;
          
          // Bestimme den Attribut-Typ basierend auf dem Key oder anderen Indikatoren
          let type = 'shared'; // Standard
          
          // Hier können Sie spezifische Logik für die Kategorisierung hinzufügen
          // Zum Beispiel basierend auf Key-Präfixen oder anderen Regeln
          if (key.startsWith('server_')) {
            type = 'server';
          } else if (key.startsWith('client_')) {
            type = 'client';
          }
          
          structuredAttributes[type][key] = {
            value: value,
            lastUpdateTs: lastUpdateTs,
            lastUpdate: new Date(lastUpdateTs).toISOString()
          };
        });

        return res.status(200).json({
          success: true,
          data: {
            deviceId: deviceId,
            attributes: structuredAttributes,
            summary: {
              total: attributesData.length,
              server: Object.keys(structuredAttributes.server).length,
              shared: Object.keys(structuredAttributes.shared).length,
              client: Object.keys(structuredAttributes.client).length
            }
          }
        });

      case 'POST':
        // Setze Attribute für das Device
        const { attributes } = req.body;
        
        if (!attributes || typeof attributes !== 'object') {
          return res.status(400).json({
            success: false,
            error: 'Invalid attributes',
            message: 'Attribut-Daten sind erforderlich'
          });
        }

        // Bereite die Attribute für ThingsBoard vor
        const attributesToSet = Object.entries(attributes).map(([key, value]) => ({
          key: key,
          value: value
        }));

        const setAttributesResponse = await fetch(
          `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/attributes/SHARED_SCOPE`,
          {
            method: 'POST',
            headers: {
              'X-Authorization': `Bearer ${tbToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(attributesToSet)
          }
        );

        if (!setAttributesResponse.ok) {
          const errorText = await setAttributesResponse.text();
          console.error('ThingsBoard API error:', setAttributesResponse.status, errorText);
          
          return res.status(setAttributesResponse.status).json({
            success: false,
            error: 'ThingsBoard API error',
            message: `Fehler beim Setzen der Device-Attribute: ${setAttributesResponse.status}`,
            details: errorText
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Attribute erfolgreich gesetzt',
          data: {
            deviceId: deviceId,
            attributesSet: attributesToSet.length
          }
        });

      case 'DELETE':
        // Lösche spezifische Attribute
        const { attributeKeys } = req.body;
        
        if (!attributeKeys || !Array.isArray(attributeKeys)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid attribute keys',
            message: 'Liste der zu löschenden Attribute ist erforderlich'
          });
        }

        // Lösche Attribute einzeln (ThingsBoard API unterstützt kein Bulk-Delete)
        const deletePromises = attributeKeys.map(async (key) => {
          const deleteResponse = await fetch(
            `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/attributes/SHARED_SCOPE/${encodeURIComponent(key)}`,
            {
              method: 'DELETE',
              headers: {
                'X-Authorization': `Bearer ${tbToken}`
              }
            }
          );
          
          return {
            key: key,
            success: deleteResponse.ok,
            status: deleteResponse.status
          };
        });

        const deleteResults = await Promise.all(deletePromises);
        const successfulDeletes = deleteResults.filter(result => result.success);

        return res.status(200).json({
          success: true,
          message: `${successfulDeletes.length} von ${attributeKeys.length} Attributen erfolgreich gelöscht`,
          data: {
            deviceId: deviceId,
            deleted: successfulDeletes.length,
            total: attributeKeys.length,
            results: deleteResults
          }
        });

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).json({
          success: false,
          error: 'Method not allowed',
          message: `Methode ${req.method} nicht erlaubt`
        });
    }
  } catch (error) {
    console.error('Device attributes API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler beim Verarbeiten der Anfrage',
      details: error.message
    });
  }
} 