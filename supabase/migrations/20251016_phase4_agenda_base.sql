-- Fase 4: estructura base para sistema de agendado interno

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_provider') THEN
        CREATE TYPE meeting_provider AS ENUM ('google_meet', 'zoom', 'teams');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cita_estado') THEN
        CREATE TYPE cita_estado AS ENUM ('confirmada', 'cancelada');
    END IF;
END
$$;

ALTER TABLE prospectos
    ADD COLUMN IF NOT EXISTS origen text,
    ADD COLUMN IF NOT EXISTS first_visit_at timestamptz,
    ADD COLUMN IF NOT EXISTS cita_creada boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS tokens_integracion (
    id bigserial PRIMARY KEY,
    usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    proveedor text NOT NULL CHECK (proveedor IN ('google', 'microsoft', 'zoom')),
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamptz,
    scopes text[],
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT tokens_integracion_usuario_proveedor UNIQUE (usuario_id, proveedor)
);

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS is_desarrollador boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS citas (
    id bigserial PRIMARY KEY,
    prospecto_id bigint REFERENCES prospectos(id) ON DELETE SET NULL,
    agente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    supervisor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
    inicio timestamptz NOT NULL,
    fin timestamptz NOT NULL,
    meeting_url text NOT NULL,
    meeting_provider meeting_provider NOT NULL,
    external_event_id text,
    estado cita_estado NOT NULL DEFAULT 'confirmada',
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS citas_agente_inicio_idx ON citas (agente_id, inicio);
CREATE INDEX IF NOT EXISTS citas_supervisor_inicio_idx ON citas (supervisor_id, inicio);

CREATE TABLE IF NOT EXISTS logs_integracion (
    id bigserial PRIMARY KEY,
    usuario_id uuid,
    proveedor text,
    operacion text,
    nivel text,
    detalle jsonb,
    created_at timestamptz DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS logs_integracion_created_idx ON logs_integracion (created_at DESC);

CREATE OR REPLACE VIEW citas_ocupadas AS
    SELECT agente_id AS usuario_id, inicio, fin
    FROM citas
    WHERE estado = 'confirmada'
    UNION ALL
    SELECT supervisor_id AS usuario_id, inicio, fin
    FROM citas
    WHERE estado = 'confirmada' AND supervisor_id IS NOT NULL;
