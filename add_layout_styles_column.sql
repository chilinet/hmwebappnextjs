-- Add layout_styles column to customer_settings table
-- This column stores JSON data for customer-specific layout styles

-- Check if column exists, if not add it
IF NOT EXISTS (
    SELECT * 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'customer_settings' 
    AND COLUMN_NAME = 'layout_styles'
)
BEGIN
    ALTER TABLE customer_settings
    ADD layout_styles NVARCHAR(MAX) NULL;
    
    PRINT 'Column layout_styles added to customer_settings table';
END
ELSE
BEGIN
    PRINT 'Column layout_styles already exists in customer_settings table';
END
GO

