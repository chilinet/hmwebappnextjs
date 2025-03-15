import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { getConnection } from '../../../../../lib/db';
import sql from 'mssql';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const { id } = req.query;

  try {
    // Hole zuerst die customer_id des Users aus der Datenbank
    const pool = await getConnection();
    const userResult = await pool.request()
      .input('userid', sql.Int, session.user.userid)
      .query(`
        SELECT customerid
        FROM hm_users
        WHERE userid = @userid
      `);

    if (userResult.recordset.length === 0) {
      throw new Error('User not found');
    }

    const customerId = userResult.recordset[0].customerid;

    // Hole alle Devices des Customers von ThingsBoard
    const allDevicesResponse = await fetch(
      `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/devices?pageSize=1000&page=0`,
      {
        headers: {
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      }
    );

    if (!allDevicesResponse.ok) {
      console.error('Failed to fetch all devices:', await allDevicesResponse.text());
      throw new Error('Failed to fetch all devices');
    }
    
    console.log('allDevicesResponse:', allDevicesResponse);

    const allDevicesData = await allDevicesResponse.json();
    const allDevices = allDevicesData.data || [];

    // Hole die zugeordneten Devices
    const response = await fetch(
      `${process.env.THINGSBOARD_URL}/api/relations/info?fromId=${id}&fromType=ASSET`,
      {
        headers: {
          'X-Authorization': `Bearer ${session.tbToken}`
        }
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch relations (1):', await response.text());
      throw new Error('Failed to fetch relations');
    }

    const relations = await response.json();
    const deviceRelations = Array.isArray(relations) ? 
      relations.filter(rel => rel.to.entityType === 'DEVICE') : [];

    // Hole Details und Attribute für zugeordnete Devices
    const devices = await Promise.all(
      deviceRelations.map(async relation => {
        try {
          // Hole Device Details
          const deviceResponse = await fetch(
            `${process.env.THINGSBOARD_URL}/api/device/${relation.to.id}`,
            {
              headers: {
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            }
          );
          
          if (!deviceResponse.ok) {
            console.error(`Failed to fetch device ${relation.to.id}:`, await deviceResponse.text());
            return null;
          }

          const deviceData = await deviceResponse.json();

          // Hole Server Attribute
          const attributesResponse = await fetch(
            `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${relation.to.id}/values/attributes/SERVER_SCOPE`,
            {
              headers: {
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            }
          );

          const attributes = attributesResponse.ok ? await attributesResponse.json() : [];

          return {
            ...deviceData,
            serverAttributes: Array.isArray(attributes) ? 
              attributes.reduce((acc, attr) => {
                acc[attr.key] = attr.value;
                return acc;
              }, {}) : {}
          };
        } catch (error) {
          console.error(`Error processing device ${relation.to.id}:`, error);
          return null;
        }
      })
    );

    // Filtere fehlgeschlagene Device-Abrufe heraus
    const validDevices = devices.filter(device => device !== null);

    // Finde die nicht zugeordneten Devices
    const assignedDeviceIds = validDevices.map(device => device.id.id);
    const unassignedDevices = allDevices.filter(
      device => !assignedDeviceIds.includes(device.id.id)
    );

    // Prüfe für jedes nicht zugeordnete Device, ob es bereits irgendwo zugeordnet ist
    const trulyUnassignedDevices = await Promise.all(
      unassignedDevices.map(async device => {
        try {
          // Prüfe ob das Device bereits eine "To"-Relation hat
          const relationResponse = await fetch(
            `${process.env.THINGSBOARD_URL}/api/relations/info?toId=${device.id.id}&toType=DEVICE`,
            {
              headers: {
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            }
          );

          if (!relationResponse.ok) {
            console.error(`Failed to fetch relations for device ${device.id.id}:`, await relationResponse.text());
            return null;
          }

          const relations = await relationResponse.json();
          
          // Wenn keine Relations gefunden wurden, ist das Device wirklich nicht zugeordnet
          if (!Array.isArray(relations) || relations.length === 0) {
            return device;
          }
          
          // Wenn es Relations gibt, prüfen ob eine davon vom Typ "Contains" ist
          const hasContainsRelation = relations.some(rel => rel.type === 'Contains');
          return hasContainsRelation ? null : device;

        } catch (error) {
          console.error(`Error checking relations for device ${device.id.id}:`, error);
          return null;
        }
      })
    );

    // Filtere null-Werte heraus
    const filteredUnassignedDevices = trulyUnassignedDevices.filter(device => device !== null);

    // Hole Attribute für die gefilterten nicht zugeordneten Devices
    const unassignedDevicesWithAttributes = await Promise.all(
      filteredUnassignedDevices.map(async device => {
        try {
          const attributesResponse = await fetch(
            `${process.env.THINGSBOARD_URL}/api/plugins/telemetry/DEVICE/${device.id.id}/values/attributes/SERVER_SCOPE`,
            {
              headers: {
                'X-Authorization': `Bearer ${session.tbToken}`
              }
            }
          );

          const attributes = attributesResponse.ok ? await attributesResponse.json() : [];

          return {
            ...device,
            serverAttributes: Array.isArray(attributes) ? 
              attributes.reduce((acc, attr) => {
                acc[attr.key] = attr.value;
                return acc;
              }, {}) : {}
          };
        } catch (error) {
          console.error(`Error processing unassigned device ${device.id.id}:`, error);
          return device;
        }
      })
    );

    return res.json({
      assigned: validDevices,
      unassigned: unassignedDevicesWithAttributes
    });

  } catch (error) {
    console.error('Error fetching devices (2):', error);
    return res.status(500).json({
      message: 'Error fetching devices (3)',
      error: error.message
    });
  }
} 