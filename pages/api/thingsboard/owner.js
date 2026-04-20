import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import thingsboardAuth from "./auth";

/**
 * Proxy for ThingsBoard device assign/unassign.
 * Assigning devices to customers requires TENANT_ADMIN in ThingsBoard.
 * Uses tenant admin credentials from env (TENNANT_THINGSBOARD_* or THINGSBOARD_*)
 * when set; otherwise falls back to session token (must be tenant admin for assign to work).
 *
 * Assign flow (type=CUSTOMER):
 * 1. If reassigning: GET /api/device/{deviceId}/relations, DELETE /api/relation/{relationId} for each relation where from.id or to.id is old customer.
 * 2. Always: GET /api/device/{deviceId}/relations, DELETE /api/relation/{relationId} for every relation (relationId = relation.id).
 * 3. GET device (3a), then POST /api/device/{deviceId} with device + ownerId: { id }, customerId: { id } (3b). If OK, stop.
 * 4–7. If 3 fails: POST owner, then POST assign, then POST relation CUSTOMER→DEVICE Manages, then POST relation DEVICE→CUSTOMER Manages; stop on first OK.
 *
 * Unassign (type=TENANT): DELETE /api/customer/device/{deviceId}. If that returns 404
 * (e.g. endpoint not exposed by proxy), fallback: GET device, then POST device with
 * customerId: null and ownerId: tenantId to assign back to tenant.
 * @see https://demo.thingsboard.io/swagger-ui/index.html (Device Controller)
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, customerId, deviceId } = req.query;

    if (!type || !deviceId) {
      return res.status(400).json({ error: 'Missing required parameters: type, deviceId' });
    }
    if (String(deviceId).trim() === '' || String(deviceId) === '0' || String(deviceId).length < 10) {
      return res.status(400).json({ error: 'Invalid deviceId: must be a ThingsBoard device UUID', details: 'Device has no valid ThingsBoard connection id. Use "In ThingsBoard anlegen" first.' });
    }
    if (type === 'CUSTOMER' && !customerId) {
      return res.status(400).json({ error: 'customerId required when type is CUSTOMER' });
    }
    if (!['TENANT', 'CUSTOMER'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be TENANT or CUSTOMER' });
    }

    if (!process.env.THINGSBOARD_URL) {
      return res.status(500).json({ error: 'THINGSBOARD_URL environment variable not set' });
    }

    // Assign/unassign require TENANT_ADMIN in ThingsBoard. Prefer fresh token from env over session (session token may be expired).
    let tbToken = null;
    const tenantUser = process.env.TENNANT_THINGSBOARD_USERNAME || process.env.THINGSBOARD_USERNAME;
    const tenantPass = process.env.TENNANT_THINGSBOARD_PASSWORD || process.env.THINGSBOARD_PASSWORD;
    const mainUser = process.env.THINGSBOARD_USERNAME;
    const mainPass = process.env.THINGSBOARD_PASSWORD;
    for (const [user, pass] of [[tenantUser, tenantPass], [mainUser, mainPass]]) {
      if (!user || !pass) continue;
      try {
        tbToken = await thingsboardAuth(user, pass);
        if (tbToken) break;
      } catch (authErr) {
        console.error('ThingsBoard login failed:', authErr.message);
      }
    }
    if (!tbToken && session?.tbToken) {
      tbToken = session.tbToken;
    }
    if (!tbToken) {
      return res.status(401).json({
        error: 'ThingsBoard token missing',
        details: 'Setze TENNANT_THINGSBOARD_USERNAME und TENNANT_THINGSBOARD_PASSWORD (oder THINGSBOARD_USERNAME / THINGSBOARD_PASSWORD) in .env für Tenant-Admin-Zugang.'
      });
    }

    const baseUrl = process.env.THINGSBOARD_URL;
    const makeHeaders = (token) => ({
      'Accept': 'application/json',
      'X-Authorization': `Bearer ${token}`
    });
    let headers = makeHeaders(tbToken);

    const fetchWithRetry = async (url, opts, is401Retry = false) => {
      const r = await fetch(url, { ...opts, headers: { ...opts?.headers, ...headers } });
      if (r.status === 401 && !is401Retry) {
        for (const [user, pass] of [[tenantUser, tenantPass], [mainUser, mainPass]]) {
          if (!user || !pass) continue;
          try {
            const fresh = await thingsboardAuth(user, pass);
            if (fresh) {
              headers = makeHeaders(fresh);
              return fetch(url, { ...opts, headers: { ...opts?.headers, ...headers } });
            }
          } catch (_) {}
        }
      }
      return r;
    };

    let response;
    if (type === 'CUSTOMER') {
      // Pre-validate: device and customer must exist in ThingsBoard (tenant can see both)
      const deviceRes = await fetchWithRetry(`${baseUrl}/api/device/${deviceId}`, { method: 'GET' });
      if (deviceRes.status === 404) {
        return res.status(404).json({
          error: 'Device not found in ThingsBoard',
          details: `Device ${deviceId} does not exist in ThingsBoard. Create it first via "In ThingsBoard anlegen" in Inventory, then assign to customer.`
        });
      }
      if (!deviceRes.ok) {
        const errText = await deviceRes.text();
        console.error('ThingsBoard get device error:', deviceRes.status, errText);
        return res.status(deviceRes.status).json({ error: 'Failed to load device', details: errText });
      }
      const deviceBody = await deviceRes.json();
      const oldCustomerId = deviceBody.customerId?.id || deviceBody.customerId || null;

      const customerRes = await fetchWithRetry(`${baseUrl}/api/customer/${customerId}`, { method: 'GET' });
      if (customerRes.status === 404) {
        return res.status(404).json({
          error: 'Customer not found in ThingsBoard',
          details: `Customer ${customerId} does not exist in ThingsBoard. Run "Customer Sync" from Admin to sync customers from your app to ThingsBoard, or create the customer in ThingsBoard first.`
        });
      }
      if (!customerRes.ok) {
        const errText = await customerRes.text();
        console.error('ThingsBoard get customer error:', customerRes.status, errText);
        return res.status(customerRes.status).json({ error: 'Failed to load customer', details: errText });
      }

      const tbHeaders = { 'Accept': 'application/json', 'Content-Type': 'application/json', ...headers };

      // Step 1 (only when reassigning): remove old customer's relations
      const getDeviceRelations = async () => {
        const res = await fetchWithRetry(`${baseUrl}/api/device/${deviceId}/relations`, {
          method: 'GET',
          headers: tbHeaders
        });
        if (!res.ok) return [];
        try {
          const data = await res.json();
          return Array.isArray(data) ? data : (data?.relations ? data.relations : []);
        } catch (_) {
          return [];
        }
      };

      const deleteRelationById = async (relationId) => {
        const id = relationId?.id ?? relationId;
        if (id == null || id === '') return { ok: false };
        return fetchWithRetry(`${baseUrl}/api/relation/${String(id)}`, {
          method: 'DELETE',
          headers: tbHeaders
        });
      };

      if (oldCustomerId) {
        const relations1 = await getDeviceRelations();
        for (const rel of relations1) {
          const fromId = rel.from?.id ?? rel.from;
          const toId = rel.to?.id ?? rel.to;
          if (fromId === oldCustomerId || toId === oldCustomerId) {
            const del = await deleteRelationById(rel.id);
            if (!del.ok) console.warn('ThingsBoard delete old-customer relation:', rel.id, del.status, await del.text());
          }
        }
      }

      // Step 2: remove all device relations (list again, then delete each by relation.id)
      const relations2 = await getDeviceRelations();
      for (const rel of relations2) {
        const del = await deleteRelationById(rel.id);
        if (!del.ok) console.warn('ThingsBoard delete device relation:', rel.id, del.status, await del.text());
      }

      // Step 3: Try direct device update (3a already done – deviceBody from GET device above)
      let assignSuccess = false;

      // 3b: POST /api/device/{deviceId} – merge current device with ownerId and customerId
      const devicePayload = {
        ...deviceBody,
        id: deviceBody.id || { id: deviceId, entityType: 'DEVICE' },
        ownerId: { id: customerId },
        customerId: { id: customerId }
      };
      const updateRes = await fetchWithRetry(`${baseUrl}/api/device`, {
        method: 'POST',
        headers: tbHeaders,
        body: JSON.stringify(devicePayload)
      });
      if (updateRes.ok) {
        response = updateRes;
        assignSuccess = true;
      }

      // Step 4: POST /api/owner/CUSTOMER/{customerId}/DEVICE/{deviceId} (no body)
      if (!assignSuccess) {
        const ownerRes = await fetchWithRetry(
          `${baseUrl}/api/owner/CUSTOMER/${customerId}/DEVICE/${deviceId}`,
          { method: 'POST', headers: tbHeaders }
        );
        if (ownerRes.ok) {
          response = ownerRes;
          assignSuccess = true;
        }
      }

      // Step 5: POST /api/device/{deviceId}/assign { "customerId": "..." }
      if (!assignSuccess) {
        const assignRes = await fetchWithRetry(`${baseUrl}/api/device/${deviceId}/assign`, {
          method: 'POST',
          headers: tbHeaders,
          body: JSON.stringify({ customerId })
        });
        if (assignRes.ok) {
          response = assignRes;
          assignSuccess = true;
        }
      }

      // Step 6: POST /api/relation – CUSTOMER → DEVICE, type Manages
      if (!assignSuccess) {
        const rel1 = await fetchWithRetry(`${baseUrl}/api/relation`, {
          method: 'POST',
          headers: tbHeaders,
          body: JSON.stringify({
            from: { entityType: 'CUSTOMER', id: customerId },
            to: { entityType: 'DEVICE', id: deviceId },
            type: 'Manages',
            typeGroup: 'COMMON'
          })
        });
        if (rel1.ok) {
          response = rel1;
          assignSuccess = true;
        }
      }

      // Step 7: POST /api/relation – DEVICE → CUSTOMER, type Manages
      if (!assignSuccess) {
        const rel2 = await fetchWithRetry(`${baseUrl}/api/relation`, {
          method: 'POST',
          headers: tbHeaders,
          body: JSON.stringify({
            from: { entityType: 'DEVICE', id: deviceId },
            to: { entityType: 'CUSTOMER', id: customerId },
            type: 'Manages',
            typeGroup: 'COMMON'
          })
        });
        if (rel2.ok) {
          response = rel2;
          assignSuccess = true;
        }
      }

      if (!assignSuccess) {
        response = { status: 404, ok: false };
      }
    } else {
      // Unassign device from customer (back to tenant): try DELETE first, then fallback to device update
      const tbHeaders = { 'Accept': 'application/json', 'Content-Type': 'application/json', ...headers };
      const deleteUrl = `${baseUrl}/api/customer/device/${deviceId}`;
      console.log(`ThingsBoard unassign device: DELETE ${deleteUrl}`);
      response = await fetchWithRetry(deleteUrl, { method: 'DELETE' });

      // If DELETE returns 404 or 405, use same flow as reassign: remove relations, then update device to tenant.
      if (!response.ok && (response.status === 404 || response.status === 405)) {
        const deviceRes = await fetchWithRetry(`${baseUrl}/api/device/${deviceId}`, { method: 'GET' });
        if (!deviceRes.ok) {
          const errText = await deviceRes.text();
          console.error('ThingsBoard get device for unassign fallback:', deviceRes.status, errText);
          response = deviceRes;
        } else {
          const deviceBody = await deviceRes.json();
          const tenantId = deviceBody.tenantId?.id ?? deviceBody.tenantId ?? null;
          const oldCustomerId = deviceBody.customerId?.id ?? deviceBody.customerId ?? null;
          if (!tenantId) {
            console.error('ThingsBoard device has no tenantId:', deviceBody);
            response = { status: 400, ok: false, details: 'Device has no tenantId; cannot unassign.' };
          } else {
            // Mirror assign flow: remove relations first, then update device (like reassign steps 1–3b).
            const getDeviceRelations = async () => {
              const res = await fetchWithRetry(`${baseUrl}/api/device/${deviceId}/relations`, {
                method: 'GET',
                headers: tbHeaders
              });
              if (!res.ok) return [];
              try {
                const data = await res.json();
                return Array.isArray(data) ? data : (data?.relations ? data.relations : []);
              } catch (_) {
                return [];
              }
            };
            const deleteRelationById = async (relationId) => {
              const id = relationId?.id ?? relationId;
              if (id == null || id === '') return { ok: false };
              return fetchWithRetry(`${baseUrl}/api/relation/${String(id)}`, {
                method: 'DELETE',
                headers: tbHeaders
              });
            };

            if (oldCustomerId) {
              const relations1 = await getDeviceRelations();
              for (const rel of relations1) {
                const fromId = rel.from?.id ?? rel.from;
                const toId = rel.to?.id ?? rel.to;
                if (fromId === oldCustomerId || toId === oldCustomerId) {
                  const del = await deleteRelationById(rel.id);
                  if (!del.ok) console.warn('ThingsBoard unassign: delete old-customer relation:', rel.id, del.status, await del.text());
                }
              }
            }
            const relations2 = await getDeviceRelations();
            for (const rel of relations2) {
              const del = await deleteRelationById(rel.id);
              if (!del.ok) console.warn('ThingsBoard unassign: delete device relation:', rel.id, del.status, await del.text());
            }

            let unassignSuccess = false;
            const unassignPayload = {
              ...deviceBody,
              id: deviceBody.id || { id: deviceId, entityType: 'DEVICE' },
              ownerId: { id: tenantId, entityType: 'TENANT' },
              customerId: null
            };
            const updateRes = await fetchWithRetry(`${baseUrl}/api/device`, {
              method: 'POST',
              headers: tbHeaders,
              body: JSON.stringify(unassignPayload)
            });
            if (updateRes.ok) {
              response = updateRes;
              unassignSuccess = true;
              console.log(`ThingsBoard unassign fallback: device ${deviceId} reassigned to tenant ${tenantId} (POST device)`);
            }
            // If POST device returns 405 or fails, try owner API: POST /api/owner/TENANT/{tenantId}/DEVICE/{deviceId}
            if (!unassignSuccess) {
              const ownerRes = await fetchWithRetry(
                `${baseUrl}/api/owner/TENANT/${tenantId}/DEVICE/${deviceId}`,
                { method: 'POST', headers: tbHeaders }
              );
              if (ownerRes.ok) {
                response = ownerRes;
                console.log(`ThingsBoard unassign fallback: device ${deviceId} reassigned to tenant ${tenantId} (owner API)`);
              } else {
                response = updateRes; // surface device POST error (e.g. 405)
              }
            }
          }
        }
      }
    }

    if (!response.ok) {
      const errorText = typeof response.text === 'function' ? await response.text() : (response.details || `HTTP ${response.status}`);
      console.error(`ThingsBoard API error: ${response.status} - ${errorText}`);
      let parsed;
      try {
        parsed = JSON.parse(errorText);
      } catch (_) {
        parsed = {};
      }
      if (response.status === 400 && (parsed.errorCode === 31 || (parsed.message && parsed.message.includes('owner api')))) {
        return res.status(400).json({
          error: 'ThingsBoard: use owner api to change owner',
          details: parsed.message || errorText,
          hint: 'Assign is done via POST /api/customer/{customerId}/device/{deviceId}. That endpoint returns 404 on your server—your reverse proxy or ThingsBoard deployment may not expose it. Ask your admin to ensure this path is available at ' + baseUrl + ' (check Swagger at ' + baseUrl + '/swagger-ui.html).'
        });
      }
      // For TENANT unassign we already tried fallback (device update) on DELETE 404, so 404 here is a real error (e.g. device not found).
      if (response.status === 404 && type === 'CUSTOMER') {
        return res.status(404).json({
          error: 'ThingsBoard assign failed',
          details: `All assign methods failed (update device, owner API, assign API, CUSTOMER→DEVICE relation, DEVICE→CUSTOMER relation). Device and customer exist. Check Swagger (${baseUrl}/swagger-ui.html) for available assign/owner/relation endpoints. Raw: ${errorText}`
        });
      }
      return res.status(response.status).json({
        error: `ThingsBoard API error: ${response.status}`,
        details: errorText
      });
    }

    const contentType = response.headers.get('content-type');
    const result = contentType && contentType.includes('application/json')
      ? await response.json()
      : {};

    return res.status(200).json({
      success: true,
      message: type === 'CUSTOMER'
        ? `Device ${deviceId} assigned to customer ${customerId}`
        : `Device ${deviceId} unassigned from customer`,
      data: result
    });
  } catch (error) {
    console.error('Error in owner API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
