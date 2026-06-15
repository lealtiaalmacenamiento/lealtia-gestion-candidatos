-- Agrega columnas faltantes a sp_campanas que existian en DEV pero faltaban en migraciones.
-- Usa IF NOT EXISTS para que sea idempotente (ya aplicado manualmente en ambas BDs).
ALTER TABLE sp_campanas
  ADD COLUMN IF NOT EXISTS existe_en_sp boolean NOT NULL DEFAULT true;

ALTER TABLE sp_campanas
  ADD COLUMN IF NOT EXISTS sp_analytics jsonb;

CREATE INDEX IF NOT EXISTS idx_sp_campanas_existe_en_sp
  ON sp_campanas(existe_en_sp)
  WHERE existe_en_sp = true;
