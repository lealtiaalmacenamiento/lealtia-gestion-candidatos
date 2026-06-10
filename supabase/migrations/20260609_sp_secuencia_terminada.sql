-- =============================================================================
-- Indica que SendPilot agotó su secuencia sin respuesta del lead.
-- El cron sp-sequence-recovery sólo actúa sobre leads con este flag = true,
-- garantizando que el CRM continúa la secuencia en lugar de interferir con SP.
-- =============================================================================

ALTER TABLE sp_precandidatos
  ADD COLUMN IF NOT EXISTS sp_secuencia_terminada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sp_precandidatos_secuencia_terminada_idx
  ON sp_precandidatos(sp_secuencia_terminada)
  WHERE sp_secuencia_terminada = true;
