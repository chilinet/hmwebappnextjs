import sql from 'mssql';
import { convertToTreeViewFormat, normAssetId } from './heating-control/treeUtils';

/**
 * Prüft, ob defaultEntryAssetId in der gespeicherten Mandantenstruktur vorkommt.
 * @returns {{ ok: true, normalized: string | null } | { ok: false, error: string, status: number }}
 */
export async function validateDefaultEntryAssetForCustomer(
  pool,
  customerId,
  defaultEntryAssetId
) {
  const raw =
    defaultEntryAssetId == null || String(defaultEntryAssetId).trim() === ''
      ? null
      : String(defaultEntryAssetId).trim();
  if (!raw) {
    return { ok: true, normalized: null };
  }
  if (!customerId) {
    return {
      ok: false,
      error: 'Kunde fehlt – kein Einstiegsknoten möglich',
      status: 400
    };
  }
  const treeRes = await pool
    .request()
    .input('customer_id', sql.UniqueIdentifier, customerId)
    .query(`SELECT tree FROM customer_settings WHERE customer_id = @customer_id`);
  if (treeRes.recordset.length === 0) {
    return {
      ok: false,
      error: 'Keine Struktur für diesen Kunden',
      status: 400
    };
  }
  let treeParsed;
  try {
    treeParsed = JSON.parse(treeRes.recordset[0].tree);
  } catch {
    return { ok: false, error: 'Strukturdaten ungültig', status: 500 };
  }
  const flat = convertToTreeViewFormat(Array.isArray(treeParsed) ? treeParsed : []);
  const found = flat.some(
    (n) => n.id && normAssetId(n.id) === normAssetId(raw)
  );
  if (!found) {
    return {
      ok: false,
      error: 'Knoten gehört nicht zur Mandantenstruktur',
      status: 400
    };
  }
  return { ok: true, normalized: raw };
}
