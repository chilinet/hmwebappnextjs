/**
 * Gemeinsame Weiterleitung zur externen Reporting-API (/api/reporting).
 * Wird von reporting-proxy und /api/devices/timeseries genutzt (keine doppelte Fetch-Logik).
 */

const DEFAULT_REPORTING_BASE = 'https://webapptest.heatmanager.cloud';

export function getReportingApiBaseUrl() {
  return (process.env.REPORTING_URL || DEFAULT_REPORTING_BASE).replace(/\/$/, '');
}

export function getReportingReportingUrl() {
  return `${getReportingApiBaseUrl()}/api/reporting`;
}

function appendQueryParams(searchParams, query) {
  if (!query || typeof query !== 'object') return;
  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null) continue;
    const parts = Array.isArray(raw) ? raw : [raw];
    for (const item of parts) {
      if (item === undefined || item === null || item === '') continue;
      searchParams.append(key, String(item));
    }
  }
}

/**
 * @param {object} options
 * @param {Record<string, string|string[]>} [options.query] – Query-Parameter für /api/reporting
 * @param {string} [options.method='GET']
 * @param {object} [options.body] – Nur bei POST (wird zu JSON serialisiert)
 * @param {object} [options.forwardHeaders] – authorization, xApiKey roh vom Client (reporting-proxy)
 */
export async function fetchReportingUpstream({
  query,
  method = 'GET',
  body,
  forwardHeaders
}) {
  const params = new URLSearchParams();
  appendQueryParams(params, query);

  const url = `${getReportingReportingUrl()}?${params.toString()}`;

  const headers = {
    'Content-Type': 'application/json'
  };
  if (forwardHeaders?.authorization) {
    headers.Authorization = forwardHeaders.authorization;
  }
  if (forwardHeaders?.xApiKey) {
    headers['X-API-Key'] = forwardHeaders.xApiKey;
  }

  const init = {
    method,
    headers,
    body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined
  };

  const response = await fetch(url, init);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: 'Invalid JSON from reporting upstream', raw: text };
  }
  return { status: response.status, data };
}
