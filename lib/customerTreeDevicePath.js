import { getConnection } from './db.js';
import sql from 'mssql';

/**
 * Lädt den Navigationsbaum aus customer_settings (gleiche Quelle wie /api/treepath).
 */
export async function loadCustomerSettingsTree(customerId) {
  const pool = await getConnection();
  const result = await pool
    .request()
    .input('customerId', sql.UniqueIdentifier, customerId)
    .query(`
      SELECT tree
      FROM customer_settings
      WHERE customer_id = @customerId
        AND tree IS NOT NULL
    `);

  if (!result.recordset?.length) {
    return null;
  }

  const treeJson = result.recordset[0].tree;
  if (typeof treeJson === 'string') {
    try {
      return JSON.parse(treeJson);
    } catch {
      return null;
    }
  }
  return treeJson;
}

function labelsFromPathNodes(pathNodes) {
  if (!pathNodes?.length) return null;
  const labels = pathNodes
    .map((p) => p.label || p.name || '')
    .filter(Boolean);
  return labels.length ? labels : null;
}

/** Pfad-Knoten von der Wurzel zu einem Asset (node.id === assetId). */
function findPathNodesToAsset(treeData, assetId) {
  if (!treeData || !Array.isArray(treeData) || !assetId) {
    return null;
  }

  function walk(nodes, pathSoFar) {
    for (const node of nodes) {
      const seg = {
        id: node.id,
        name: node.name,
        label: node.label,
        type: node.type,
      };
      const newPath = [...pathSoFar, seg];
      if (String(node.id) === String(assetId)) {
        return newPath;
      }
      if (node.children?.length) {
        const found = walk(node.children, newPath);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(treeData, []);
}

/**
 * Gerät hängt unter node.relatedDevices — Pfad = Labels der Vorfahren inkl. diesem Knoten.
 * Entspricht der Logik in extractRelatedDevices (treepath).
 */
function findPathNodesForRelatedDevice(treeData, deviceId) {
  if (!treeData || !Array.isArray(treeData) || !deviceId) {
    return null;
  }

  function walk(nodes, pathSoFar) {
    for (const node of nodes) {
      const seg = {
        id: node.id,
        name: node.name,
        label: node.label,
        type: node.type,
      };
      const newPath = [...pathSoFar, seg];

      const rel = node.relatedDevices;
      if (Array.isArray(rel) && rel.some((d) => String(d.id) === String(deviceId))) {
        return newPath;
      }

      if (node.children?.length) {
        const found = walk(node.children, newPath);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(treeData, []);
}

/**
 * Anzeige-Pfad für Alarmzeile: zuerst Gerät im Baum, sonst Asset-Knoten (z. B. aus PG-Relation).
 */
export function resolveDevicePathFromCustomerTree(treeData, deviceId, assetId) {
  if (!treeData || !Array.isArray(treeData)) {
    return null;
  }

  let pathNodes = findPathNodesForRelatedDevice(treeData, deviceId);
  let labels = labelsFromPathNodes(pathNodes);
  if (labels) {
    return labels.join(' → ');
  }

  if (assetId) {
    pathNodes = findPathNodesToAsset(treeData, assetId);
    labels = labelsFromPathNodes(pathNodes);
    if (labels) {
      return labels.join(' → ');
    }
  }

  return null;
}
