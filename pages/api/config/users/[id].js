import { getServerSession } from 'next-auth/next';
import sql from 'mssql';
import { authOptions } from '../../../../lib/authOptions';
import { convertToTreeViewFormat, normAssetId } from '../../../../lib/heating-control/treeUtils';
import { withPoolRetry } from '../../../../lib/db';

export default async function handler(req, res) {
  const { id } = req.query

  let tbToken = null

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  tbToken = session.tbToken;
  
  if (!tbToken) {
    return res.status(401).json({ 
      success: false, 
      error: 'No valid ThingsBoard token found'
    });
  }

  console.log('************************************************');
  console.log(req.method);
  console.log('************************************************');

  try {
    await withPoolRetry(async (pool) => {
    switch (req.method) {
      case 'GET':
        // Einzelnen Benutzer laden
        console.log('GET');
        const userResult = await pool.request()
          .input('id', sql.Int, id)
          .query(`
            SELECT 
              userid as id,
              username,
              email,
              firstname as firstName,
              lastname as lastName,
              role,
              customerid,
              status,
              createdttm as createdAt,
              updatedttm as updatedAt,
              default_entry_asset_id,
              default_entry_override_user
            FROM hm_users
            WHERE userid = @id
          `)
        
        const user = userResult

        if (user.recordset.length === 0) {
          return res.status(404).json({ 
            success: false, 
            error: 'Benutzer nicht gefunden' 
          })
        }

        const userData = user.recordset[0]
        console.log('Raw user data from DB:', userData) // Debug Log

        // Wenn ein Customer ID vorhanden ist, hole die Daten von ThingsBoard
        if (userData.customerid) {
          try {
            const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/customer/${userData.customerid}`, {
              headers: {
                'X-Authorization': `Bearer ${tbToken}`
              }
            })

            if (tbResponse.ok) {
              const customerData = await tbResponse.json()
              userData.customerName = customerData.title
            }
          } catch (error) {
            console.error('Error fetching customer data:', error)
            userData.customerName = 'Fehler beim Laden'
          }
        }

        console.log('Processed user data:', userData) // Debug Log

        return res.status(200).json({
          success: true,
          data: {
            id: userData.id,
            username: userData.username,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role,
            customerid: userData.customerid ? userData.customerid.toString() : '', // Explizit als String
            customerName: userData.customerName || '',
            createdAt: userData.createdAt,
            updatedAt: userData.updatedAt,
            defaultEntryAssetId: userData.default_entry_asset_id
              ? userData.default_entry_asset_id.toString()
              : '',
            defaultEntryOverrideUser: !!userData.default_entry_override_user
          }
        })

      case 'PUT': {
        const {
          email, firstName, lastName, role, customerid, status,
          defaultEntryAssetId, defaultEntryOverrideUser
        } = req.body;
        console.log('Updating user:', { id, email, firstName, lastName, role, customerid, status, defaultEntryAssetId, defaultEntryOverrideUser });

        const wantsEntryUpdate = defaultEntryAssetId !== undefined || defaultEntryOverrideUser !== undefined;

        if (wantsEntryUpdate) {
          const currentUserResult = await pool.request()
            .input('userid', sql.Int, session.user.userid)
            .query(`SELECT role, customerid FROM hm_users WHERE userid = @userid`);
          const targetUserResult = await pool.request()
            .input('targetId', sql.Int, id)
            .query(`SELECT customerid FROM hm_users WHERE userid = @targetId`);

          if (currentUserResult.recordset.length === 0 || targetUserResult.recordset.length === 0) {
            return res.status(404).json({ success: false, error: 'Benutzer nicht gefunden' });
          }
          const curRole = currentUserResult.recordset[0].role;
          const curCustomer = currentUserResult.recordset[0].customerid
            ? String(currentUserResult.recordset[0].customerid)
            : '';
          const tgtCustomer = targetUserResult.recordset[0].customerid
            ? String(targetUserResult.recordset[0].customerid)
            : '';

          if (curRole !== 1 && curRole !== 2) {
            return res.status(403).json({ success: false, error: 'Keine Berechtigung für Einstiegspunkt' });
          }
          if (curRole === 2 && curCustomer.toLowerCase() !== tgtCustomer.toLowerCase()) {
            return res.status(403).json({ success: false, error: 'Nur Benutzer des eigenen Mandanten' });
          }
        }

        // Baue die UPDATE-Query dynamisch auf, je nachdem welche Felder übergeben wurden
        let updateFields = [];
        let updateValues = {};

        if (email !== undefined) {
          updateFields.push('email = @email');
          updateValues.email = email;
        }
        if (firstName !== undefined) {
          updateFields.push('firstname = @firstName');
          updateValues.firstName = firstName;
        }
        if (lastName !== undefined) {
          updateFields.push('lastname = @lastName');
          updateValues.lastName = lastName;
        }
        if (role !== undefined) {
          updateFields.push('role = @role');
          updateValues.role = role;
        }
        if (customerid !== undefined) {
          updateFields.push('customerid = @customerid');
          updateValues.customerid = customerid;
        }
        if (status !== undefined) {
          updateFields.push('status = @status');
          updateValues.status = status;
        }

        if (defaultEntryOverrideUser !== undefined) {
          updateFields.push('default_entry_override_user = @defaultEntryOverrideUser');
          updateValues.defaultEntryOverrideUser = defaultEntryOverrideUser ? 1 : 0;
        }

        if (defaultEntryAssetId !== undefined) {
          const raw = defaultEntryAssetId == null || String(defaultEntryAssetId).trim() === ''
            ? null
            : String(defaultEntryAssetId).trim();
          if (raw) {
            const targetRow = await pool.request()
              .input('targetId', sql.Int, id)
              .query(`SELECT customerid FROM hm_users WHERE userid = @targetId`);
            if (targetRow.recordset.length === 0) {
              return res.status(404).json({ success: false, error: 'Zielbenutzer nicht gefunden' });
            }
            const cid = targetRow.recordset[0].customerid;
            if (!cid) {
              return res.status(400).json({ success: false, error: 'Kunde fehlt – kein Einstiegsknoten möglich' });
            }
            const treeRes = await pool.request()
              .input('customer_id', sql.UniqueIdentifier, cid)
              .query(`SELECT tree FROM customer_settings WHERE customer_id = @customer_id`);
            if (treeRes.recordset.length === 0) {
              return res.status(400).json({ success: false, error: 'Keine Struktur für diesen Kunden' });
            }
            let treeParsed;
            try {
              treeParsed = JSON.parse(treeRes.recordset[0].tree);
            } catch {
              return res.status(500).json({ success: false, error: 'Strukturdaten ungültig' });
            }
            const flat = convertToTreeViewFormat(Array.isArray(treeParsed) ? treeParsed : []);
            const found = flat.some((n) => n.id && normAssetId(n.id) === normAssetId(raw));
            if (!found) {
              return res.status(400).json({ success: false, error: 'Knoten gehört nicht zur Mandantenstruktur' });
            }
          }
          updateFields.push('default_entry_asset_id = @defaultEntryAssetId');
          updateValues.defaultEntryAssetId = raw;
        }

        // Füge updatedttm immer hinzu
        updateFields.push('updatedttm = GETDATE()');

        if (updateFields.length === 1) {
          // Nur updatedttm wurde aktualisiert, keine anderen Felder
          return res.status(400).json({
            success: false,
            message: 'Keine Felder zum Aktualisieren angegeben'
          })
        }

        // Erstelle die SQL-Query mit parametrisierten Werten
        const updateQuery = `
          UPDATE hm_users
          SET ${updateFields.join(', ')}
          WHERE userid = @id
        `

        const request = pool.request()
        request.input('id', sql.Int, id)
        
        // Füge alle Werte hinzu
        Object.keys(updateValues).forEach(key => {
          if (key === 'customerid' && updateValues[key]) {
            request.input(key, sql.UniqueIdentifier, updateValues[key]);
          } else if (key === 'role' || key === 'status') {
            request.input(key, sql.Int, updateValues[key]);
          } else if (key === 'defaultEntryOverrideUser') {
            request.input(key, sql.Bit, updateValues[key]);
          } else if (key === 'defaultEntryAssetId') {
            const v = updateValues[key];
            if (v == null || v === '') {
              request.input(key, sql.UniqueIdentifier, null);
            } else {
              request.input(key, sql.UniqueIdentifier, v);
            }
          } else {
            request.input(key, sql.NVarChar, updateValues[key]);
          }
        });

        await request.query(updateQuery);

        return res.status(200).json({
          success: true,
          message: 'Benutzer erfolgreich aktualisiert'
        });
      }

      case 'DELETE':
        // Benutzer löschen
        console.log('DELETE');
        await pool.request()
          .input('id', sql.Int, id)
          .query(`
            DELETE FROM hm_users
            WHERE userid = @id
          `)

        return res.status(200).json({
          success: true,
          message: 'User deleted successfully'
        })

      default:
        console.log('default');
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
        res.status(405).end(`Method ${req.method} Not Allowed`)
    }
    }, { attempts: 3 });
  } catch (error) {
    console.error('User API error:', error)
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error',
      details: {
        method: req.method,
        id: id,
        hasToken: !!tbToken
      }
    })
  }
} 