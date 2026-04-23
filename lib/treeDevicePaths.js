/**
 * Läuft durch den Kundenbaum (customer_settings.tree) und ordnet jeder
 * Geräte-UUID den Pfad aus Knoten-Labels zu (wie in der Web-Dashboard-Ansicht).
 *
 * @param {Array|unknown} treeRoots Wurzel-Knoten (Array) oder geparstes JSON
 * @returns {Record<string, string>} deviceId -> "Label A > Label B > …"
 */
export function buildDevicePathMapFromTree(treeRoots) {
  const map = Object.create(null);
  if (!Array.isArray(treeRoots)) {
    return map;
  }

  function walk(node, path) {
    if (!node || typeof node !== 'object') return;

    const seg = {
      id: node.id,
      label: node.label,
      name: node.name,
      type: node.type
    };
    const currentPath = [...path, seg];
    const pathStr = currentPath
      .map((p) => (p.label != null && p.label !== '' ? p.label : p.name) || '')
      .filter(Boolean)
      .join(' > ');

    if (Array.isArray(node.relatedDevices)) {
      for (const dev of node.relatedDevices) {
        if (dev && dev.id) {
          map[String(dev.id)] = pathStr;
        }
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child, currentPath);
      }
    }
  }

  for (const root of treeRoots) {
    walk(root, []);
  }

  return map;
}
