/**
 * Basis-URL des Reporting-Hosts für Aufrufe aus dem Browser (Pages mit fetch).
 * Wert: next.config.js setzt NEXT_PUBLIC_REPORTING_URL aus REPORTING_URL / NEXT_PUBLIC_* (.env).
 */
export function getReportingPublicBaseUrl() {
  const base =
    process.env.NEXT_PUBLIC_REPORTING_URL ||
    process.env.NEXT_PUBLIC_REPORTING_URL_LOCAL ||
    process.env.REPORTING_URL ||
    'https://webapptest.heatmanager.cloud';
  return String(base).replace(/\/$/, '');
}
