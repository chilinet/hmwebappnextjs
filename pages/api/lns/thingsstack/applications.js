import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { getConnection, getMssqlConfig } from '../../../../lib/db';
import sql from 'mssql';

const FETCH_TIMEOUT_MS = 5000;
const PROBE_TIMEOUT_MS = 1500;

async function loadThingsstackConnection(pool, db) {
  const tableVariants = [
    `${db}.dbo.mwconnections`,
    'dbo.mwconnections',
    `${db}.dbo.nwconnections`,
    'dbo.nwconnections',
    'mwconnections',
    'nwconnections',
  ];

  const queries = [
    `
      SELECT TOP 1 [nwconnection_id] AS connection_id, [name], [APIkey] AS apiKey, [url], [name2], [type], [user] AS username
      FROM __TABLE__
      WHERE LOWER(LTRIM(RTRIM([name]))) = 'thingsstack'
      ORDER BY [nwconnection_id] DESC
    `,
    `
      SELECT TOP 1 [name], [APIkey] AS apiKey, [url], [name2], [type], [user] AS username
      FROM __TABLE__
      WHERE LOWER(LTRIM(RTRIM([name]))) = 'thingsstack'
      ORDER BY [name] DESC
    `,
  ];

  let lastErr = null;
  let hadSuccessfulQuery = false;
  for (const tableName of tableVariants) {
    for (const queryTpl of queries) {
      try {
        const result = await pool.request().query(queryTpl.replace('__TABLE__', tableName));
        hadSuccessfulQuery = true;
        if (result.recordset?.length > 0) return result.recordset[0];
      } catch (err) {
        lastErr = err;
      }
    }
  }

  if (!hadSuccessfulQuery && lastErr) {
    throw new Error(`Thingsstack connection query failed: ${lastErr.message}`);
  }
  return null;
}

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `https://${raw}`.replace(/\/+$/, '');
}

function buildCandidateBaseUrls(url) {
  const input = String(url || '').trim();
  if (!input) return [];

  const candidates = new Set();
  const add = (u) => {
    if (!u) return;
    candidates.add(String(u).replace(/\/+$/, ''));
  };

  const normalized = normalizeBaseUrl(input);
  add(normalized);

  // Convert mqtt/mqtts/ws/wss URLs to http(s) host candidates.
  let converted = input;
  if (/^mqtts?:\/\//i.test(converted)) {
    converted = converted.replace(/^mqtts?:\/\//i, 'https://');
    add(converted);
  }
  if (/^wss?:\/\//i.test(converted)) {
    converted = converted.replace(/^wss?:\/\//i, 'https://');
    add(converted);
  }

  try {
    const u = new URL(normalized);
    // Keep original host+port first.
    add(`${u.protocol}//${u.host}`);
    // MQTT ports are usually not HTTP APIs; try host without port.
    add(`${u.protocol}//${u.hostname}`);
    // Keep protocol consistent to avoid confusing mixed-mode responses.
    if (u.protocol !== 'https:') {
      add(`https://${u.host}`);
      add(`https://${u.hostname}`);
    }
  } catch (_) {}

  return Array.from(candidates).slice(0, 4);
}

function buildTenantCandidateBaseUrls(url, tenantHint) {
  const hint = String(tenantHint || '').trim().toLowerCase();
  if (!hint || !/^[a-z0-9-]{2,63}$/.test(hint)) return [];
  const normalized = normalizeBaseUrl(url);
  try {
    const u = new URL(normalized);
    if (!u.hostname.includes('.')) return [];
    const tenantHost = `${hint}.${u.hostname}`;
    return [
      `${u.protocol}//${tenantHost}`,
      `https://${tenantHost}`,
      `http://${tenantHost}`,
    ];
  } catch (_) {
    return [];
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractApplications(body) {
  const apps = [];
  const seen = new Set();

  const pushApp = (node) => {
    if (!node || typeof node !== 'object') return;
    const appId = node?.ids?.application_id || node?.application_ids?.application_id || node?.application_id;
    if (!appId || seen.has(appId)) return;
    seen.add(appId);
    const name = node?.name || node?.description || appId;
    apps.push({ value: appId, label: `${name} (${appId})` });
  };

  const visit = (node, depth = 0) => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;

    pushApp(node);
    for (const value of Object.values(node)) {
      visit(value, depth + 1);
    }
  };

  visit(body, 0);
  return apps;
}

async function loadApplicationIdHints(pool, db) {
  const tableVariants = [
    `${db}.dbo.nwconnections`,
    'dbo.nwconnections',
    'nwconnections',
  ];
  const ignoreNames = new Set(['thingsstack', 'ttn', 'melita', 'melita heatmanager']);
  let lastErr = null;

  for (const tableName of tableVariants) {
    try {
      const result = await pool.request().query(`
        SELECT TOP 300 [nwconnection_id] AS connection_id, [name], [name2]
        FROM ${tableName}
        WHERE [nwconnection_id] IS NOT NULL
          AND [name] IS NOT NULL
          AND LTRIM(RTRIM([name])) <> ''
        ORDER BY [nwconnection_id] ASC
      `);

      const hints = [];
      const seen = new Set();
      const toSlug = (value) => String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      const looksLikeAppId = (value) => /^[a-z0-9](?:[a-z0-9-]{1,34}[a-z0-9])?$/.test(value);
      const addHint = (value, label) => {
        const appId = String(value || '').trim().toLowerCase();
        if (!appId || !looksLikeAppId(appId) || seen.has(appId)) return;
        seen.add(appId);
        hints.push({ value: appId, label: `${label} (${appId})` });
      };

      for (const row of result.recordset || []) {
        const idRaw = row.connection_id;
        const idNum = Number(idRaw);
        const name = String(row.name || '').trim();
        if (!name || ignoreNames.has(name.toLowerCase())) continue;

        // 1) Numeric-style app IDs used by many tenants (e.g. 00005).
        if (Number.isFinite(idNum) && idNum > 0) {
          addHint(String(Math.trunc(idNum)).padStart(5, '0'), name);
        }

        // 2) Slug from display name (e.g. "Uni Geisenheim" -> "uni-geisenheim").
        const slug = toSlug(name);
        if (slug) addHint(slug, name);
        const compact = slug.replace(/-/g, '');
        if (compact && compact !== slug) addHint(compact, name);
        if (slug && !slug.startsWith('my-')) addHint(`my-${slug}`, name);
        if (compact && !compact.startsWith('my-')) addHint(`my-${compact}`, name);

        // 3) name2 may already contain an API-ready ID.
        const name2 = String(row.name2 || '').trim();
        if (name2) {
          const name2Lower = name2.toLowerCase();
          if (looksLikeAppId(name2Lower)) addHint(name2Lower, name);
          const name2Slug = toSlug(name2);
          if (name2Slug) addHint(name2Slug, name);
          const name2Compact = name2Slug.replace(/-/g, '');
          if (name2Compact && name2Compact !== name2Slug) addHint(name2Compact, name);
        }
      }
      return hints;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function probeApplicationById(baseCandidates, apiKey, hint) {
  const preferredBases = baseCandidates.filter((b) => String(b).startsWith('https://'));
  const bases = preferredBases.length > 0 ? preferredBases : baseCandidates;
  for (const base of bases) {
    const url = `${base}/api/v3/applications/${encodeURIComponent(hint.value)}`;
    try {
      const r = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        redirect: 'follow',
      }, PROBE_TIMEOUT_MS);
      if (!r.ok) {
        if ([404, 400, 401, 403].includes(r.status)) continue;
        continue;
      }
      const contentType = (r.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) continue;
      const parsed = await r.json().catch(() => null);
      const appId = parsed?.ids?.application_id || hint.value;
      const appName = parsed?.name || hint.label.split(' (')[0] || appId;
      return { value: appId, label: `${appName} (${appId})` };
    } catch (_) {
      continue;
    }
  }
  return null;
}

async function loadInventoryApplicationIdHints(pool, db) {
  const tableVariants = [
    `${db}.dbo.inventory`,
    'dbo.inventory',
    'inventory',
  ];
  const looksLikeAppId = (value) => /^[a-z0-9](?:[a-z0-9-]{1,34}[a-z0-9])?$/.test(value);
  let lastErr = null;

  for (const tableName of tableVariants) {
    try {
      const result = await pool.request().query(`
        SELECT DISTINCT TOP 300 lns_id
        FROM ${tableName}
        WHERE lns_id IS NOT NULL AND LTRIM(RTRIM(lns_id)) <> ''
      `);
      const seen = new Set();
      const hints = [];
      for (const row of result.recordset || []) {
        const id = String(row.lns_id || '').trim().toLowerCase();
        if (!id || !looksLikeAppId(id) || seen.has(id)) continue;
        seen.add(id);
        hints.push({ value: id, label: `${id} (${id})` });
      }
      return hints;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function loadCustomerApplicationIdHints(pool, db) {
  const tableVariants = [
    `${db}.dbo.customers`,
    'dbo.customers',
    'customers',
  ];
  const toSlug = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const looksLikeAppId = (value) => /^[a-z0-9](?:[a-z0-9-]{1,34}[a-z0-9])?$/.test(value);
  const ignore = new Set(['thingsstack', 'ttn', 'melita', 'heatmanager', 'admin']);
  let lastErr = null;

  for (const tableName of tableVariants) {
    try {
      const result = await pool.request().query(`
        SELECT TOP 300 [name], [title]
        FROM ${tableName}
        WHERE ([name] IS NOT NULL AND LTRIM(RTRIM([name])) <> '')
           OR ([title] IS NOT NULL AND LTRIM(RTRIM([title])) <> '')
      `);
      const seen = new Set();
      const hints = [];
      const add = (raw, label) => {
        const id = String(raw || '').trim().toLowerCase();
        if (!id || !looksLikeAppId(id) || ignore.has(id) || seen.has(id)) return;
        seen.add(id);
        hints.push({ value: id, label: `${label} (${id})` });
      };

      for (const row of result.recordset || []) {
        const candidates = [row.name, row.title].filter(Boolean).map((v) => String(v).trim());
        for (const name of candidates) {
          const slug = toSlug(name);
          if (!slug) continue;
          add(slug, name);
          const compact = slug.replace(/-/g, '');
          if (compact && compact !== slug) add(compact, name);
          if (!slug.startsWith('my-')) add(`my-${slug}`, name);
          if (compact && !compact.startsWith('my-')) add(`my-${compact}`, name);
        }
      }
      return hints;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

function buildSystemApplicationIdHints({ dbName, baseUrl, tenantHint }) {
  const hints = [];
  const seen = new Set();
  const looksLikeAppId = (value) => /^[a-z0-9](?:[a-z0-9-]{1,34}[a-z0-9])?$/.test(value);
  const add = (raw, label) => {
    const id = String(raw || '').trim().toLowerCase();
    if (!id || !looksLikeAppId(id) || seen.has(id)) return;
    seen.add(id);
    hints.push({ value: id, label: `${label} (${id})` });
  };

  const compactFromDb = String(dbName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (compactFromDb) {
    add(compactFromDb, 'System');
    const noTrailingDigits = compactFromDb.replace(/\d+$/, '');
    if (noTrailingDigits && noTrailingDigits !== compactFromDb) {
      add(noTrailingDigits, 'System');
    }
  }

  const host = (() => {
    try {
      return new URL(normalizeBaseUrl(baseUrl)).hostname.toLowerCase();
    } catch (_) {
      return '';
    }
  })();
  if (host) {
    const firstLabel = host.split('.')[0];
    if (firstLabel) add(firstLabel, 'Tenant');
  }

  if (tenantHint) {
    const cleanHint = String(tenantHint).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (cleanHint) add(cleanHint, 'Tenant');
  }

  return hints;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const session = await getServerSession(req, res, authOptions);
  if (!session?.token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  try {
    const debugEnabled = String(req.query?.debug || '') === '1';
    const debug = [];
    const addDebug = (step, data = {}) => {
      const entry = { ts: new Date().toISOString(), step, ...data };
      debug.push(entry);
      console.log('[LNS][Thingsstack][applications]', step, data);
    };

    const pool = await getConnection();
    const db = getMssqlConfig().database;
    addDebug('db.connected', { database: db });
    const connection = await loadThingsstackConnection(pool, db);

    if (!connection) {
      addDebug('db.connection_not_found');
      return res.status(404).json({
        error: 'Thingsstack Verbindung nicht gefunden',
        details: 'Kein Eintrag mit name = "Thingsstack" in mwconnections/nwconnections gefunden.',
        ...(debugEnabled ? { debug } : {}),
      });
    }

    const apiKey = String(connection.apiKey || '').trim();
    const baseUrl = normalizeBaseUrl(connection.url);
    const tenantHint = String(connection.username || connection.name2 || '').trim();
    addDebug('db.connection_found', {
      connectionId: connection.connection_id ?? null,
      name: connection.name,
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? `${apiKey.slice(0, 6)}...` : null,
      rawUrl: connection.url || null,
      normalizedBaseUrl: baseUrl || null,
      tenantHint: tenantHint || null,
    });
    if (!apiKey || !baseUrl) {
      addDebug('db.connection_invalid', { hasApiKey: !!apiKey, hasBaseUrl: !!baseUrl });
      return res.status(400).json({
        error: 'Thingsstack Verbindung unvollständig',
        details: 'APIkey und URL müssen in mwconnections/nwconnections gesetzt sein.',
        ...(debugEnabled ? { debug } : {}),
      });
    }

    const baseCandidates = buildCandidateBaseUrls(baseUrl);
    const tenantCandidates = buildTenantCandidateBaseUrls(baseUrl, tenantHint);
    for (const t of tenantCandidates) {
      if (!baseCandidates.includes(t) && baseCandidates.length < 8) baseCandidates.push(t);
    }
    addDebug('http.base_candidates', { baseCandidates });
    if (baseCandidates.length === 0) {
      addDebug('http.no_candidates');
      return res.status(400).json({
        error: 'Thingsstack URL ungültig',
        details: 'Es konnte keine gültige Base-URL aus mwconnections/nwconnections.url gebildet werden.',
        ...(debugEnabled ? { debug } : {}),
      });
    }

    let response = null;
    let body = null;
    let lastErr = null;
    const tried = [];
    let sawHtmlInsteadOfJson = false;
    let sawTenantNotActive = false;
    let sawInvalidToken = false;
    let sawNoUserRights = false;
    let lastAuthLikeError = '';
    for (const candidate of baseCandidates) {
      const routes = [
        { method: 'GET', url: `${candidate}/api/v3/applications?page=1&limit=200` },
        { method: 'GET', url: `${candidate}/api/v3/users/me/applications?page=1&limit=200` },
      ];
      for (const route of routes) {
        tried.push(`${route.method} ${route.url}`);
        try {
          const startedAt = Date.now();
          addDebug('http.attempt.start', { method: route.method, url: route.url });
          const r = await fetchWithTimeout(route.url, {
            method: route.method,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: route.body ? JSON.stringify(route.body) : undefined,
            redirect: 'follow',
          });
          addDebug('http.attempt.response', {
            method: route.method,
            url: route.url,
            status: r.status,
            elapsedMs: Date.now() - startedAt,
          });
          if (!r.ok) {
            const text = await r.text();
            if (/tenant_not_active/i.test(text || '')) {
              sawTenantNotActive = true;
            }
            if (/invalid token/i.test(text || '')) {
              sawInvalidToken = true;
              lastAuthLikeError = text || r.statusText;
            }
            if (/no_user_rights/i.test(text || '')) {
              sawNoUserRights = true;
              lastAuthLikeError = text || r.statusText;
            }
            if ([400, 401, 403, 404, 405, 501].includes(r.status)) {
              addDebug('http.attempt.non_ok_continue', {
                method: route.method,
                url: route.url,
                status: r.status,
                bodyPreview: text?.slice(0, 240) || '',
              });
              lastErr = new Error(`HTTP ${r.status}: ${text || r.statusText}`);
              continue;
            }
            addDebug('http.attempt.non_ok_abort', {
              method: route.method,
              url: route.url,
              status: r.status,
              bodyPreview: text?.slice(0, 240) || '',
            });
            return res.status(r.status).json({
              error: 'Thingsstack API Fehler beim Laden der Applications',
              details: text || r.statusText,
              tried,
              ...(debugEnabled ? { debug } : {}),
            });
          }
          const contentType = (r.headers.get('content-type') || '').toLowerCase();
          const text = await r.text();
          if (!contentType.includes('application/json')) {
            const isHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
            if (isHtml) {
              sawHtmlInsteadOfJson = true;
            }
            addDebug('http.attempt.non_json', {
              method: route.method,
              url: route.url,
              contentType,
              bodyPreview: text.slice(0, 120),
            });
            lastErr = new Error(`Non-JSON response (${contentType || 'unknown content-type'})`);
            continue;
          }
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch (parseErr) {
            addDebug('http.attempt.json_parse_error', {
              method: route.method,
              url: route.url,
              error: parseErr.message,
              bodyPreview: text.slice(0, 120),
            });
            lastErr = parseErr;
            continue;
          }
          const offers = extractApplications(parsed);
          addDebug('http.attempt.parsed', {
            method: route.method,
            url: route.url,
            offersFound: offers.length,
            topLevelKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 20) : [],
          });
          if (offers.length > 0) {
            return res.status(200).json({ offers, ...(debugEnabled ? { debug } : {}) });
          }
          response = r;
          body = parsed;
        } catch (err) {
          lastErr = err?.name === 'AbortError'
            ? new Error(`Timeout after ${FETCH_TIMEOUT_MS}ms`)
            : err;
          addDebug('http.attempt.error', {
            method: route.method,
            url: route.url,
            error: lastErr?.message || String(lastErr),
          });
        }
      }
    }

    if (!response) {
      addDebug('http.all_attempts_failed', {
        lastError: lastErr?.message || 'Unbekannter Verbindungsfehler',
        triedCount: tried.length,
        sawHtmlInsteadOfJson,
        sawTenantNotActive,
        sawInvalidToken,
        sawNoUserRights,
      });
      if (sawInvalidToken) {
        return res.status(401).json({
          error: 'Thingsstack API-Key ungültig',
          details: 'Die Thingsstack API meldet "invalid token". Bitte einen gültigen Tenant-API-Key verwenden.',
          raw: lastAuthLikeError || undefined,
          tried,
          ...(debugEnabled ? { debug } : {}),
        });
      }
      if (sawNoUserRights) {
        return res.status(403).json({
          error: 'Thingsstack API-Key ohne ausreichende Rechte',
          details: 'Der Token hat keine Rechte zum Lesen von Applications (no_user_rights). Bitte Admin/Applications-Rechte vergeben.',
          raw: lastAuthLikeError || undefined,
          tried,
          ...(debugEnabled ? { debug } : {}),
        });
      }
      const status = sawTenantNotActive ? 400 : 502;
      return res.status(status).json({
        error: 'Keine Verbindung zur Thingsstack HTTP API möglich',
        details: lastErr?.message || 'Unbekannter Verbindungsfehler',
        tried,
        hint: sawTenantNotActive
          ? 'Tenant ist nicht aktiv oder falscher Tenant-Host. Setze in mwconnections.url den korrekten aktiven Tenant-Domain-Host aus dem Thingsstack-Portal (z.B. https://<dein-tenant>.eu1.cloud.thethings.industries).'
          : sawHtmlInsteadOfJson
            ? 'Die konfigurierte URL scheint auf die Web-Oberfläche/MQTT statt auf den JSON API Tenant-Endpoint zu zeigen. Verwende in mwconnections.url den Tenant API Host, z.B. https://<tenant>.eu1.cloud.thethings.industries'
            : undefined,
        ...(debugEnabled ? { debug } : {}),
      });
    }

    const offers = extractApplications(body);
    if (offers.length === 0 && sawInvalidToken) {
      return res.status(401).json({
        error: 'Thingsstack API-Key ungültig',
        details: 'Die Thingsstack API meldet "invalid token". Bitte einen gültigen Tenant-API-Key verwenden.',
        raw: lastAuthLikeError || undefined,
        tried,
        ...(debugEnabled ? { debug } : {}),
      });
    }
    if (offers.length === 0 && sawNoUserRights) {
      return res.status(403).json({
        error: 'Thingsstack API-Key ohne ausreichende Rechte',
        details: 'Der Token hat keine Rechte zum Lesen von Applications (no_user_rights). Bitte Admin/Applications-Rechte vergeben.',
        raw: lastAuthLikeError || undefined,
        tried,
        ...(debugEnabled ? { debug } : {}),
      });
    }
    if (offers.length === 0) {
      try {
        const [hintsFromConnections, hintsFromInventory, hintsFromCustomers] = await Promise.all([
          loadApplicationIdHints(pool, db),
          loadInventoryApplicationIdHints(pool, db),
          loadCustomerApplicationIdHints(pool, db),
        ]);
        const hintsFromSystem = buildSystemApplicationIdHints({
          dbName: db,
          baseUrl,
          tenantHint,
        });
        const merged = [];
        const seen = new Set();
        for (const h of [...hintsFromConnections, ...hintsFromInventory, ...hintsFromCustomers, ...hintsFromSystem]) {
          if (!h?.value || seen.has(h.value)) continue;
          seen.add(h.value);
          merged.push(h);
        }
        addDebug('fallback.hints_loaded', {
          fromConnections: hintsFromConnections.length,
          fromInventory: hintsFromInventory.length,
          fromCustomers: hintsFromCustomers.length,
          fromSystem: hintsFromSystem.length,
          total: merged.length,
        });
        const probeCandidates = merged.slice(0, 180);
        const discovered = await Promise.all(
          probeCandidates.map((hint) => probeApplicationById(baseCandidates, apiKey, hint))
        );
        const discoveredOffers = [];
        const seenDiscovered = new Set();
        for (const app of discovered) {
          if (!app || seenDiscovered.has(app.value)) continue;
          seenDiscovered.add(app.value);
          discoveredOffers.push(app);
        }
        discoveredOffers.sort((a, b) => a.label.localeCompare(b.label));
        addDebug('fallback.discovery_result', { discoveredCount: discoveredOffers.length });
        if (discoveredOffers.length > 0) {
          return res.status(200).json({
            offers: discoveredOffers,
            details: 'Applications wurden über bekannte IDs aus nwconnections ermittelt.',
            ...(debugEnabled ? { debug } : {}),
          });
        }
      } catch (fallbackErr) {
        addDebug('fallback.discovery_error', { error: fallbackErr.message });
      }
    }
    addDebug('http.completed_without_offers', { offersFound: offers.length, triedCount: tried.length });
    return res.status(200).json({
      offers,
      details: offers.length === 0 ? 'Keine Applications im API-Response gefunden.' : undefined,
      ...(debugEnabled ? { debug } : {}),
    });
  } catch (err) {
    console.error('Thingsstack applications fetch error:', err);
    return res.status(500).json({
      error: 'Fehler beim Laden der Thingsstack Applications',
      details: err.message,
    });
  }
}

