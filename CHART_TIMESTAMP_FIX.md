# Chart Timestamp Fix

## Problem
Die Temperatur-Charts zeigten nur Werte am rechten Ende und die X-Achse zeigte "Invalid Date" an.

## Ursache
1. **Falsche Zeitstempel-Verarbeitung**: Die PostgreSQL API gab Zeitstempel zurück, aber die Charts erwarteten ein anderes Format
2. **Falsche Chart-Konfiguration**: Die Charts verwendeten `type: 'category'` anstatt `type: 'time'`
3. **String-Formatierung**: Zeitstempel wurden als formatierte Strings anstatt als Zahlen übergeben

## Lösung

### 1. Zeitstempel-Parsing korrigiert
```javascript
// Vorher
ts: point.ts,
value: point.value

// Nachher
ts: parseInt(point.ts), // Ensure ts is a number
value: parseFloat(point.value) // Ensure value is a number
```

### 2. Chart-Konfiguration geändert
```javascript
// Vorher
xAxis: {
  type: 'category',
  boundaryGap: false,
  data: series.length > 0 ? series[0].data.map(item => item[0]) : [],
  // ...
}

// Nachher
xAxis: {
  type: 'time',
  boundaryGap: false,
  // data property entfernt für time axis
  // ...
}
```

### 3. Datenformat für Charts angepasst
```javascript
// Vorher
const data = deviceData.data.map(point => [
  new Date(point.ts).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }),
  point.value
]);

// Nachher
const data = deviceData.data.map(point => [
  parseInt(point.ts), // Use timestamp directly for time axis
  parseFloat(point.value)
]);
```

### 4. Tooltip-Formatierung angepasst
```javascript
// Vorher
let result = `<div style="font-weight: bold; margin-bottom: 5px; color: #333;">${params[0].axisValue}</div>`;

// Nachher
const timestamp = params[0].axisValue;
const formattedTime = new Date(timestamp).toLocaleString('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
let result = `<div style="font-weight: bold; margin-bottom: 5px; color: #333;">${formattedTime}</div>`;
```

## Betroffene Funktionen
- `fetchTelemetryData()` - Temperatur-Chart
- `fetchTargetTelemetryData()` - Zieltemperatur-Chart
- `fetchValveTelemetryData()` - Ventilposition-Chart
- `getTelemetryChartOption()` - Chart-Konfiguration
- `getTargetTelemetryChartOption()` - Chart-Konfiguration
- `getValveTelemetryChartOption()` - Chart-Konfiguration

## Ergebnis
- ✅ Zeitstempel werden korrekt als Zahlen verarbeitet
- ✅ Charts verwenden `type: 'time'` für korrekte Zeitachse
- ✅ X-Achse zeigt korrekte Zeitstempel an
- ✅ Daten werden über den gesamten Zeitbereich angezeigt
- ✅ Tooltips zeigen formatierte Zeitstempel

## Debugging
Debug-Logs wurden hinzugefügt, um die API-Antworten zu überwachen:
```javascript
console.log('Telemetry data received:', telemetryResult);
console.log('Target telemetry data received:', telemetryResult);
console.log('Valve telemetry data received:', telemetryResult);
```

Diese können nach dem Test entfernt werden.
