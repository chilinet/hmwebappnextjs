import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';

const THINGSBOARD_URL = process.env.THINGSBOARD_URL;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
    });
  }

  const { 
    fromId, 
    fromType, 
    toId, 
    toType, 
    relationType, 
    relationTypeGroup = 'COMMON',
    maxLevel = '1'
  } = req.query;

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

  // Validierung der Parameter
  if (!fromId && !toId) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameters',
      message: 'Mindestens fromId oder toId muss angegeben werden'
    });
  }

  // Gültige Entity-Types
  const validEntityTypes = ['DEVICE', 'ASSET', 'CUSTOMER', 'TENANT', 'USER'];
  const validRelationTypeGroups = ['COMMON', 'ALARM', 'DASHBOARD'];

  if (fromType && !validEntityTypes.includes(fromType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid fromType',
      message: `Ungültiger fromType. Gültige Typen: ${validEntityTypes.join(', ')}`
    });
  }

  if (toType && !validEntityTypes.includes(toType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid toType',
      message: `Ungültiger toType. Gültige Typen: ${validEntityTypes.join(', ')}`
    });
  }

  if (relationTypeGroup && !validRelationTypeGroups.includes(relationTypeGroup)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid relationTypeGroup',
      message: `Ungültiger relationTypeGroup. Gültige Gruppen: ${validRelationTypeGroups.join(', ')}`
    });
  }

  try {
    let apiUrl = `${THINGSBOARD_URL}/api/relations/info?`;

    // Parameter zur URL hinzufügen
    if (fromId) {
      apiUrl += `fromId=${encodeURIComponent(fromId)}`;
      if (fromType) {
        apiUrl += `&fromType=${fromType}`;
      }
    }

    if (toId) {
      if (fromId) apiUrl += '&';
      apiUrl += `toId=${encodeURIComponent(toId)}`;
      if (toType) {
        apiUrl += `&toType=${toType}`;
      }
    }

    if (relationType) {
      apiUrl += `&relationType=${encodeURIComponent(relationType)}`;
    }

    if (relationTypeGroup) {
      apiUrl += `&relationTypeGroup=${relationTypeGroup}`;
    }

    if (maxLevel) {
      apiUrl += `&maxLevel=${maxLevel}`;
    }

    // Construct ThingsBoard Relations API URL

    // Relations von ThingsBoard abrufen
    const response = await fetch(apiUrl, {
      headers: {
        'accept': 'application/json',
        'X-Authorization': `Bearer ${tbToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ThingsBoard API error:', response.status, errorText);
      
      return res.status(response.status).json({
        success: false,
        error: 'ThingsBoard API error',
        message: `Fehler beim Abrufen der Relations: ${response.status}`,
        details: errorText
      });
    }

    const relationsData = await response.json();
    const relations = Array.isArray(relationsData) ? relationsData : [];

    // Sammle alle eindeutigen Entity-IDs für zusätzliche API-Aufrufe
    const entityIds = new Set();
    relations.forEach(relation => {
      if (relation.from?.id) entityIds.add(relation.from.id);
      if (relation.to?.id) entityIds.add(relation.to.id);
    });

    // Hole vollständige Entity-Details für alle Entities
    const entityDetails = {};
    const entityDetailsPromises = Array.from(entityIds).map(async (entityId) => {
      try {
        // Versuche verschiedene ThingsBoard API-Endpunkte für Entity-Details
        let entityData = null;
        
        // 1. Versuche /api/device/{deviceId} für Devices
        const deviceResponse = await fetch(
          `${THINGSBOARD_URL}/api/device/${entityId}`,
          {
            headers: {
              'accept': 'application/json',
              'X-Authorization': `Bearer ${tbToken}`
            }
          }
        );

        if (deviceResponse.ok) {
          entityData = await deviceResponse.json();
          // Device details found
        } else {
          // 2. Versuche /api/asset/{assetId} für Assets
          const assetResponse = await fetch(
            `${THINGSBOARD_URL}/api/asset/${entityId}`,
            {
              headers: {
                'accept': 'application/json',
                'X-Authorization': `Bearer ${tbToken}`
              }
            }
          );

          if (assetResponse.ok) {
            entityData = await assetResponse.json();
            // Asset details found
          } else {
            // 3. Versuche /api/customer/{customerId} für Customers
            const customerResponse = await fetch(
              `${THINGSBOARD_URL}/api/customer/${entityId}`,
              {
                headers: {
                  'accept': 'application/json',
                  'X-Authorization': `Bearer ${tbToken}`
                }
              }
            );

            if (customerResponse.ok) {
              entityData = await customerResponse.json();
              // Customer details found
            } else {
              // 4. Versuche /api/tenant/{tenantId} für Tenants
              const tenantResponse = await fetch(
                `${THINGSBOARD_URL}/api/tenant/${entityId}`,
                {
                  headers: {
                    'accept': 'application/json',
                    'X-Authorization': `Bearer ${tbToken}`
                  }
                }
              );

              if (tenantResponse.ok) {
                entityData = await tenantResponse.json();
                // Tenant details found
              } else {
                console.error(`Failed to fetch entity details for ${entityId} from all endpoints`);
                entityDetails[entityId] = null;
                return;
              }
            }
          }
        }

        entityDetails[entityId] = entityData;
      } catch (error) {
        console.error(`Error fetching entity details for ${entityId}:`, error);
        entityDetails[entityId] = null;
      }
    });

    // Warte auf alle Entity-Details
    await Promise.all(entityDetailsPromises);
    
    // Entity details collected

    // Relations strukturieren und erweitern
    const structuredRelations = relations.map(relation => {
      // Hole Entity-Details für from und to
      const fromDetails = entityDetails[relation.from?.id] || {};
      const toDetails = entityDetails[relation.to?.id] || {};

      const structuredRelation = {
        // Vollständige Relation-Informationen
        id: relation.id?.id,
        type: relation.type,
        typeGroup: relation.typeGroup,
        additionalInfo: relation.additionalInfo || {},
        
        // Vollständige "from" Entity-Informationen
        from: {
          id: relation.from?.id,
          name: fromDetails.name || relation.from?.name || 'Unbekannt',
          type: relation.from?.entityType || 'UNKNOWN',
          label: fromDetails.label || relation.from?.label || fromDetails.name || 'Unbekannt',
          // Alle zusätzlichen Felder aus der ThingsBoard-Response
          additionalInfo: fromDetails.additionalInfo || relation.from?.additionalInfo || {},
          createdTime: fromDetails.createdTime || relation.from?.createdTime,
          tenantId: fromDetails.tenantId?.id || relation.from?.tenantId?.id,
          customerId: fromDetails.customerId?.id || relation.from?.customerId?.id,
          // Device-spezifische Felder
          active: fromDetails.active || relation.from?.active,
          lastActivityTime: fromDetails.lastActivityTime || relation.from?.lastActivityTime,
          // Asset-spezifische Felder
          assetProfileId: fromDetails.assetProfileId?.id || relation.from?.assetProfileId?.id,
          // User-spezifische Felder
          email: fromDetails.email || relation.from?.email,
          firstName: fromDetails.firstName || relation.from?.firstName,
          lastName: fromDetails.lastName || relation.from?.lastName,
          // Customer-spezifische Felder
          title: fromDetails.title || relation.from?.title,
          country: fromDetails.country || relation.from?.country,
          state: fromDetails.state || relation.from?.state,
          city: fromDetails.city || relation.from?.city,
          address: fromDetails.address || relation.from?.address,
          address2: fromDetails.address2 || relation.from?.address2,
          zip: fromDetails.zip || relation.from?.zip,
          phone: fromDetails.phone || relation.from?.phone,
          // Tenant-spezifische Felder
          region: fromDetails.region || relation.from?.region,
          // Vollständige Entity-Referenz
          entityId: relation.from?.id,
          entityType: relation.from?.entityType
        },
        
        // Vollständige "to" Entity-Informationen
        to: {
          id: relation.to?.id,
          name: toDetails.name || relation.to?.name || 'Unbekannt',
          type: relation.to?.entityType || 'UNKNOWN',
          label: toDetails.label || relation.to?.label || toDetails.name || 'Unbekannt',
          // Alle zusätzlichen Felder aus der ThingsBoard-Response
          additionalInfo: toDetails.additionalInfo || relation.to?.additionalInfo || {},
          createdTime: toDetails.createdTime || relation.to?.createdTime,
          tenantId: toDetails.tenantId?.id || relation.to?.tenantId?.id,
          customerId: toDetails.customerId?.id || relation.to?.customerId?.id,
          // Device-spezifische Felder
          active: toDetails.active || relation.to?.active,
          lastActivityTime: toDetails.lastActivityTime || relation.to?.lastActivityTime,
          // Asset-spezifische Felder
          assetProfileId: toDetails.assetProfileId?.id || relation.to?.assetProfileId?.id,
          // User-spezifische Felder
          email: toDetails.email || relation.to?.email,
          firstName: toDetails.firstName || relation.to?.firstName,
          lastName: toDetails.lastName || relation.to?.lastName,
          // Customer-spezifische Felder
          title: toDetails.title || relation.to?.title,
          country: toDetails.country || relation.to?.country,
          state: toDetails.state || relation.to?.state,
          city: toDetails.city || relation.to?.city,
          address: toDetails.address || relation.to?.address,
          address2: toDetails.address2 || relation.to?.address2,
          zip: toDetails.zip || relation.to?.zip,
          phone: toDetails.phone || relation.to?.phone,
          // Tenant-spezifische Felder
          region: toDetails.region || relation.to?.region,
          // Vollständige Entity-Referenz
          entityId: relation.to?.id,
          entityType: relation.to?.entityType
        }
      };

      // Zusätzliche strukturierte Informationen basierend auf Entity-Typ
      if (relation.from?.entityType === 'DEVICE') {
        structuredRelation.from.deviceInfo = {
          active: fromDetails.active || relation.from?.active,
          lastActivityTime: fromDetails.lastActivityTime || relation.from?.lastActivityTime,
          type: fromDetails.type || relation.from?.type,
          label: fromDetails.label || relation.from?.label,
          additionalInfo: fromDetails.additionalInfo || relation.from?.additionalInfo
        };
      }

      if (relation.to?.entityType === 'DEVICE') {
        structuredRelation.to.deviceInfo = {
          active: toDetails.active || relation.to?.active,
          lastActivityTime: toDetails.lastActivityTime || relation.to?.lastActivityTime,
          type: toDetails.type || relation.to?.type,
          label: toDetails.label || relation.to?.label,
          additionalInfo: toDetails.additionalInfo || relation.to?.additionalInfo
        };
      }

      if (relation.from?.entityType === 'ASSET') {
        structuredRelation.from.assetInfo = {
          type: fromDetails.type || relation.from?.type,
          label: fromDetails.label || relation.from?.label,
          additionalInfo: fromDetails.additionalInfo || relation.from?.additionalInfo,
          assetProfileId: fromDetails.assetProfileId?.id || relation.from?.assetProfileId?.id
        };
      }

      if (relation.to?.entityType === 'ASSET') {
        structuredRelation.to.assetInfo = {
          type: toDetails.type || relation.to?.type,
          label: toDetails.label || relation.to?.label,
          additionalInfo: toDetails.additionalInfo || relation.to?.additionalInfo,
          assetProfileId: toDetails.assetProfileId?.id || relation.to?.assetProfileId?.id
        };
      }

      return structuredRelation;
    });

    // Statistiken berechnen
    const stats = {
      total: structuredRelations.length,
      byType: {},
      byFromType: {},
      byToType: {}
    };

    structuredRelations.forEach(relation => {
      // Nach Relation-Typ gruppieren
      if (!stats.byType[relation.type]) {
        stats.byType[relation.type] = 0;
      }
      stats.byType[relation.type]++;

      // Nach From-Type gruppieren
      if (!stats.byFromType[relation.from.type]) {
        stats.byFromType[relation.from.type] = 0;
      }
      stats.byFromType[relation.from.type]++;

      // Nach To-Type gruppieren
      if (!stats.byToType[relation.to.type]) {
        stats.byToType[relation.to.type] = 0;
      }
      stats.byToType[relation.to.type]++;
    });

    return res.status(200).json({
      success: true,
      data: {
        query: {
          fromId: fromId || null,
          fromType: fromType || null,
          toId: toId || null,
          toType: toType || null,
          relationType: relationType || null,
          relationTypeGroup: relationTypeGroup,
          maxLevel: maxLevel
        },
        relations: structuredRelations,
        statistics: stats,
        summary: {
          totalRelations: stats.total,
          relationTypes: Object.keys(stats.byType),
          fromTypes: Object.keys(stats.byFromType),
          toTypes: Object.keys(stats.byToType)
        }
      }
    });

  } catch (error) {
    console.error('Relations API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler beim Verarbeiten der Anfrage',
      details: error.message
    });
  }
} 