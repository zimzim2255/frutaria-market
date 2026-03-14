-- Add client information fields to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS ice VARCHAR(20);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS if_number VARCHAR(20);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS rc VARCHAR(20);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS patente VARCHAR(20);

-- Add comment for documentation
COMMENT ON COLUMN stores.ice IS 'Identifiant Commun de l''Entreprise (ICE) - Moroccan business identifier';
COMMENT ON COLUMN stores.if_number IS 'Identifiant Fiscal (IF) - Tax identification number';
COMMENT ON COLUMN stores.rc IS 'Registre de Commerce (RC) - Commercial registration number';
COMMENT ON COLUMN stores.patente IS 'Patente - Business license number';
