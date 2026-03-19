/**
 * Heating Control – Debug-Flag und Logging
 */
const DEBUG_HEATING_CONTROL = process.env.NEXT_PUBLIC_HEATING_CONTROL_DEBUG === 'true';
const debugLog = (...args) => { if (DEBUG_HEATING_CONTROL) console.log(...args); };
const debugWarn = (...args) => { if (DEBUG_HEATING_CONTROL) console.warn(...args); };

export { DEBUG_HEATING_CONTROL, debugLog, debugWarn };
