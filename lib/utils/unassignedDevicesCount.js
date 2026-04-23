import { getCachedUnassignedDevices } from './deviceCache';
import { debugLog, debugWarn } from '../appDebug';

const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 30000;
const RELATION_TIMEOUT_MS = 10000;

/**
 * Lädt alle Customer-Devices von ThingsBoard (paginiert), gleiche Quelle wie
 * /api/config/devices/unassigned.
 */
async function fetchAllCustomerDevices(customerId, tbToken) {
  const allDevices = [];
  let page = 0;
  let hasNext = true;

  while (hasNext && page < MAX_PAGES) {
    let timeoutId = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const devicesResponse = await fetch(
        `${process.env.THINGSBOARD_URL}/api/customer/${customerId}/devices?pageSize=${PAGE_SIZE}&page=${page}`,
        {
          headers: {
            'X-Authorization': `Bearer ${tbToken}`
          },
          signal: controller.signal
        }
      );

      if (timeoutId) clearTimeout(timeoutId);

      if (!devicesResponse.ok) {
        const errorText = await devicesResponse.text();
        console.error(`countUnassigned: devices page ${page}:`, devicesResponse.status, errorText);
        if (allDevices.length === 0) {
          throw new Error(`Failed to fetch devices (page ${page}): ${devicesResponse.status}`);
        }
        debugWarn(`countUnassigned: stopping pagination after error on page ${page}`);
        break;
      }

      const devicesData = await devicesResponse.json();
      const pageDevices = devicesData.data || [];
      allDevices.push(...pageDevices);
      hasNext =
        devicesData.hasNext || (devicesData.totalPages && page + 1 < devicesData.totalPages);
      page++;
      debugLog(`countUnassigned: loaded page ${page - 1}, ${pageDevices.length} devices (total ${allDevices.length})`);
    } catch (fetchError) {
      if (timeoutId) clearTimeout(timeoutId);
      const isTimeoutError =
        fetchError.name === 'AbortError' ||
        fetchError.message?.includes('timeout') ||
        fetchError.message?.includes('Timeout') ||
        fetchError.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        fetchError.cause?.code === 'UND_ERR_SOCKET';

      if (isTimeoutError) {
        debugWarn(`countUnassigned: timeout on page ${page}, using ${allDevices.length} devices`);
        if (allDevices.length === 0) {
          throw new Error('Timeout while fetching devices: none loaded');
        }
        break;
      }
      throw fetchError;
    }
  }

  return allDevices;
}

/**
 * Zählt Geräte ohne „Contains“-Relation (wie /api/config/devices/unassigned), ohne Attribute zu laden.
 */
async function countUnassignedRelationsOnly(customerId, tbToken) {
  const allDevices = await fetchAllCustomerDevices(customerId, tbToken);

  const results = await Promise.allSettled(
    allDevices.map(async (device) => {
      const deviceId = device?.id?.id;
      if (!deviceId) return { unassigned: false };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RELATION_TIMEOUT_MS);
      try {
        const relationResponse = await fetch(
          `${process.env.THINGSBOARD_URL}/api/relations/info?toId=${deviceId}&toType=DEVICE`,
          {
            headers: {
              'X-Authorization': `Bearer ${tbToken}`
            },
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);

        if (!relationResponse.ok) {
          return { unassigned: false };
        }

        const relations = await relationResponse.json();
        if (!Array.isArray(relations) || !relations.some((rel) => rel.type === 'Contains')) {
          return { unassigned: true };
        }
        return { unassigned: false };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name !== 'AbortError' && !fetchError.message?.includes('timeout')) {
          debugWarn(`countUnassigned: relations for ${deviceId}:`, fetchError.message || fetchError);
        }
        return { unassigned: false };
      }
    })
  );

  let count = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.unassigned) {
      count++;
    }
  }
  return count;
}

/**
 * Anzahl nicht zugeordneter Geräte (Memory-Cache zuerst, sonst TB-Abfrage ohne Attribute).
 */
export async function countUnassignedDevices(customerId, tbToken) {
  if (!tbToken || !process.env.THINGSBOARD_URL) {
    return 0;
  }

  const cached = getCachedUnassignedDevices(customerId);
  if (cached) {
    debugLog(`countUnassigned: cache hit for customer ${customerId} → ${cached.length}`);
    return cached.length;
  }

  return countUnassignedRelationsOnly(customerId, tbToken);
}
