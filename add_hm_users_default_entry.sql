-- Einstiegspunkt in der Objektstruktur (Heizungssteuerung) pro Benutzer
-- Nach Deployment einmalig ausführen.

IF COL_LENGTH('hm_users', 'default_entry_asset_id') IS NULL
BEGIN
  ALTER TABLE hm_users ADD default_entry_asset_id UNIQUEIDENTIFIER NULL;
END
GO

IF COL_LENGTH('hm_users', 'default_entry_override_user') IS NULL
BEGIN
  ALTER TABLE hm_users ADD default_entry_override_user BIT NOT NULL
    CONSTRAINT DF_hm_users_default_entry_override DEFAULT 0;
END
GO
