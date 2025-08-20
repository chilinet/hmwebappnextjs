-- Erstelle die customers-Tabelle für die lokale Speicherung von ThingsBoard Customer-Daten
-- Dies verbessert die Performanz der Inventory-Seite erheblich

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='customers' AND xtype='U')
BEGIN
    CREATE TABLE customers (
        id NVARCHAR(36) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        title NVARCHAR(500),
        email NVARCHAR(255),
        phone NVARCHAR(50),
        address NVARCHAR(500),
        address2 NVARCHAR(500),
        city NVARCHAR(100),
        country NVARCHAR(100),
        state NVARCHAR(100),
        zip NVARCHAR(20),
        additional_info NVARCHAR(MAX),
        created_time BIGINT,
        updated_time BIGINT,
        last_sync DATETIME2 DEFAULT GETDATE()
    );
    
    -- Erstelle einen Index für bessere Suchperformance
    CREATE INDEX IX_customers_name ON customers(name);
    CREATE INDEX IX_customers_last_sync ON customers(last_sync);
    
    PRINT 'customers-Tabelle erfolgreich erstellt';
END
ELSE
BEGIN
    PRINT 'customers-Tabelle existiert bereits';
END

-- Zeige die Tabellenstruktur an
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'customers'
ORDER BY ORDINAL_POSITION;
