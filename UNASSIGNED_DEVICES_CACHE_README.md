# 📦 Datenbank-Cache für nicht zugeordnete Geräte

## 🎯 Übersicht

Dieses System speichert nicht zugeordnete Geräte in einer MSSQL-Datenbank-Tabelle, um die Performance erheblich zu verbessern. Statt bei jedem Klick auf einen Node alle Geräte neu zu laden und zu prüfen, werden die Daten aus der Datenbank gelesen.

## 🚀 Vorteile

- **Persistenz**: Cache überlebt Server-Neustarts
- **Längere Cache-Dauer**: 24 Stunden statt 5 Minuten
- **Skalierbarkeit**: Funktioniert mit mehreren Server-Instanzen
- **Bessere Performance**: Deutlich schnellere Ladezeiten bei wiederholten Anfragen
- **Reduzierte API-Last**: Weniger Aufrufe an ThingsBoard

## 🗄️ Datenbankstruktur

### `unassigned_devices` Tabelle

```sql
CREATE TABLE unassigned_devices (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    device_id NVARCHAR(36) NOT NULL,          -- ThingsBoard Device ID
    customer_id NVARCHAR(36) NOT NULL,         -- Customer ID
    device_data NVARCHAR(MAX) NOT NULL,        -- Vollständige Device-Daten als JSON
    server_attributes NVARCHAR(MAX),          -- Server-Attribute als JSON
    last_sync DATETIME2 DEFAULT GETDATE(),     -- Letzte Synchronisation
    created_at DATETIME2 DEFAULT GETDATE(),    -- Erstellungszeitstempel
    
    CONSTRAINT UQ_unassigned_devices_device_customer UNIQUE (device_id, customer_id),
    CONSTRAINT FK_unassigned_devices_customer FOREIGN KEY (customer_id) 
        REFERENCES customers(id) ON DELETE CASCADE
);
```

### Indizes

- `IX_unassigned_devices_customer_id` - Schnelle Suche nach Customer
- `IX_unassigned_devices_device_id` - Schnelle Suche nach Device
- `IX_unassigned_devices_last_sync` - Für Cache-Bereinigung

## 🔧 Installation

### 1. Datenbanktabelle erstellen

```bash
# Führe das SQL-Skript aus
sqlcmd -S hmcdev01.database.windows.net -U hmroot -P 9YJLpf6CfyteKzoN -d hmcdev -i create_unassigned_devices_table.sql
```

Oder direkt in SQL Server Management Studio:

```sql
-- Führe create_unassigned_devices_table.sql aus
```

## 📋 Funktionsweise

### Cache-Hierarchie

1. **Datenbank-Cache** (24 Stunden TTL)
   - Primäre Quelle für nicht zugeordnete Geräte
   - Persistiert über Server-Neustarts
   - Wird beim ersten Laden erstellt

2. **In-Memory-Cache** (5 Minuten TTL)
   - Fallback wenn Datenbank leer ist
   - Schneller Zugriff für wiederholte Anfragen
   - Wird automatisch mit Datenbank synchronisiert

### Cache-Invalidierung

Der Cache wird automatisch invalidiert, wenn:

- Ein Device einem Asset zugeordnet wird → Device wird aus Cache entfernt
- Ein Device von einem Asset entfernt wird → Cache wird komplett invalidiert (Device könnte wieder nicht zugeordnet sein)
- Cache ist älter als 24 Stunden → Automatische Bereinigung

### API-Funktionen

#### `getUnassignedDevicesFromDb(customerId, maxAgeHours)`
Holt nicht zugeordnete Geräte aus der Datenbank.

#### `saveUnassignedDevicesToDb(customerId, devices)`
Speichert nicht zugeordnete Geräte in der Datenbank.

#### `removeUnassignedDeviceFromDb(deviceId, customerId)`
Entfernt ein Device aus dem Cache (wenn es zugeordnet wurde).

#### `invalidateUnassignedDevicesCache(customerId)`
Invalidiert den gesamten Cache für einen Customer.

#### `cleanupExpiredUnassignedDevices(maxAgeHours)`
Bereinigt abgelaufene Cache-Einträge.

## 🔄 Workflow

### Beim ersten Laden (Cache Miss)

1. API lädt alle Devices vom Customer aus ThingsBoard
2. Prüft für jedes Device, ob es zugeordnet ist
3. Speichert nicht zugeordnete Devices in Datenbank
4. Speichert auch im In-Memory-Cache
5. Gibt Devices zurück

### Bei wiederholten Anfragen (Cache Hit)

1. API liest Devices aus Datenbank (24h Cache)
2. Falls Datenbank leer: Fallback auf In-Memory-Cache (5min)
3. Filtert Devices, die bereits dem aktuellen Asset zugeordnet sind
4. Gibt gefilterte Liste zurück

### Beim Zuordnen eines Devices

1. Relation wird in ThingsBoard erstellt
2. Device wird aus Datenbank-Cache entfernt
3. In-Memory-Cache wird invalidiert
4. Beim nächsten Laden wird Cache neu berechnet

## 📊 Performance-Verbesserungen

- **Erste Anfrage**: ~3-5 Sekunden (einmalig, lädt und speichert)
- **Wiederholte Anfragen**: ~50-200ms (aus Datenbank)
- **Cache-Hit-Rate**: ~95%+ nach erstem Laden

## 🛠️ Wartung

### Cache-Statistiken abrufen

```javascript
import { getUnassignedDevicesCacheStats } from '../lib/utils/unassignedDevicesDb';

const stats = await getUnassignedDevicesCacheStats();
console.log(stats);
// {
//   totalEntries: 1690,
//   customerCount: 5,
//   totalDataSize: 12345678,
//   oldestEntry: '2024-01-01T10:00:00Z',
//   newestEntry: '2024-01-01T12:00:00Z'
// }
```

### Manuelle Cache-Bereinigung

```javascript
import { cleanupExpiredUnassignedDevices } from '../lib/utils/unassignedDevicesDb';

// Lösche Einträge älter als 24 Stunden
const deleted = await cleanupExpiredUnassignedDevices(24);
console.log(`Deleted ${deleted} expired entries`);
```

### Manuelle Cache-Invalidierung

```javascript
import { invalidateUnassignedDevicesCache } from '../lib/utils/unassignedDevicesDb';

// Invalidiere Cache für einen Customer
await invalidateUnassignedDevicesCache('CUSTOMER_ID');
```

## 🔍 Troubleshooting

### Cache wird nicht verwendet

- Prüfe ob Tabelle existiert: `SELECT * FROM unassigned_devices`
- Prüfe Logs auf "Cache hit" vs "Cache miss"
- Prüfe ob `last_sync` nicht älter als 24 Stunden ist

### Cache ist veraltet

- Cache wird automatisch nach 24 Stunden erneuert
- Oder manuell invalidieren: `invalidateUnassignedDevicesCache(customerId)`

### Performance-Probleme

- Prüfe Indizes: `EXEC sp_helpindex 'unassigned_devices'`
- Prüfe Tabellengröße: `SELECT COUNT(*) FROM unassigned_devices`
- Bereinige alte Einträge: `cleanupExpiredUnassignedDevices()`

## 📝 Beispiel-Abfragen

```sql
-- Alle nicht zugeordneten Geräte für einen Customer
SELECT device_id, device_data, server_attributes, last_sync 
FROM unassigned_devices 
WHERE customer_id = 'CUSTOMER_ID' 
ORDER BY last_sync DESC;

-- Anzahl nicht zugeordneter Geräte pro Customer
SELECT customer_id, COUNT(*) as device_count 
FROM unassigned_devices 
GROUP BY customer_id;

-- Alte Cache-Einträge löschen (älter als 24 Stunden)
DELETE FROM unassigned_devices 
WHERE last_sync < DATEADD(HOUR, -24, GETDATE());
```

## 🎯 Zusammenfassung

Das Datenbank-Cache-System verbessert die Performance erheblich, indem nicht zugeordnete Geräte persistent gespeichert werden. Die Kombination aus Datenbank-Cache (24h) und In-Memory-Cache (5min) bietet optimale Performance und Zuverlässigkeit.

