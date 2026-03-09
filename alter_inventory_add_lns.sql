-- Add LNS Assignment column to inventory table.
-- Run this script against your database (e.g. in SSMS or sqlcmd).
-- Replace YourDatabaseName with your actual database name (e.g. hmcdev), or run inside the correct database context.

-- Option 1: If you already have USE YourDatabaseName; at the top of your session, run:
/*
USE YourDatabaseName;
GO
*/

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.inventory') AND name = 'lns_id'
)
BEGIN
    ALTER TABLE dbo.inventory
    ADD lns_id NVARCHAR(100) NULL;

    PRINT 'Column dbo.inventory.lns_id added successfully.';
END
ELSE
BEGIN
    PRINT 'Column dbo.inventory.lns_id already exists.';
END
GO
