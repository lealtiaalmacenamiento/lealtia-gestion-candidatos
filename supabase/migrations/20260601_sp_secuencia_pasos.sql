-- =============================================================================
-- SP Secuencia de recuperación: pasos de secuencia configurables por campaña
-- + sp_sender_ids en sp_campanas para saber qué cuenta de LinkedIn usar
-- =============================================================================

ALTER TABLE sp_campanas
  ADD COLUMN IF NOT EXISTS sp_sender_ids text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS sp_secuencia_pasos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id  uuid        NOT NULL REFERENCES sp_campanas(id) ON DELETE CASCADE,
  paso        int         NOT NULL CHECK (paso >= 1),
  dias_espera int         NOT NULL DEFAULT 3 CHECK (dias_espera >= 1),
  mensaje     text        NOT NULL,
  activo      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campana_id, paso)
);

CREATE INDEX IF NOT EXISTS sp_secuencia_pasos_campana_idx
  ON sp_secuencia_pasos(campana_id) WHERE activo = true;

-- =============================================================================
-- Deduplicar sp_precandidatos: eliminar filas duplicadas por (campana_id, sp_contact_id)
-- conservando sólo la fila más reciente (mayor created_at) de cada par.
-- Esto corrige inserciones repetidas causadas por el bug de sendpilot_contact_id.
-- =============================================================================
DELETE FROM sp_precandidatos
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY campana_id, sp_contact_id
             ORDER BY created_at DESC
           ) AS rn
    FROM sp_precandidatos
    WHERE sp_contact_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Añadir UNIQUE constraint para evitar duplicados futuros
ALTER TABLE sp_precandidatos
  DROP CONSTRAINT IF EXISTS sp_precandidatos_campana_contact_unique;

ALTER TABLE sp_precandidatos
  ADD CONSTRAINT sp_precandidatos_campana_contact_unique
  UNIQUE (campana_id, sp_contact_id);
