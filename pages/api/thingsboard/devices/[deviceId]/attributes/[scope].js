import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';

const THINGSBOARD_URL = process.env.THINGSBOARD_URL;

// Gültige Attribute-Scopes
const VALID_SCOPES = ['SERVER_SCOPE', 'SHARED_SCOPE', 'CLIENT_SCOPE'];

export default async function handler(req, res) {
  const { deviceId, scope } = req.query;

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

  // Scope validieren
  if (!scope || !VALID_SCOPES.includes(scope)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid scope',
      message: `Ungültiger Scope. Gültige Scopes: ${VALID_SCOPES.join(', ')}`
    });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Hole Attribute für spezifischen Scope
        const attributesResponse = await fetch(
          `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/values/attributes/${scope}`,
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
        
        // Strukturiere die Daten
        const structuredAttributes = {};
        attributesData.forEach(attr => {
          structuredAttributes[attr.key] = {
            value: attr.value,
            lastUpdateTs: attr.lastUpdateTs,
            lastUpdate: new Date(attr.lastUpdateTs).toISOString()
          };
        });

        return res.status(200).json({
          success: true,
          data: {
            deviceId: deviceId,
            scope: scope,
            attributes: structuredAttributes,
            summary: {
              total: attributesData.length,
              keys: Object.keys(structuredAttributes)
            }
          }
        });

      case 'POST':
        // Setze Attribute für spezifischen Scope
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
          `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}`,
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
            scope: scope,
            attributesSet: attributesToSet.length,
            attributes: attributesToSet
          }
        });

      case 'DELETE':
        // Lösche alle Attribute für den Scope oder spezifische Attribute
        const { attributeKeys } = req.body;
        
        if (attributeKeys && Array.isArray(attributeKeys)) {
          // Lösche spezifische Attribute
          const deletePromises = attributeKeys.map(async (key) => {
            const deleteResponse = await fetch(
              `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}/${encodeURIComponent(key)}`,
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
              scope: scope,
              deleted: successfulDeletes.length,
              total: attributeKeys.length,
              results: deleteResults
            }
          });
        } else {
          // Lösche alle Attribute für den Scope
          const deleteAllResponse = await fetch(
            `${THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${deviceId}/attributes/${scope}`,
            {
              method: 'DELETE',
              headers: {
                'X-Authorization': `Bearer ${tbToken}`
              }
            }
          );

          if (!deleteAllResponse.ok) {
            const errorText = await deleteAllResponse.text();
            console.error('ThingsBoard API error:', deleteAllResponse.status, errorText);
            
            return res.status(deleteAllResponse.status).json({
              success: false,
              error: 'ThingsBoard API error',
              message: `Fehler beim Löschen aller Attribute: ${deleteAllResponse.status}`,
              details: errorText
            });
          }

          return res.status(200).json({
            success: true,
            message: 'Alle Attribute für den Scope erfolgreich gelöscht',
            data: {
              deviceId: deviceId,
              scope: scope,
              deleted: 'all'
            }
          });
        }

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).json({
          success: false,
          error: 'Method not allowed',
          message: `Methode ${req.method} nicht erlaubt`
        });
    }
  } catch (error) {
    console.error('Device attributes scope API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler beim Verarbeiten der Anfrage',
      details: error.message
    });
  }
} 