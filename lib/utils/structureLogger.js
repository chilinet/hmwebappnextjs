import fs from 'fs';
import path from 'path';

// Erstelle logs-Verzeichnis falls es nicht existiert
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFile = path.join(logsDir, 'structure-creation.log');

/**
 * Schreibt einen Log-Eintrag in die Struktur-Erstellungs-Logdatei
 * @param {string} level - Log-Level (info, warn, error)
 * @param {string} message - Log-Nachricht
 * @param {object} data - Zusätzliche Daten (optional)
 */
export function logStructureCreation(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(data && { data })
  };
  
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' ' + JSON.stringify(data, null, 2) : ''}\n`;
  
  try {
    // Append to log file
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (error) {
    // Fallback to console if file write fails
    console.error('Failed to write to log file:', error);
    console.log(logLine);
  }
}

/**
 * Loggt Info-Meldungen
 */
export function logInfo(message, data = null) {
  logStructureCreation('info', message, data);
}

/**
 * Loggt Warnungen
 */
export function logWarn(message, data = null) {
  logStructureCreation('warn', message, data);
}

/**
 * Loggt Fehler
 */
export function logError(message, error = null) {
  const errorData = error ? {
    message: error.message,
    stack: error.stack,
    ...(error.cause && { cause: error.cause })
  } : null;
  logStructureCreation('error', message, errorData);
}

/**
 * Startet eine neue Log-Session für eine Struktur-Erstellung
 * @param {string} customerId - Customer ID
 * @returns {string} Session ID
 */
export function startStructureCreationLog(customerId) {
  const sessionId = `session-${Date.now()}`;
  logInfo('=== Structure Creation Started ===', { customerId, sessionId });
  return sessionId;
}

/**
 * Beendet eine Log-Session
 * @param {string} sessionId - Session ID
 * @param {object} summary - Zusammenfassung der Erstellung
 */
export function endStructureCreationLog(sessionId, summary) {
  logInfo('=== Structure Creation Completed ===', { sessionId, summary });
}

