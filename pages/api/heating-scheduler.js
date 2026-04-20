import jwt from 'jsonwebtoken';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/authOptions';
import { fetchWithTokenRefresh } from '../../lib/utils/fetchWithTokenRefresh';

/**
 * Session oder Bearer-JWT (POST /api/login), wie bei /api/asset/.../timeseries.
 */
async function resolveTbSession(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim();
    try {
      const decoded = jwt.verify(raw, process.env.NEXTAUTH_SECRET);
      if (decoded.tbToken && decoded.customerid != null) {
        return {
          tbToken: decoded.tbToken,
          user: { customerid: String(decoded.customerid) }
        };
      }
    } catch {
      /* Session versuchen */
    }
  }
  const session = await getServerSession(req, res, authOptions);
  if (session?.tbToken && session?.user?.customerid != null) {
    return session;
  }
  return null;
}

function parsePlansFromAttributes(attributes) {
  const plansAttribute = attributes.find((attr) => attr.key === 'plans');
  if (!plansAttribute) {
    return [];
  }
  try {
    const plans = JSON.parse(plansAttribute.value);
    return Array.isArray(plans) ? plans : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/heating-scheduler
 *
 * Alle Heizpläne des angemeldeten Kunden (ThingsBoard-Attribut **plans**),
 * gleiche Datenbasis wie config/heating-schedules → GET .../customers/:id/plans.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const session = await resolveTbSession(req, res);
  if (!session) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated',
      error: 'Session oder Bearer-JWT mit tbToken und customerid erforderlich'
    });
  }

  const customerId = String(session.user.customerid);
  const TB_API_URL = process.env.THINGSBOARD_URL;
  if (!TB_API_URL) {
    return res.status(503).json({
      success: false,
      message: 'THINGSBOARD_URL nicht gesetzt'
    });
  }

  try {
    const response = await fetchWithTokenRefresh(
      `${TB_API_URL}/api/plugins/telemetry/CUSTOMER/${customerId}/values/attributes`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      },
      session,
      req,
      res
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(
        `ThingsBoard attributes: ${response.status} ${response.statusText}${errText ? ` — ${errText.slice(0, 200)}` : ''}`
      );
    }

    const attributes = await response.json();
    const plans = parsePlansFromAttributes(Array.isArray(attributes) ? attributes : []);

    return res.status(200).json({
      success: true,
      customer_id: customerId,
      plans
    });
  } catch (error) {
    console.error('[heating-scheduler]', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Heizpläne',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
