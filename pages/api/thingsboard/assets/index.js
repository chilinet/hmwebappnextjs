import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getSession } from 'next-auth/react';
import jwt from 'jsonwebtoken';
import { getConnection } from '../../../../lib/db';
import sql from 'mssql';

const THINGSBOARD_URL = process.env.THINGSBOARD_URL;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Nur GET-Anfragen sind erlaubt'
    });
  }

  const { customerId } = req.query;

  // Authentifizierung prüfen
  let tbToken = null;
  let resolvedCustomerId = null;

  // Versuche zuerst den Bearer Token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
      tbToken = decoded.tbToken;
      resolvedCustomerId = decoded.customerId;
    } catch (err) {
      console.error('JWT verification failed:', err);
    }
  }

  // Wenn kein gültiger Bearer Token, versuche Session
  if (!tbToken) {
    const session = await getSession({ req });
    if (session?.tbToken) {
      tbToken = session.tbToken;
      resolvedCustomerId = session.user?.customerid;
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

  // Customer ID auflösen
  if (customerId) {
    // Verwende die übergebene Customer ID
    resolvedCustomerId = customerId;
  } else if (!resolvedCustomerId) {
    // Versuche Customer ID aus der Session zu holen
    try {
      const session = await getServerSession(req, res, authOptions);
      if (session?.user?.customerid) {
        resolvedCustomerId = session.user.customerid;
      } else {
        // Fallback: Hole Customer ID aus der Datenbank
        const pool = await getConnection();
        const userResult = await pool.request()
          .input('userid', sql.Int, session?.user?.userid)
          .query(`
            SELECT customerid
            FROM hm_users
            WHERE userid = @userid
          `);

        if (userResult.recordset.length > 0) {
          resolvedCustomerId = userResult.recordset[0].customerid;
        }
      }
    } catch (error) {
      console.error('Error getting customer ID:', error);
    }
  }

  if (!resolvedCustomerId) {
    return res.status(400).json({
      success: false,
      error: 'Missing customer ID',
      message: 'Customer ID konnte nicht ermittelt werden. Bitte geben Sie customerId als Query-Parameter an.'
    });
  }

  try {
    // Alle Assets des Kunden von ThingsBoard abrufen
    const assetsResponse = await fetch(
      `${THINGSBOARD_URL}/api/customer/${resolvedCustomerId}/assets?pageSize=1000&page=0`,
      {
        headers: {
          'accept': 'application/json',
          'X-Authorization': `Bearer ${tbToken}`
        }
      }
    );

    if (!assetsResponse.ok) {
      const errorText = await assetsResponse.text();
      console.error('ThingsBoard API error:', assetsResponse.status, errorText);
      
      return res.status(assetsResponse.status).json({
        success: false,
        error: 'ThingsBoard API error',
        message: `Fehler beim Abrufen der Assets: ${assetsResponse.status}`,
        details: errorText
      });
    }

    const assetsData = await assetsResponse.json();
    const assets = assetsData.data || [];

    // Für jedes Asset zusätzliche Informationen abrufen
    const assetsWithDetails = await Promise.all(
      assets.map(async (asset) => {
        try {
          // Device-Beziehungen abrufen
          let deviceCount = 0;
          try {
            const relationsResponse = await fetch(
              `${THINGSBOARD_URL}/api/relations/info?fromId=${asset.id.id}&fromType=ASSET&relationType=CONTAINS&toType=DEVICE`,
              {
                headers: {
                  'accept': 'application/json',
                  'X-Authorization': `Bearer ${tbToken}`
                }
              }
            );

            if (relationsResponse.ok) {
              const relations = await relationsResponse.json();
              deviceCount = Array.isArray(relations) ? relations.length : 0;
            }
          } catch (error) {
            console.error(`Error getting device relations for asset ${asset.id.id}:`, error);
          }

          // Asset-Hierarchie abrufen (falls verfügbar)
          let parentAsset = null;
          try {
            const parentRelationsResponse = await fetch(
              `${THINGSBOARD_URL}/api/relations/info?toId=${asset.id.id}&toType=ASSET&relationType=CONTAINS`,
              {
                headers: {
                  'accept': 'application/json',
                  'X-Authorization': `Bearer ${tbToken}`
                }
              }
            );

            if (parentRelationsResponse.ok) {
              const parentRelations = await parentRelationsResponse.json();
              const parentRelation = parentRelations.find(r => r.from.entityType === 'ASSET');
              if (parentRelation) {
                parentAsset = {
                  id: parentRelation.from.id,
                  name: parentRelation.from.name || 'Unbekannt'
                };
              }
            }
          } catch (error) {
            console.error(`Error getting parent asset for asset ${asset.id.id}:`, error);
          }

          // Child-Assets abrufen
          let childAssets = [];
          try {
            const childRelationsResponse = await fetch(
              `${THINGSBOARD_URL}/api/relations/info?fromId=${asset.id.id}&fromType=ASSET&relationType=CONTAINS&toType=ASSET`,
              {
                headers: {
                  'accept': 'application/json',
                  'X-Authorization': `Bearer ${tbToken}`
                }
              }
            );

            if (childRelationsResponse.ok) {
              const childRelations = await childRelationsResponse.json();
              childAssets = Array.isArray(childRelations) ? childRelations.map(rel => ({
                id: rel.to.id,
                name: rel.to.name || 'Unbekannt',
                type: rel.to.type || 'ASSET'
              })) : [];
            }
          } catch (error) {
            console.error(`Error getting child assets for asset ${asset.id.id}:`, error);
          }

          return {
            id: asset.id.id,
            name: asset.name,
            type: asset.type,
            label: asset.label || asset.name,
            additionalInfo: asset.additionalInfo || {},
            createdTime: asset.createdTime,
            tenantId: asset.tenantId?.id,
            customerId: asset.customerId?.id,
            deviceCount: deviceCount,
            parentAsset: parentAsset,
            childAssets: childAssets,
            hierarchy: {
              hasParent: parentAsset !== null,
              hasChildren: childAssets.length > 0,
              childCount: childAssets.length
            }
          };
        } catch (error) {
          console.error(`Error processing asset ${asset.id.id}:`, error);
          return {
            id: asset.id.id,
            name: asset.name,
            type: asset.type,
            label: asset.label || asset.name,
            additionalInfo: asset.additionalInfo || {},
            createdTime: asset.createdTime,
            tenantId: asset.tenantId?.id,
            customerId: asset.customerId?.id,
            deviceCount: 0,
            parentAsset: null,
            childAssets: [],
            hierarchy: {
              hasParent: false,
              hasChildren: false,
              childCount: 0
            },
            error: 'Fehler beim Abrufen der Asset-Details'
          };
        }
      })
    );

    // Statistiken berechnen
    const stats = {
      total: assetsWithDetails.length,
      withDevices: assetsWithDetails.filter(a => a.deviceCount > 0).length,
      withParent: assetsWithDetails.filter(a => a.hierarchy.hasParent).length,
      withChildren: assetsWithDetails.filter(a => a.hierarchy.hasChildren).length,
      totalDevices: assetsWithDetails.reduce((sum, asset) => sum + asset.deviceCount, 0),
      totalChildren: assetsWithDetails.reduce((sum, asset) => sum + asset.hierarchy.childCount, 0)
    };

    return res.status(200).json({
      success: true,
      data: {
        customerId: resolvedCustomerId,
        assets: assetsWithDetails,
        statistics: stats,
        summary: {
          totalAssets: stats.total,
          assetsWithDevices: stats.withDevices,
          assetsWithParent: stats.withParent,
          assetsWithChildren: stats.withChildren,
          totalDevices: stats.totalDevices,
          totalChildAssets: stats.totalChildren
        }
      }
    });

  } catch (error) {
    console.error('Assets API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Interner Serverfehler beim Verarbeiten der Anfrage',
      details: error.message
    });
  }
} 