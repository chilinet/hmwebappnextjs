/**
 * Einheitliche Debug-Ausgaben: nur wenn DEBUG=true (bzw. 1) in .env gesetzt ist.
 * Im Browser wird NEXT_PUBLIC_DEBUG aus next.config.js aus DEBUG übernommen.
 */

export function isAppDebugEnabled() {
  if (typeof window !== 'undefined') {
    const v = process.env.NEXT_PUBLIC_DEBUG;
    return v === 'true' || v === '1';
  }
  // Server / Edge: DEBUG aus .env; Fallback NEXT_PUBLIC_DEBUG (next.config env, für Middleware)
  const v = process.env.DEBUG ?? process.env.NEXT_PUBLIC_DEBUG;
  return v === 'true' || v === '1';
}

export function debugLog(...args) {
  if (isAppDebugEnabled()) console.log(...args);
}

export function debugWarn(...args) {
  if (isAppDebugEnabled()) console.warn(...args);
}
