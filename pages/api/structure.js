import jwt from 'jsonwebtoken';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { getConnection } from '../../lib/db';
import sql from 'mssql';

/**
 * GET /api/structure
 *
 * Liest die Raum-/Asset-Struktur des angemeldeten Kunden (customer_settings.tree).
 * Pro Strukturpunkt: id, parent_id, name, label, type, attributes (inkl. has_device_assigned, devices).
 *
 * Auth: NextAuth-Session oder Authorization: Bearer <JWT> (Payload.customerid)
 */
async function resolveCustomerId(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim();
    try {
      const decoded = jwt.verify(raw, process.env.NEXTAUTH_SECRET);
      const cid = decoded.customerid ?? decoded.customerId;
      if (cid != null && String(cid).length > 0) return String(cid);
    } catch {
      // Session versuchen
    }
  }
  const session = await getServerSession(req, res, authOptions);
  if (session?.user?.customerid != null) {
    return String(session.user.customerid);
  }
  return null;
}

function normalizeDeviceEntry(d) {
  if (d == null) return null;
  if (typeof d === 'string') {
    const id = d.trim();
    return id ? { id, name: null } : null;
  }
  const id = d.id?.id ?? d.id ?? d.deviceId ?? null;
  if (id == null || String(id).trim() === '') return null;
  const name = d.name ?? d.label ?? null;
  return { id: String(id), name: name != null ? String(name) : null };
}

function collectDevices(node) {
  const list = [];
  const rd = node.relatedDevices ?? node.data?.relatedDevices;
  if (Array.isArray(rd)) {
    rd.forEach((d) => {
      const n = normalizeDeviceEntry(d);
      if (n) list.push(n);
    });
  }
  const opDev = node.data?.operationalDevice ?? node.operationalDevice;
  if (opDev != null && String(opDev).trim() !== '') {
    const id = String(opDev).trim();
    if (!list.some((x) => x.id === id)) {
      list.push({ id, name: null });
    }
  }
  return list;
}

function mapStructureNode(node, parentId) {
  const devices = collectDevices(node);
  const hasFromFlag =
    node.hasDevices === true ||
    node.data?.hasDevices === true;
  const has_device_assigned = devices.length > 0 || hasFromFlag;

  const out = {
    id: node.id,
    parent_id: parentId,
    name: node.name ?? node.text ?? null,
    label: node.label ?? null,
    type: node.type ?? node.data?.type ?? null,
    attributes: {
      has_device_assigned,
      device_count: devices.length,
      devices
    },
    children: []
  };

  if (Array.isArray(node.children) && node.children.length > 0) {
    out.children = node.children.map((ch) => mapStructureNode(ch, node.id));
  }

  return out;
}

function mapTreeToStructure(tree) {
  if (!Array.isArray(tree)) return [];
  return tree.map((root) => mapStructureNode(root, null));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });
  }

  try {
    const customerId = await resolveCustomerId(req, res);
    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
        error: 'Kein Customer ermittelbar (Session oder Bearer-JWT mit customerid)'
      });
    }

    const qCustomer = req.query.customer_id;
    if (qCustomer != null && String(qCustomer).trim() !== '') {
      if (String(qCustomer).toLowerCase() !== customerId.toLowerCase()) {
        return res.status(403).json({
          success: false,
          message: 'customer_id passt nicht zum angemeldeten Benutzer'
        });
      }
    }

    const pool = await getConnection();
    const result = await pool.request()
      .input('customer_id', sql.UniqueIdentifier, customerId)
      .query(`
        SELECT tree
        FROM customer_settings
        WHERE customer_id = @customer_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Struktur nicht gefunden',
        error: 'Kein Eintrag in customer_settings für customer_id'
      });
    }

    const tree = JSON.parse(result.recordset[0].tree);

    const structure = mapTreeToStructure(tree);

    return res.status(200).json({
      success: true,
      customer_id: customerId,
      structure
    });
  } catch (error) {
    console.error('api/structure error:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Lesen der Struktur',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
