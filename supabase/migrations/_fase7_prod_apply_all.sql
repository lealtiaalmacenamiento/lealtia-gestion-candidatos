-- =============================================================================
-- FASE 7: AUTOMATIZACIÃ“N SENDPILOT + CAL.COM
-- Fecha: 2026-05-11
-- Aplicar en dev/prod ANTES de fusionar en 00_schema_complete.sql
-- =============================================================================

-- 1. tokens_integracion: ampliar proveedores aceptados y agregar columna meta
-- -----------------------------------------------------------------------------

ALTER TABLE tokens_integracion
  DROP CONSTRAINT IF EXISTS tokens_integracion_proveedor_check;

ALTER TABLE tokens_integracion
  ADD CONSTRAINT tokens_integracion_proveedor_check
  CHECK (proveedor IN ('google', 'microsoft', 'zoom', 'teams', 'calcom', 'sendpilot'));

ALTER TABLE tokens_integracion
  ADD COLUMN IF NOT EXISTS meta jsonb;

-- 2. Tablas de reclutamiento SP
-- -----------------------------------------------------------------------------

-- CampaÃ±as de SendPilot configuradas en el CRM
CREATE TABLE IF NOT EXISTS sp_campanas (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                      text        NOT NULL,
  descripcion                 text,
  sendpilot_campaign_id       text        NOT NULL,
  -- identifier del campo Cal.com para prefill (ej. 'LinkedIn')
  calcom_linkedin_identifier  text        NOT NULL DEFAULT 'LinkedIn',
  estado                      text        NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa', 'pausada', 'terminada')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Reclutadores asignados a cada campaÃ±a (con su event type de Cal.com)
CREATE TABLE IF NOT EXISTS sp_campana_reclutadores (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id            uuid    NOT NULL REFERENCES sp_campanas(id) ON DELETE CASCADE,
  reclutador_id         uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calcom_event_type_id  integer,
  calcom_scheduling_url text,
  activo                boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campana_id, reclutador_id)
);

-- Pre-candidatos identificados por SP en LinkedIn
CREATE TABLE IF NOT EXISTS sp_precandidatos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id          uuid        NOT NULL REFERENCES sp_campanas(id) ON DELETE CASCADE,
  reclutador_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- ID del contacto en SendPilot
  sp_contact_id       text,
  nombre              text        NOT NULL,
  apellido            text,
  -- URL canÃ³nica de LinkedIn: https://www.linkedin.com/in/{slug}
  linkedin_url        text,
  -- ID interno invariable de LinkedIn (miniProfileUrn)
  linkedin_urn        text,
  -- Slug extraÃ­do de linkedin_url (para matching case-insensitive con Cal.com prefill)
  linkedin_slug       text,
  email               text,
  empresa             text,
  cargo               text,
  estado              text        NOT NULL DEFAULT 'en_secuencia'
    CHECK (estado IN (
      'en_secuencia',   -- SP enviÃ³ solicitud de conexiÃ³n
      'respondio',      -- aceptÃ³ conexiÃ³n o enviÃ³ mensaje
      'link_enviado',   -- SP enviÃ³ el link de Cal.com en la secuencia
      'cita_agendada',  -- Cal.com BOOKING_CREATED
      'promovido',      -- convertido a candidato oficial
      'descartado'      -- not_interested / descartado manualmente
    )),
  calcom_booking_uid  text,
  -- bigint sin FK (evita ambigÃ¼edad con candidatos.id vs id_candidato en types)
  candidato_id        bigint,
  notas               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Registro de actividad SP para el timeline del pre-candidato
CREATE TABLE IF NOT EXISTS sp_actividades (
  id                  bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  precandidato_id     uuid        NOT NULL REFERENCES sp_precandidatos(id) ON DELETE CASCADE,
  campana_id          uuid        REFERENCES sp_campanas(id) ON DELETE SET NULL,
  -- tipos: sp_conexion_enviada | sp_conexion_aceptada | sp_mensaje_enviado |
  --        sp_mensaje_recibido | sp_link_enviado | cita_agendada | cita_cancelada |
  --        cita_reprogramada | promovido | descartado
  tipo                text        NOT NULL,
  descripcion         text,
  metadata            jsonb,
  -- ID del evento de SP para idempotencia (SP reintenta hasta 5 veces)
  sendpilot_event_id  text        UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Citas de reclutamiento generadas por Cal.com (separadas de citas de prospectos)
CREATE TABLE IF NOT EXISTS sp_citas (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  precandidato_id     uuid        REFERENCES sp_precandidatos(id) ON DELETE SET NULL,
  reclutador_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campana_id          uuid        REFERENCES sp_campanas(id) ON DELETE SET NULL,
  calcom_booking_uid  text        NOT NULL UNIQUE,
  inicio              timestamptz NOT NULL,
  fin                 timestamptz NOT NULL,
  -- nullable: Cal.com no siempre genera un video link
  meeting_url         text,
  estado              text        NOT NULL DEFAULT 'confirmada'
    CHECK (estado IN ('confirmada', 'cancelada')),
  notas               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. Ãndices
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sp_campanas_estado
  ON sp_campanas(estado);

CREATE INDEX IF NOT EXISTS idx_sp_campana_rec_campana
  ON sp_campana_reclutadores(campana_id);

CREATE INDEX IF NOT EXISTS idx_sp_campana_rec_reclutador
  ON sp_campana_reclutadores(reclutador_id);

CREATE INDEX IF NOT EXISTS idx_sp_precandidatos_campana
  ON sp_precandidatos(campana_id);

CREATE INDEX IF NOT EXISTS idx_sp_precandidatos_reclutador
  ON sp_precandidatos(reclutador_id);

CREATE INDEX IF NOT EXISTS idx_sp_precandidatos_estado
  ON sp_precandidatos(estado);

CREATE INDEX IF NOT EXISTS idx_sp_precandidatos_sp_contact
  ON sp_precandidatos(sp_contact_id)
  WHERE sp_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sp_precandidatos_linkedin_slug
  ON sp_precandidatos(linkedin_slug)
  WHERE linkedin_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sp_actividades_precandidato
  ON sp_actividades(precandidato_id);

CREATE INDEX IF NOT EXISTS idx_sp_actividades_sp_event
  ON sp_actividades(sendpilot_event_id)
  WHERE sendpilot_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sp_citas_reclutador_inicio
  ON sp_citas(reclutador_id, inicio);

CREATE INDEX IF NOT EXISTS idx_sp_citas_precandidato
  ON sp_citas(precandidato_id)
  WHERE precandidato_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sp_citas_booking_uid
  ON sp_citas(calcom_booking_uid);

-- 4. Row Level Security
-- Nota: los endpoints de webhook usan supabaseAdmin (service role) y omiten RLS.
-- Las polÃ­ticas aplican a consultas desde el frontend y APIs autenticadas.
-- -----------------------------------------------------------------------------

ALTER TABLE sp_campanas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_campana_reclutadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_precandidatos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_actividades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sp_citas              ENABLE ROW LEVEL SECURITY;

-- sp_campanas: lectura para todos los autenticados; escritura solo admin/supervisor
DROP POLICY IF EXISTS sp_campanas_select ON sp_campanas;
CREATE POLICY sp_campanas_select ON sp_campanas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sp_campanas_insert ON sp_campanas;
CREATE POLICY sp_campanas_insert ON sp_campanas
  FOR INSERT TO authenticated WITH CHECK (is_super_role());

DROP POLICY IF EXISTS sp_campanas_update ON sp_campanas;
CREATE POLICY sp_campanas_update ON sp_campanas
  FOR UPDATE TO authenticated USING (is_super_role());

DROP POLICY IF EXISTS sp_campanas_delete ON sp_campanas;
CREATE POLICY sp_campanas_delete ON sp_campanas
  FOR DELETE TO authenticated USING (is_super_role());

-- sp_campana_reclutadores: lectura para todos; escritura solo admin/supervisor
DROP POLICY IF EXISTS sp_campana_reclutadores_select ON sp_campana_reclutadores;
CREATE POLICY sp_campana_reclutadores_select ON sp_campana_reclutadores
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sp_campana_reclutadores_insert ON sp_campana_reclutadores;
CREATE POLICY sp_campana_reclutadores_insert ON sp_campana_reclutadores
  FOR INSERT TO authenticated WITH CHECK (is_super_role());

DROP POLICY IF EXISTS sp_campana_reclutadores_update ON sp_campana_reclutadores;
CREATE POLICY sp_campana_reclutadores_update ON sp_campana_reclutadores
  FOR UPDATE TO authenticated USING (is_super_role());

DROP POLICY IF EXISTS sp_campana_reclutadores_delete ON sp_campana_reclutadores;
CREATE POLICY sp_campana_reclutadores_delete ON sp_campana_reclutadores
  FOR DELETE TO authenticated USING (is_super_role());

-- sp_precandidatos: reclutador ve los suyos; admin/supervisor ven todos
DROP POLICY IF EXISTS sp_precandidatos_select ON sp_precandidatos;
CREATE POLICY sp_precandidatos_select ON sp_precandidatos
  FOR SELECT TO authenticated
  USING (reclutador_id = auth.uid() OR is_super_role());

DROP POLICY IF EXISTS sp_precandidatos_insert ON sp_precandidatos;
CREATE POLICY sp_precandidatos_insert ON sp_precandidatos
  FOR INSERT TO authenticated WITH CHECK (is_super_role());

DROP POLICY IF EXISTS sp_precandidatos_update ON sp_precandidatos;
CREATE POLICY sp_precandidatos_update ON sp_precandidatos
  FOR UPDATE TO authenticated
  USING (reclutador_id = auth.uid() OR is_super_role());

DROP POLICY IF EXISTS sp_precandidatos_delete ON sp_precandidatos;
CREATE POLICY sp_precandidatos_delete ON sp_precandidatos
  FOR DELETE TO authenticated USING (is_super_role());

-- sp_actividades: reclutador ve las de sus precandidatos; admin/supervisor ven todas
DROP POLICY IF EXISTS sp_actividades_select ON sp_actividades;
CREATE POLICY sp_actividades_select ON sp_actividades
  FOR SELECT TO authenticated
  USING (
    is_super_role() OR
    EXISTS (
      SELECT 1 FROM sp_precandidatos p
      WHERE p.id = sp_actividades.precandidato_id
        AND p.reclutador_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sp_actividades_insert ON sp_actividades;
CREATE POLICY sp_actividades_insert ON sp_actividades
  FOR INSERT TO authenticated WITH CHECK (is_super_role());

-- sp_citas: reclutador ve las suyas; admin/supervisor ven todas
DROP POLICY IF EXISTS sp_citas_select ON sp_citas;
CREATE POLICY sp_citas_select ON sp_citas
  FOR SELECT TO authenticated
  USING (reclutador_id = auth.uid() OR is_super_role());

DROP POLICY IF EXISTS sp_citas_insert ON sp_citas;
CREATE POLICY sp_citas_insert ON sp_citas
  FOR INSERT TO authenticated WITH CHECK (is_super_role());

DROP POLICY IF EXISTS sp_citas_update ON sp_citas;
CREATE POLICY sp_citas_update ON sp_citas
  FOR UPDATE TO authenticated
  USING (reclutador_id = auth.uid() OR is_super_role());

DROP POLICY IF EXISTS sp_citas_delete ON sp_citas;
CREATE POLICY sp_citas_delete ON sp_citas
  FOR DELETE TO authenticated USING (is_super_role());
-- =============================================================================
-- SP Secuencia de recuperaciÃ³n: pasos de secuencia configurables por campaÃ±a
-- + sp_sender_ids en sp_campanas para saber quÃ© cuenta de LinkedIn usar
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
-- conservando sÃ³lo la fila mÃ¡s reciente (mayor created_at) de cada par.
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

-- AÃ±adir UNIQUE constraint para evitar duplicados futuros
ALTER TABLE sp_precandidatos
  DROP CONSTRAINT IF EXISTS sp_precandidatos_campana_contact_unique;

ALTER TABLE sp_precandidatos
  ADD CONSTRAINT sp_precandidatos_campana_contact_unique
  UNIQUE (campana_id, sp_contact_id);
-- AÃ±adir columna existe_en_sp a sp_precandidatos
-- true  = el lead sigue activo en la campaÃ±a de SendPilot
-- false = SP ya no lo incluye (removido/filtrado), pero conservamos historial

ALTER TABLE sp_precandidatos
  ADD COLUMN IF NOT EXISTS existe_en_sp boolean NOT NULL DEFAULT true;
-- =============================================================================
-- Indica que SendPilot agotÃ³ su secuencia sin respuesta del lead.
-- El cron sp-sequence-recovery sÃ³lo actÃºa sobre leads con este flag = true,
-- garantizando que el CRM continÃºa la secuencia en lugar de interferir con SP.
-- =============================================================================

ALTER TABLE sp_precandidatos
  ADD COLUMN IF NOT EXISTS sp_secuencia_terminada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sp_precandidatos_secuencia_terminada_idx
  ON sp_precandidatos(sp_secuencia_terminada)
  WHERE sp_secuencia_terminada = true;
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
