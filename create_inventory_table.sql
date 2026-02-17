-- Create the inventory table for device/inventory management.
-- Run this script against the hmcdev database (e.g. in SSMS or sqlcmd).
-- The API at GET/POST/PUT/DELETE /api/inventory expects this table to exist.

USE hmcdev;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'inventory' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.inventory (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        devicenbr NVARCHAR(30),
        devicename NVARCHAR(30),
        deveui NVARCHAR(30),
        joineui NVARCHAR(30),
        serialnbr NVARCHAR(100),
        appkey NVARCHAR(50),
        loraversion NVARCHAR(10),
        regionalversion NVARCHAR(10),
        customerid NVARCHAR(100),
        tbconnectionid NVARCHAR(100),
        nwconnectionid NVARCHAR(100),
        brand_id INT,
        model_id INT,
        hardwareversion NVARCHAR(50),
        firmwareversion NVARCHAR(50),
        owner_id INT,
        group_id INT,
        distributor_id INT,
        status_id INT,
        invoicenbr NVARCHAR(50),
        ordernbr NVARCHAR(50),
        orderdate DATE,
        installed_at DATETIME2,
        tbconnected_at DATETIME2,
        nwconnected_at DATETIME2,
        created_at DATETIME2,
        updated_at DATETIME2,
        status NVARCHAR(50),
        contractId NVARCHAR(100),
        deviceLabel NVARCHAR(100),
        deviceProfileId NVARCHAR(100),
        offerName NVARCHAR(100),
        hasrelation BIT DEFAULT 0
    );

    CREATE INDEX IX_inventory_customerid ON dbo.inventory(customerid);
    CREATE INDEX IX_inventory_tbconnectionid ON dbo.inventory(tbconnectionid);
    CREATE INDEX IX_inventory_deviceid ON dbo.inventory(devicenbr);

    PRINT 'inventory table created successfully.';
END
ELSE
BEGIN
    PRINT 'inventory table already exists.';
END
GO
