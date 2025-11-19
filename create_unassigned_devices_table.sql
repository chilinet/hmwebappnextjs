-- Tabelle für nicht zugeordnete Geräte erstellen
-- Diese Tabelle speichert nicht zugeordnete Geräte als Cache für bessere Performance

USE hmcdev;
GO

-- Unassigned Devices Tabelle erstellen
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='unassigned_devices' AND xtype='U')
BEGIN
    CREATE TABLE unassigned_devices (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        device_id NVARCHAR(36) NOT NULL,  -- ThingsBoard Device ID
        customer_id NVARCHAR(36) NOT NULL,  -- Customer ID (Foreign Key zu customers)
        device_data NVARCHAR(MAX) NOT NULL,  -- Vollständige Device-Daten als JSON
        server_attributes NVARCHAR(MAX),  -- Server-Attribute als JSON
        last_sync DATETIME2 DEFAULT GETDATE(),  -- Letzte Synchronisation
        created_at DATETIME2 DEFAULT GETDATE(),  -- Erstellungszeitstempel
        
        CONSTRAINT UQ_unassigned_devices_device_customer UNIQUE (device_id, customer_id)
        -- Kein Foreign Key Constraint, da customer_id aus ThingsBoard kommt 
        -- und möglicherweise nicht immer in der customers Tabelle synchronisiert ist
    );
    
    PRINT 'Tabelle unassigned_devices wurde erfolgreich erstellt.';
END
ELSE
BEGIN
    PRINT 'Tabelle unassigned_devices existiert bereits.';
END

-- Indizes für bessere Performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_unassigned_devices_customer_id')
BEGIN
    CREATE INDEX IX_unassigned_devices_customer_id ON unassigned_devices(customer_id);
    PRINT 'Index IX_unassigned_devices_customer_id wurde erstellt.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_unassigned_devices_device_id')
BEGIN
    CREATE INDEX IX_unassigned_devices_device_id ON unassigned_devices(device_id);
    PRINT 'Index IX_unassigned_devices_device_id wurde erstellt.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_unassigned_devices_last_sync')
BEGIN
    CREATE INDEX IX_unassigned_devices_last_sync ON unassigned_devices(last_sync);
    PRINT 'Index IX_unassigned_devices_last_sync wurde erstellt.';
END

-- Trigger für automatische Aktualisierung von last_sync
IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_unassigned_devices_update_timestamp')
BEGIN
    EXEC('
    CREATE TRIGGER TR_unassigned_devices_update_timestamp
    ON unassigned_devices
    AFTER UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;
        UPDATE unassigned_devices 
        SET last_sync = GETDATE()
        FROM unassigned_devices ud
        INNER JOIN inserted i ON ud.id = i.id;
    END
    ');
    PRINT 'Trigger TR_unassigned_devices_update_timestamp wurde erstellt.';
END

-- Beispiel-Abfragen für die Verwendung:
PRINT '';
PRINT 'Beispiel-Abfragen:';
PRINT '-- Alle nicht zugeordneten Geräte für einen Customer:';
PRINT 'SELECT device_id, device_data, server_attributes, last_sync FROM unassigned_devices WHERE customer_id = ''CUSTOMER_ID_HIER'' ORDER BY last_sync DESC;';
PRINT '';
PRINT '-- Anzahl nicht zugeordneter Geräte pro Customer:';
PRINT 'SELECT customer_id, COUNT(*) as device_count FROM unassigned_devices GROUP BY customer_id;';
PRINT '';
PRINT '-- Alte Cache-Einträge löschen (älter als 24 Stunden):';
PRINT 'DELETE FROM unassigned_devices WHERE last_sync < DATEADD(HOUR, -24, GETDATE());';

GO

