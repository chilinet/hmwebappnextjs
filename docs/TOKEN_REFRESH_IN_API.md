# Automatisches Token-Refresh in API-Endpunkten

## Übersicht

Um das Problem zu lösen, dass ThingsBoard-Tokens ablaufen können und dann keine Inhalte mehr angezeigt werden, wurde eine zentrale Helper-Funktion `fetchWithTokenRefresh` erstellt, die automatisch Token-Refresh bei 401-Fehlern durchführt.

## Verwendung

### Import

```javascript
import { fetchWithTokenRefresh } from '../../../../lib/utils/fetchWithTokenRefresh';
```

### Beispiel: Vorher (ohne Token-Refresh)

```javascript
const response = await fetch(`${TB_API_URL}/api/plugins/telemetry/CUSTOMER/${customerId}/values/attributes`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'X-Authorization': `Bearer ${session.tbToken}`
  }
});
```

### Beispiel: Nachher (mit automatischem Token-Refresh)

```javascript
const response = await fetchWithTokenRefresh(
  `${TB_API_URL}/api/plugins/telemetry/CUSTOMER/${customerId}/values/attributes`,
  {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  },
  session,
  req,
  res
);
```

## Wichtige Änderungen

1. **Kein `X-Authorization` Header mehr nötig**: Die Funktion fügt diesen automatisch hinzu
2. **Session, req und res müssen übergeben werden**: Für Token-Refresh und Session-Update
3. **Automatisches Retry**: Bei 401-Fehlern wird automatisch ein neues Token geholt und die Anfrage wiederholt

## Funktionsweise

1. Die Funktion macht die initiale Anfrage mit dem Token aus der Session
2. Wenn ein 401-Fehler (Unauthorized) zurückkommt:
   - Holt die ThingsBoard-Credentials aus der Datenbank
   - Führt einen neuen Login durch
   - Aktualisiert das Token in der Datenbank
   - Wiederholt die ursprüngliche Anfrage mit dem neuen Token
3. Gibt die Response zurück (entweder die initiale oder die nach dem Retry)

## Migration bestehender Endpunkte

### Schritt 1: Import hinzufügen

```javascript
import { fetchWithTokenRefresh } from '../../../../lib/utils/fetchWithTokenRefresh';
```

### Schritt 2: Fetch-Aufrufe ersetzen

**Vorher:**
```javascript
const response = await fetch(url, {
  headers: {
    'X-Authorization': `Bearer ${session.tbToken}`
  }
});
```

**Nachher:**
```javascript
const response = await fetchWithTokenRefresh(
  url,
  {
    headers: {}
  },
  session,
  req,
  res
);
```

### Schritt 3: Header anpassen

- Entfernen Sie `'X-Authorization': \`Bearer ${session.tbToken}\`` aus den Headers
- Die Funktion fügt diesen automatisch hinzu

## Bereits migrierte Endpunkte

- `/api/config/customers/[id]/plans/index.js`
- `/api/config/customers/[id]/plans/check-usage.js`
- `/api/config/customers/[id]/plans/update-assets.js`

## Noch zu migrierende Endpunkte

Alle API-Endpunkte, die direkt ThingsBoard aufrufen und `session.tbToken` verwenden, sollten migriert werden. Beispiele:

- `/api/config/assets/[id].js`
- `/api/thingsboard/**/*.js`
- Alle anderen Endpunkte, die ThingsBoard-APIs aufrufen

## Fehlerbehandlung

Die Funktion wirft einen Fehler, wenn:
- Kein Token in der Session vorhanden ist
- Keine Customer-ID gefunden wird
- Der Token-Refresh fehlschlägt

Behandeln Sie diese Fehler wie gewohnt:

```javascript
try {
  const response = await fetchWithTokenRefresh(...);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.statusText}`);
  }
  // ...
} catch (error) {
  console.error('Error:', error);
  return res.status(500).json({ error: error.message });
}
```

## Vorteile

1. **Automatisches Token-Refresh**: Keine manuelle Behandlung von abgelaufenen Tokens mehr nötig
2. **Konsistente Fehlerbehandlung**: Einheitliche Behandlung von Token-Abläufen
3. **Bessere User Experience**: Benutzer sehen keine Fehler mehr wegen abgelaufener Tokens
4. **Weniger Code-Duplikation**: Zentrale Logik für Token-Refresh

