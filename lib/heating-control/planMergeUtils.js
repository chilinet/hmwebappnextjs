/**
 * Heizpläne: Kunden-Attribut `plans` (ThingsBoard) + Asset-Attribut `heatingPlans`.
 * Format je Plan: [name, number[24]]
 */

export function normalizeHeatingPlans(raw) {
  if (raw == null) return [];
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.filter(
    (p) =>
      Array.isArray(p) &&
      p.length >= 2 &&
      typeof p[0] === 'string' &&
      Array.isArray(p[1]) &&
      p[1].length >= 0
  );
}

/**
 * Mandantenpläne beibehalten; Asset-Pläne ergänzen. Gleicher Planname: Werte vom Asset gewinnen.
 */
export function mergeCustomerPlansWithAssetPlans(customerPlans, assetHeatingPlansRaw) {
  const base = Array.isArray(customerPlans) ? customerPlans : [];
  const assetPlans = normalizeHeatingPlans(assetHeatingPlansRaw);
  if (!base.length && !assetPlans.length) return null;
  if (!base.length) return assetPlans.map((p) => [...p]);
  if (!assetPlans.length) return base.map((p) => (Array.isArray(p) ? [...p] : p));

  const merged = base.map((p) => (Array.isArray(p) ? [...p] : p));
  for (const ap of assetPlans) {
    if (!Array.isArray(ap) || ap.length < 2 || typeof ap[0] !== 'string') continue;
    const idx = merged.findIndex((p) => Array.isArray(p) && p[0] === ap[0]);
    if (idx !== -1) merged[idx] = [...ap];
    else merged.push([...ap]);
  }
  return merged;
}
