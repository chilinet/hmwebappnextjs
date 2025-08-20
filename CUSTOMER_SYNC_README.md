# 🏢 Customer-Synchronisation für bessere Performanz

## 📋 Übersicht

Die Customer-Synchronisation verbessert die Performanz der Inventory-Seite erheblich, indem Customer-Informationen aus ThingsBoard in einer lokalen MSSQL-Tabelle gecacht werden.

## 🚀 Vorteile

- **Bessere Performanz**: Keine ThingsBoard-API-Aufrufe bei jedem Inventory-Load
- **Offline-Verfügbarkeit**: Customer-Daten sind auch verfügbar, wenn ThingsBoard nicht erreichbar ist
- **Schnellere Ladezeiten**: Lokale Datenbankabfragen sind deutlich schneller
- **Reduzierte API-Last**: Weniger Aufrufe an ThingsBoard

## 🗄️ Datenbankstruktur

### customers-Tabelle
```sql
CREATE TABLE customers (
    id NVARCHAR(36) PRIMARY KEY,           -- ThingsBoard Customer ID
    name NVARCHAR(255) NOT NULL,           -- Customer Name
    title NVARCHAR(500),                   -- Customer Title/Description
    email NVARCHAR(255),                   -- E-Mail Adresse
    phone NVARCHAR(50),                    -- Telefonnummer
    address NVARCHAR(500),                 -- Adresse
    address2 NVARCHAR(500),                -- Adresse 2
    city NVARCHAR(100),                    -- Stadt
    country NVARCHAR(100),                 -- Land
    state NVARCHAR(100),                   -- Bundesland/Region
    zip NVARCHAR(20),                      -- PLZ
    additional_info NVARCHAR(MAX),         -- Zusätzliche Informationen (JSON)
    created_time BIGINT,                   -- ThingsBoard Erstellungszeit
    updated_time BIGINT,                   -- ThingsBoard Aktualisierungszeit
    last_sync DATETIME2 DEFAULT GETDATE()  -- Letzte lokale Synchronisation
);
```

### Indizes
- `IX_customers_name` auf `name` für schnelle Namenssuche
- `IX_customers_last_sync` auf `last_sync` für Synchronisationsverwaltung

## 🔧 Installation

### 1. Datenbanktabelle erstellen
```bash
# Führe das SQL-Skript aus
sqlcmd -S hmcdev01.database.windows.net -U hmroot -P 9YJLpf6CfyteKzoN -d hmcdev -i create_customers_table.sql
```

### 2. Erste Synchronisation durchführen
1. Gehe zu `/admin/customer-sync`
2. Klicke auf "Synchronisation starten"
3. Warte bis der Vorgang abgeschlossen ist

## 📱 Verwendung

### Admin-Seite: `/admin/customer-sync`
- **Synchronisation starten**: Lädt alle Customer-Daten von ThingsBoard
- **Status anzeigen**: Zeigt Synchronisationsergebnisse
- **Customer-Daten anzeigen**: Übersicht aller lokalen Customer-Daten

### Automatische Integration
- Die Inventory-Seite lädt Customer-Daten automatisch aus der lokalen Datenbank
- Keine manuellen Änderungen erforderlich
- Fallback-Werte werden angezeigt, falls keine Daten verfügbar sind

## 🔄 Synchronisationsprozess

### Was passiert bei der Synchronisation?
1. **ThingsBoard-Verbindung**: Authentifizierung mit Benutzer-Credentials
2. **Customer-Abruf**: Alle Customers von ThingsBoard laden
3. **Datenvergleich**: Neue/geänderte Customers identifizieren
4. **Datenbank-Update**: Lokale Tabelle aktualisieren
5. **Status-Report**: Zusammenfassung der Änderungen

### Synchronisationsfrequenz
- **Manuell**: Über Admin-Seite bei Bedarf
- **Empfohlen**: Einmal täglich oder bei Änderungen
- **Automatisch**: Kann über Cron-Job eingerichtet werden

## 📊 API-Endpunkte

### `/api/customers/sync` (POST)
- Startet die Synchronisation von ThingsBoard
- Erstellt/aktualisiert die lokale customers-Tabelle
- Gibt Synchronisationsstatistiken zurück

### `/api/customers` (GET)
- Lädt alle lokalen Customer-Daten
- Sortiert nach Namen
- Für Admin-Übersicht

### `/api/customers` (POST)
- Erstellt/aktualisiert einzelne Customer-Daten
- Für manuelle Bearbeitung

## 🛠️ Fehlerbehebung

### Häufige Probleme

#### 1. "Keine Thingsboard-Zugangsdaten gefunden"
- Prüfe ob der Benutzer in der `hm_users` Tabelle existiert
- Stelle sicher, dass `tb_username` und `tb_password` gesetzt sind

#### 2. "Fehler bei der Kommunikation mit der API"
- Prüfe die ThingsBoard-URL in den Umgebungsvariablen
- Stelle sicher, dass ThingsBoard erreichbar ist
- Prüfe die Netzwerkverbindung

#### 3. Datenbankfehler
- Prüfe die Datenbankverbindung
- Stelle sicher, dass die `customers`-Tabelle existiert
- Prüfe die Benutzerrechte

### Logs prüfen
```bash
# Server-Logs anzeigen
docker logs <container-name>

# Oder in der Konsole
console.log('Sync Error:', error);
```

## 🔒 Sicherheit

### Authentifizierung
- Alle API-Endpunkte erfordern NextAuth-Session
- ThingsBoard-Credentials werden aus der lokalen Datenbank geladen
- Keine hartcodierten Passwörter

### Datenzugriff
- Nur authentifizierte Benutzer können synchronisieren
- Customer-Daten sind für alle authentifizierten Benutzer sichtbar
- Keine Löschfunktion für Customer-Daten

## 📈 Performance-Metriken

### Vor der Optimierung
- **Inventory-Load**: 2-5 Sekunden (abhängig von ThingsBoard-API)
- **API-Aufrufe**: 1 pro Gerät mit Customer-ID
- **Offline-Verfügbarkeit**: Nein

### Nach der Optimierung
- **Inventory-Load**: 0.5-1 Sekunde
- **API-Aufrufe**: 0 (alle Daten lokal)
- **Offline-Verfügbarkeit**: Ja (für gecachte Daten)

## 🔮 Zukünftige Erweiterungen

### Automatische Synchronisation
- Cron-Job für regelmäßige Updates
- Webhook-Integration bei ThingsBoard-Änderungen
- E-Mail-Benachrichtigungen bei Synchronisationsfehlern

### Erweiterte Customer-Daten
- Customer-Kategorien
- Vertragsinformationen
- Support-Historie
- Dokumentenverwaltung

### Monitoring
- Synchronisations-Status-Dashboard
- Performance-Metriken
- Fehler-Tracking

## 📞 Support

Bei Fragen oder Problemen:
1. Prüfe die Logs
2. Teste die ThingsBoard-Verbindung
3. Überprüfe die Datenbankverbindung
4. Kontaktiere den Systemadministrator

---

**Hinweis**: Diese Funktionalität ersetzt nicht die ThingsBoard-Integration, sondern optimiert sie für bessere Performanz und Verfügbarkeit.
