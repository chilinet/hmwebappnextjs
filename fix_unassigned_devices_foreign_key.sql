-- Entferne Foreign Key Constraint von unassigned_devices
-- Die customer_id muss nicht zwingend in der customers Tabelle existieren

USE hmcdev;
GO

-- Prüfe ob Foreign Key existiert und entferne ihn
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_unassigned_devices_customer')
BEGIN
    ALTER TABLE unassigned_devices
    DROP CONSTRAINT FK_unassigned_devices_customer;
    
    PRINT 'Foreign Key FK_unassigned_devices_customer wurde entfernt.';
END
ELSE
BEGIN
    PRINT 'Foreign Key FK_unassigned_devices_customer existiert nicht.';
END

GO

