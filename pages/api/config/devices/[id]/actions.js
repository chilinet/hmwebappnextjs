import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { getConnection, getMssqlConfig } from "../../../../../lib/db";

const ALLOWED_ACTIONS = ['reset', 'recalibrate', 'requestParameters'];
const SUPPORTED_INTEGRATIONS = new Set(['ttn', 'melita']);
const COMMAND_CATALOG = {
  default: {
    any: {
      reset: { payloadHex: '30', fPort: 2, confirmed: false, priority: 'HIGH' },
    },
  },
  vicki: {
    any: {
      reset: { payloadHex: '30', fPort: 2, confirmed: false, priority: 'HIGH' },
    },
  },
  // DNT placeholders: replace payloadHex/fPort with vendor-confirmed values per model.
  'dnt-lw-wsci': {
    any: {
      reset: { payloadHex: '', fPort: null, confirmed: false, priority: 'HIGH' },
    },
  },
  'dnt-lw-etrv-c': {
    any: {
      reset: { payloadHex: '', fPort: null, confirmed: false, priority: 'HIGH' },
    },
  },
  'dnt-lw-etrv': {
    any: {
      reset: { payloadHex: '', fPort: null, confirmed: false, priority: 'HIGH' },
    },
  },
};

function normalizeIntegration(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('thingpark') || raw.includes('actility')) return 'thingpark';
  if (raw.includes('melita')) return 'melita';
  if (raw.includes('ttn') || raw.includes('tti') || raw.includes('thingsstack')) return 'ttn';
  return raw;
}

function normalizeDeviceType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const normalized = raw.replace(/\s+/g, '-');
  // Alias handling for common variants from inventory/device labels.
  if (normalized === 'dnt-lw-wsci') return 'dnt-lw-wsci';
  if (normalized === 'dnt-lw-etrv-c') return 'dnt-lw-etrv-c';
  if (normalized === 'dnt-lw-etrv') return 'dnt-lw-etrv';
  return normalized;
}

function isHex(value) {
  return /^[0-9a-f]+$/i.test(String(value || '').trim());
}

function makeAppBaseUrl(req) {
  const envUrl = String(process.env.NEXTAUTH_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http');
  const host = String(req.headers.host || 'localhost:3000');
  return `${proto}://${host}`;
}

async function getThingsBoardToken() {
  const thingsboardUrl = process.env.THINGSBOARD_URL;
  const tbUser = process.env.TENNANT_THINGSBOARD_USERNAME || process.env.THINGSBOARD_USERNAME;
  const tbPass = process.env.TENNANT_THINGSBOARD_PASSWORD || process.env.THINGSBOARD_PASSWORD;
  if (!thingsboardUrl || !tbUser || !tbPass) {
    throw new Error('ThingsBoard credentials missing');
  }

  const loginRes = await fetch(`${thingsboardUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: tbUser, password: tbPass }),
  });
  if (!loginRes.ok) {
    const text = await loginRes.text().catch(() => '');
    throw new Error(`ThingsBoard login failed: ${loginRes.status} ${text}`.trim());
  }
  const data = await loginRes.json();
  if (!data?.token) throw new Error('ThingsBoard login response missing token');
  return data.token;
}

async function fetchTbClientAttributes(tbDeviceId, tbToken) {
  const thingsboardUrl = process.env.THINGSBOARD_URL;
  const res = await fetch(
    `${thingsboardUrl}/api/plugins/telemetry/DEVICE/${encodeURIComponent(tbDeviceId)}/values/attributes/CLIENT_SCOPE`,
    {
      headers: {
        'X-Authorization': `Bearer ${tbToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to load ThingsBoard client attributes: ${res.status} ${text}`.trim());
  }
  const arr = await res.json();
  const attrs = {};
  for (const item of arr || []) attrs[item.key] = item.value;
  return attrs;
}

async function fetchInventoryContext(tbDeviceId) {
  const db = getMssqlConfig().database;
  const pool = await getConnection();
  const result = await pool.request()
    .input('tbconnectionid', tbDeviceId)
    .query(`
      SELECT TOP 1
        i.id,
        i.tbconnectionid,
        i.devicename,
        i.deviceLabel,
        i.deveui,
        i.lns_assignment_name,
        b.name AS brand_name,
        m.name AS model_name
      FROM ${db}.dbo.inventory i
      LEFT JOIN ${db}.dbo.brand b ON i.brand_id = b.id
      LEFT JOIN ${db}.dbo.model m ON i.model_id = m.id
      WHERE i.tbconnectionid = @tbconnectionid
      ORDER BY i.id DESC
    `);

  return result.recordset?.[0] || null;
}

function resolveCommandProfile({ action, integration, deviceType, inventory }) {
  const resolvedType = normalizeDeviceType(deviceType)
    || normalizeDeviceType(inventory?.model_name)
    || normalizeDeviceType(inventory?.devicename)
    || 'default';
  const resolvedIntegration = normalizeIntegration(integration) || 'any';

  const typeBucket = COMMAND_CATALOG[resolvedType] || COMMAND_CATALOG.default || {};
  const fallbackTypeBucket = COMMAND_CATALOG.default || {};
  const profile = (
    typeBucket?.[resolvedIntegration]?.[action]
    || typeBucket?.any?.[action]
    || fallbackTypeBucket?.[resolvedIntegration]?.[action]
    || fallbackTypeBucket?.any?.[action]
  );

  return { profile, resolvedType, resolvedIntegration };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tbDeviceId = String(req.query.id || '').trim();
    const { action, parameters } = req.body || {};

    if (!tbDeviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }
    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({
        error: 'Invalid action. Allowed actions: ' + ALLOWED_ACTIONS.join(', '),
      });
    }

    const inventory = await fetchInventoryContext(tbDeviceId);

    let integration = '';
    try {
      const tbToken = await getThingsBoardToken();
      const attrs = await fetchTbClientAttributes(tbDeviceId, tbToken);
      integration = normalizeIntegration(attrs.integration);
    } catch (tbErr) {
      console.warn('[DEVICE ACTION] Could not resolve integration from ThingsBoard attributes:', tbErr.message);
    }
    if (!integration) integration = normalizeIntegration(inventory?.lns_assignment_name);
    if (!SUPPORTED_INTEGRATIONS.has(integration)) {
      return res.status(422).json({
        error: 'Unsupported integration for command delivery',
        integration: integration || 'unknown',
        supportedIntegrations: Array.from(SUPPORTED_INTEGRATIONS),
      });
    }

    const { profile, resolvedType, resolvedIntegration } = resolveCommandProfile({
      action,
      integration,
      deviceType: inventory?.model_name || inventory?.devicename || '',
      inventory,
    });

    if (!profile) {
      return res.status(422).json({
        error: 'Unsupported action mapping for this device/integration',
        action,
        deviceType: resolvedType,
        integration: resolvedIntegration,
      });
    }
    if (!isHex(profile.payloadHex) || !Number.isFinite(Number(profile.fPort)) || Number(profile.fPort) <= 0) {
      return res.status(422).json({
        error: 'Command mapping not configured for this model yet',
        action,
        deviceType: resolvedType,
        integration: resolvedIntegration,
        details: 'Set payloadHex (valid hex) and fPort (>0) in COMMAND_CATALOG.',
      });
    }

    const appBaseUrl = makeAppBaseUrl(req);
    const downlinkRes = await fetch(`${appBaseUrl}/api/lns/downlink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: req.headers.cookie || '',
      },
      body: JSON.stringify({
        deviceId: tbDeviceId,
        payloadHex: profile.payloadHex,
        confirmed: profile.confirmed,
        priority: profile.priority,
        fPort: profile.fPort,
        command: action,
        parameters: parameters || null,
      }),
    });

    const downlinkData = await downlinkRes.json().catch(() => ({}));
    if (!downlinkRes.ok) {
      return res.status(downlinkRes.status === 500 ? 502 : downlinkRes.status).json({
        error: 'Downlink delivery failed',
        details: downlinkData?.details || downlinkData?.error || 'Unknown delivery error',
        action,
        integration: resolvedIntegration,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Action '${action}' delivered successfully`,
      timestamp: new Date().toISOString(),
      deviceId: tbDeviceId,
      action,
      integration: resolvedIntegration || 'unknown',
      deviceType: resolvedType,
      resolvedCommand: {
        payloadHex: profile.payloadHex,
        fPort: profile.fPort,
        confirmed: profile.confirmed,
        priority: profile.priority,
      },
      inventoryId: inventory?.id || null,
      user: session.user.email,
      providerResult: downlinkData,
    });
  } catch (error) {
    console.error('Error in device actions API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}
