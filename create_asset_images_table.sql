-- Tabelle für Asset-Bilder erstellen
-- Diese Tabelle speichert Bilder als BLOB für Assets/Nodes in der Structure

USE hmcdev;
GO

-- Asset Images Tabelle erstellen
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='asset_images' AND xtype='U')
BEGIN
    CREATE TABLE asset_images (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        asset_id NVARCHAR(255) NOT NULL,  -- ThingsBoard Asset ID
        filename NVARCHAR(255) NOT NULL,  -- Originaler Dateiname
        file_extension NVARCHAR(10) NOT NULL,  -- jpg, png
        mime_type NVARCHAR(50) NOT NULL,  -- image/jpeg, image/png
        file_size INT NOT NULL,  -- Dateigröße in Bytes
        image_data VARBINARY(MAX) NOT NULL,  -- Bilddaten als BLOB
        image_type NVARCHAR(50) NOT NULL DEFAULT 'Raum',  -- Typ des Bildes (Heizkörper, Raum, Grundriss)
        image_text NVARCHAR(1000),  -- Editierbarer Text für das Bild
        selected_device NVARCHAR(255),  -- ID des ausgewählten Geräts (falls Bildtyp = Heizkörper)
        uploaded_by NVARCHAR(255),  -- Benutzer-ID der Person, die das Bild hochgeladen hat
        uploaded_at DATETIME2 DEFAULT GETDATE(),  -- Upload-Zeitstempel
        updated_at DATETIME2 DEFAULT GETDATE(),  -- Letzte Aktualisierung
        description NVARCHAR(500),  -- Optionale Beschreibung
        is_primary BIT DEFAULT 0,  -- Hauptbild für das Asset
        
        CONSTRAINT CK_asset_images_extension CHECK (file_extension IN ('jpg', 'jpeg', 'png')),
        CONSTRAINT CK_asset_images_mime_type CHECK (mime_type IN ('image/jpeg', 'image/png')),
        CONSTRAINT CK_asset_images_file_size CHECK (file_size > 0 AND file_size <= 10485760),  -- Max 10MB
        CONSTRAINT CK_asset_images_type CHECK (image_type IN ('Heizkörper', 'Raum', 'Grundriss'))
    );
    
    PRINT 'Tabelle asset_images wurde erfolgreich erstellt.';
END
ELSE
BEGIN
    PRINT 'Tabelle asset_images existiert bereits.';
END

-- Indizes für bessere Performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_asset_images_asset_id')
BEGIN
    CREATE INDEX IX_asset_images_asset_id ON asset_images(asset_id);
    PRINT 'Index IX_asset_images_asset_id wurde erstellt.';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_asset_images_primary')
BEGIN
    CREATE INDEX IX_asset_images_primary ON asset_images(asset_id, is_primary);
    PRINT 'Index IX_asset_images_primary wurde erstellt.';
END

-- Trigger für automatische Aktualisierung von updated_at
IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'TR_asset_images_update_timestamp')
BEGIN
    EXEC('
    CREATE TRIGGER TR_asset_images_update_timestamp
    ON asset_images
    AFTER UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;
        UPDATE asset_images 
        SET updated_at = GETDATE()
        FROM asset_images ai
        INNER JOIN inserted i ON ai.id = i.id;
    END
    ');
    PRINT 'Trigger TR_asset_images_update_timestamp wurde erstellt.';
END

-- Beispiel-Abfragen für die Verwendung:
PRINT '';
PRINT 'Beispiel-Abfragen:';
PRINT '-- Alle Bilder für ein Asset anzeigen:';
PRINT 'SELECT id, filename, file_size, mime_type, uploaded_at, is_primary FROM asset_images WHERE asset_id = ''ASSET_ID_HIER'';';
PRINT '';
PRINT '-- Hauptbild für ein Asset finden:';
PRINT 'SELECT id, filename, image_data FROM asset_images WHERE asset_id = ''ASSET_ID_HIER'' AND is_primary = 1;';
PRINT '';
PRINT '-- Alle Bilder mit Größenstatistiken:';
PRINT 'SELECT COUNT(*) as total_images, SUM(file_size) as total_size_bytes, AVG(file_size) as avg_size_bytes FROM asset_images;';

GO
