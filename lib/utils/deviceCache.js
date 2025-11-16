/**
 * In-Memory Cache für ThingsBoard Devices
 * Einfache Alternative zu Redis - kein zusätzlicher Server nötig
 */

// Cache-Struktur: Map<customerId, { data: [], timestamp: number, ttl: number }>
const deviceCache = new Map();
// Cache für nicht zugeordnete Geräte: Map<customerId, { data: [], timestamp: number, ttl: number }>
const unassignedDeviceCache = new Map();

// Standard TTL: 5 Minuten
const DEFAULT_TTL = 5 * 60 * 1000; // 5 Minuten in Millisekunden

/**
 * Holt gecachte Devices für einen Customer
 * @param {string} customerId - Customer ID
 * @returns {Array|null} Gecachte Devices oder null wenn nicht vorhanden/abgelaufen
 */
export function getCachedDevices(customerId) {
  const cached = deviceCache.get(customerId);
  
  if (!cached) {
    return null;
  }
  
  const now = Date.now();
  const age = now - cached.timestamp;
  
  // Prüfe ob Cache abgelaufen ist
  if (age > cached.ttl) {
    deviceCache.delete(customerId);
    return null;
  }
  
  return cached.data;
}

/**
 * Speichert Devices im Cache
 * @param {string} customerId - Customer ID
 * @param {Array} devices - Array von Devices
 * @param {number} ttl - Time to live in Millisekunden (optional, default: 5 Minuten)
 */
export function setCachedDevices(customerId, devices, ttl = DEFAULT_TTL) {
  deviceCache.set(customerId, {
    data: devices,
    timestamp: Date.now(),
    ttl: ttl
  });
}

/**
 * Invalidiert den Cache für einen Customer
 * @param {string} customerId - Customer ID
 */
export function invalidateCache(customerId) {
  deviceCache.delete(customerId);
}

/**
 * Gibt Cache-Statistiken zurück
 * @returns {Object} Cache-Statistiken
 */
export function getCacheStats() {
  const now = Date.now();
  const entries = Array.from(deviceCache.entries());
  
  const stats = {
    totalEntries: entries.length,
    validEntries: 0,
    expiredEntries: 0,
    totalDevices: 0
  };
  
  entries.forEach(([customerId, cached]) => {
    const age = now - cached.timestamp;
    if (age <= cached.ttl) {
      stats.validEntries++;
      stats.totalDevices += cached.data.length;
    } else {
      stats.expiredEntries++;
    }
  });
  
  return stats;
}

/**
 * Holt gecachte nicht zugeordnete Geräte für einen Customer
 * @param {string} customerId - Customer ID
 * @returns {Array|null} Gecachte unassigned Devices oder null wenn nicht vorhanden/abgelaufen
 */
export function getCachedUnassignedDevices(customerId) {
  const cached = unassignedDeviceCache.get(customerId);
  
  if (!cached) {
    return null;
  }
  
  const now = Date.now();
  const age = now - cached.timestamp;
  
  // Prüfe ob Cache abgelaufen ist
  if (age > cached.ttl) {
    unassignedDeviceCache.delete(customerId);
    return null;
  }
  
  return cached.data;
}

/**
 * Speichert nicht zugeordnete Geräte im Cache
 * @param {string} customerId - Customer ID
 * @param {Array} devices - Array von unassigned Devices
 * @param {number} ttl - Time to live in Millisekunden (optional, default: 5 Minuten)
 */
export function setCachedUnassignedDevices(customerId, devices, ttl = DEFAULT_TTL) {
  unassignedDeviceCache.set(customerId, {
    data: devices,
    timestamp: Date.now(),
    ttl: ttl
  });
}

/**
 * Invalidiert den Cache für nicht zugeordnete Geräte eines Customers
 * @param {string} customerId - Customer ID
 */
export function invalidateUnassignedCache(customerId) {
  unassignedDeviceCache.delete(customerId);
}

/**
 * Invalidiert den gesamten Cache (auch unassigned)
 */
export function clearCache() {
  deviceCache.clear();
  unassignedDeviceCache.clear();
}

/**
 * Bereinigt abgelaufene Cache-Einträge (auch unassigned)
 * @returns {number} Anzahl gelöschter Einträge
 */
export function cleanupExpiredEntries() {
  const now = Date.now();
  let deleted = 0;
  
  // Bereinige deviceCache
  for (const [customerId, cached] of deviceCache.entries()) {
    const age = now - cached.timestamp;
    if (age > cached.ttl) {
      deviceCache.delete(customerId);
      deleted++;
    }
  }
  
  // Bereinige unassignedDeviceCache
  for (const [customerId, cached] of unassignedDeviceCache.entries()) {
    const age = now - cached.timestamp;
    if (age > cached.ttl) {
      unassignedDeviceCache.delete(customerId);
      deleted++;
    }
  }
  
  return deleted;
}

// Automatische Bereinigung alle 10 Minuten
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    cleanupExpiredEntries();
  }, 10 * 60 * 1000); // Alle 10 Minuten
}

