-- =============================================================================
-- Add UNIQUE constraint on (campana_id, linkedin_slug) to prevent SP from
-- adding the same LinkedIn profile twice to the same campaign with different
-- leadIds. The constraint is partial (WHERE linkedin_slug IS NOT NULL) because
-- some leads may not have a parseable LinkedIn URL.
-- =============================================================================

-- First, deduplicate any remaining (campana_id, linkedin_slug) pairs
-- keeping the row with the most advanced estado (or oldest created_at as tiebreaker).
DELETE FROM sp_precandidatos
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY campana_id, linkedin_slug
             ORDER BY
               CASE estado
                 WHEN 'promovido'    THEN 1
                 WHEN 'cita_agendada' THEN 2
                 WHEN 'link_enviado' THEN 3
                 WHEN 'respondio'    THEN 4
                 WHEN 'en_secuencia' THEN 5
                 WHEN 'descartado'   THEN 6
                 ELSE 7
               END ASC,
               created_at ASC  -- keep oldest if same estado
           ) AS rn
    FROM sp_precandidatos
    WHERE linkedin_slug IS NOT NULL
  ) ranked
  WHERE rn > 1
);

ALTER TABLE sp_precandidatos
  DROP CONSTRAINT IF EXISTS sp_precandidatos_campana_slug_unique;

ALTER TABLE sp_precandidatos
  ADD CONSTRAINT sp_precandidatos_campana_slug_unique
  UNIQUE (campana_id, linkedin_slug);
