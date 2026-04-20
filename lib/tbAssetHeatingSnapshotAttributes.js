/** SERVER_SCOPE mit Vorrang vor CLIENT_SCOPE — gleiche Keys wie Heating-Control (Auszug). */

const KEYS = ['runStatus', 'schedulerPlan', 'schedulerPlanPIR', 'windowStates', 'windowSensor'];

function extractFromTbArray(tbAttributesArray, keys) {
  const out = {};
  if (!Array.isArray(tbAttributesArray)) return out;
  keys.forEach((key) => {
    const attribute = tbAttributesArray.find((attr) => attr.key === key);
    if (attribute) out[key] = attribute.value;
  });
  return out;
}

async function fetchScope(assetId, tbToken, scopeLabel) {
  const TB = process.env.THINGSBOARD_URL;
  if (!TB || !tbToken) return {};
  const keysParam = KEYS.join(',');
  const url = `${TB}/api/plugins/telemetry/ASSET/${assetId}/values/attributes/${scopeLabel}?keys=${encodeURIComponent(keysParam)}`;
  try {
    const response = await fetch(url, {
      headers: { 'X-Authorization': `Bearer ${tbToken}` }
    });
    if (!response.ok) return {};
    const attributes = await response.json();
    return extractFromTbArray(attributes, KEYS);
  } catch {
    return {};
  }
}

export async function fetchTbHeatingSnapshotAttributes(assetId, tbToken) {
  const [serverAttrs, clientAttrs] = await Promise.all([
    fetchScope(assetId, tbToken, 'SERVER_SCOPE'),
    fetchScope(assetId, tbToken, 'CLIENT_SCOPE')
  ]);
  const merged = { ...clientAttrs };
  KEYS.forEach((key) => {
    if (serverAttrs[key] !== undefined) merged[key] = serverAttrs[key];
  });
  return merged;
}
