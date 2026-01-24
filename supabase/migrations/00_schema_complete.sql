-- =============================================================================
-- LEALTIA GESTION CANDIDATOS - SCHEMA COMPLETO CONSOLIDADO
-- =============================================================================
-- Fecha de consolidación: 2026-01-21
-- 
-- Este archivo consolida TODAS las migraciones de supabase/migrations/
-- en un solo schema ejecutable desde cero en PostgreSQL limpio.
-- 
-- Orden de ejecución:
-- 1. Extensions y helpers básicos
-- 2. ENUMs y tipos personalizados
-- 3. Secuencias y funciones helper
-- 4. Tablas base (usuarios, candidatos)
-- 5. Tablas de negocio (clientes, polizas, producto_parametros, etc.)
-- 6. Tablas de campaña y segmentos (Phase 5)
-- 7. Tablas de agenda y citas (Phase 4)
-- 8. Tablas de pagos y comisiones (Phase 6)
-- 9. Índices
-- 10. Triggers
-- 11. Funciones de negocio
-- 12. RLS Policies
-- 13. Views
-- 14. Grants y permisos
-- 15. Datos semilla mínimos
-- =============================================================================

BEGIN;

SET check_function_bodies = off;

-- =============================================================================
-- 1. EXTENSIONS Y HELPERS BÁSICOS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA public;

-- =============================================================================
-- 2. ENUMS Y TIPOS PERSONALIZADOS
-- =============================================================================

-- Tipos de Fase 2 y 3 (producto, clientes, polizas)
CREATE TYPE estatus_poliza AS ENUM ('EN_VIGOR', 'ANULADA');
CREATE TYPE forma_pago AS ENUM ('MODO_DIRECTO', 'CARGO_AUTOMATICO');
CREATE TYPE tipo_producto AS ENUM ('VI', 'GMM');
CREATE TYPE tipo_clasificacion_puntos AS ENUM ('CERO','MEDIO','SIMPLE','DOBLE','TRIPLE');
CREATE TYPE moneda_poliza AS ENUM ('MXN','USD','UDI');
CREATE TYPE estado_solicitud_cambio AS ENUM ('PENDIENTE','APROBADA','RECHAZADA');
CREATE TYPE tipo_cambio_cliente AS ENUM ('CREACION','MODIFICACION','APROBACION','RECHAZO');

-- Periodicidad de pago (versión final expandida - Phase 6)
CREATE TYPE periodicidad_pago AS ENUM ('mensual', 'trimestral', 'semestral', 'anual');

-- Tipos de Fase 4 (agenda/citas)
CREATE TYPE meeting_provider AS ENUM ('google_meet', 'zoom', 'teams');
CREATE TYPE cita_estado AS ENUM ('confirmada', 'cancelada');

-- Tipos de Fase 5 (campañas)
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE campaign_progress_status AS ENUM ('not_eligible', 'eligible', 'completed');

-- Tipos de Fase 6 (pagos)
CREATE TYPE poliza_pago_estado AS ENUM ('pendiente', 'pagado', 'vencido', 'omitido');

-- =============================================================================
-- 3. SECUENCIAS Y FUNCIONES HELPER BÁSICAS
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS seq_cliente_code START 1;

-- Genera código único para clientes
CREATE OR REPLACE FUNCTION generar_cliente_code() 
RETURNS text 
LANGUAGE sql 
VOLATILE
AS $$
  SELECT 'LEACL-' || lpad(nextval('seq_cliente_code')::text, 6, '0');
$$;

-- Helper para updated_at
CREATE OR REPLACE FUNCTION set_updated_at() 
RETURNS trigger 
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Helper para obtener rol del JWT
CREATE OR REPLACE FUNCTION jwt_role()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN COALESCE((current_setting('request.jwt.claims', true)::jsonb)->>'role', '');
END;
$$;

-- Verifica si el usuario actual es supervisor/admin
CREATE OR REPLACE FUNCTION is_super_role()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios
    WHERE id_auth = auth.uid()
      AND activo IS TRUE
      AND lower(rol) IN ('supervisor','admin')
  ) OR jwt_role() IN ('supervisor','admin');
END;
$$;

-- =============================================================================
-- 4. TABLAS BASE: USUARIOS Y CANDIDATOS
-- =============================================================================

-- Tabla: usuarios (base de autenticación y roles)
CREATE TABLE IF NOT EXISTS usuarios (
  id bigserial PRIMARY KEY,
  id_auth uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  nombre text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('agente', 'supervisor', 'admin')),
  activo boolean NOT NULL DEFAULT true,
  eliminado boolean DEFAULT false,
  last_login timestamptz,
  is_desarrollador boolean DEFAULT false,
  created_at timestamptz DEFAULT timezone('America/Mexico_City', now()),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_id_auth ON usuarios(id_auth);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol_activo ON usuarios(rol, activo);

-- Tabla: candidatos (funnel de captación)
CREATE TABLE IF NOT EXISTS candidatos (
  id bigserial PRIMARY KEY,
  candidato text NOT NULL,
  telefono text,
  email_candidato text,
  email_agente text,
  estado text NOT NULL DEFAULT 'nuevo',
  origen text,
  nombre_agente text,
  anio_conexion integer,
  mes_conexion text,
  efc text,
  notas text,
  etapas_completadas jsonb DEFAULT '[]'::jsonb,
  fecha_nacimiento date,
  eliminado boolean DEFAULT false,
  first_visit_at timestamptz,
  created_at timestamptz DEFAULT timezone('America/Mexico_City', now()),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_candidatos_email_agente ON candidatos(email_agente);
CREATE INDEX IF NOT EXISTS idx_candidatos_email_candidato ON candidatos(email_candidato);
CREATE INDEX IF NOT EXISTS idx_candidatos_estado ON candidatos(estado);
CREATE INDEX IF NOT EXISTS idx_candidatos_mes_conexion 
  ON candidatos(mes_conexion) 
  WHERE mes_conexion IS NOT NULL AND mes_conexion <> '' AND eliminado = false;

-- Constraint para email único de candidato (no eliminados)
CREATE UNIQUE INDEX IF NOT EXISTS candidatos_email_candidato_unique_active
  ON candidatos(email_candidato)
  WHERE email_candidato IS NOT NULL AND eliminado = false;

-- =============================================================================
-- 5. TABLAS DE NEGOCIO: CLIENTES, POLIZAS, PRODUCTOS
-- =============================================================================

-- Tabla: producto_parametros (catálogo de productos y comisiones)
CREATE TABLE IF NOT EXISTS producto_parametros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_comercial text NOT NULL,
  tipo_producto tipo_producto NOT NULL,
  moneda moneda_poliza NULL,
  duracion_anios int NULL,
  condicion_sa_tipo text NULL,
  sa_min numeric(18,2) NULL,
  sa_max numeric(18,2) NULL,
  condicion_edad_tipo text NULL,
  edad_min int NULL,
  edad_max int NULL,
  anio_1_percent numeric(6,3) NULL,
  anio_2_percent numeric(6,3) NULL,
  anio_3_percent numeric(6,3) NULL,
  anio_4_percent numeric(6,3) NULL,
  anio_5_percent numeric(6,3) NULL,
  anio_6_percent numeric(6,3) NULL,
  anio_7_percent numeric(6,3) NULL,
  anio_8_percent numeric(6,3) NULL,
  anio_9_percent numeric(6,3) NULL,
  anio_10_percent numeric(6,3) NULL,
  anio_11_plus_percent numeric(6,3) NULL,
  puntos_multiplicador int NOT NULL DEFAULT 1,
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid NULL,
  product_type_id uuid NULL,
  -- Variant keys para matching de producto automático
  moneda_key text,
  duracion_anios_key int,
  condicion_sa_tipo_key text,
  sa_min_key numeric(18,2),
  sa_max_key numeric(18,2),
  condicion_edad_tipo_key text,
  edad_min_key int,
  edad_max_key int,
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_producto_parametros_variant_idx ON producto_parametros (
  nombre_comercial,
  moneda_key,
  duracion_anios_key,
  condicion_sa_tipo_key,
  sa_min_key,
  sa_max_key,
  condicion_edad_tipo_key,
  edad_min_key,
  edad_max_key
);

-- Tabla: clientes (clientes con pólizas)
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_code text NOT NULL UNIQUE DEFAULT generar_cliente_code(),
  primer_nombre text NOT NULL,
  segundo_nombre text NULL,
  primer_apellido text NOT NULL,
  segundo_apellido text NOT NULL,
  telefono_celular text NOT NULL,
  correo text NOT NULL,
  full_name_normalizado text NOT NULL DEFAULT '',
  asesor_id uuid NULL,
  fecha_nacimiento date NULL,
  activo boolean DEFAULT true,
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_email_apellidos ON clientes (lower(correo), primer_apellido, segundo_apellido);
CREATE INDEX IF NOT EXISTS idx_clientes_asesor_activo 
  ON clientes(asesor_id, activo) 
  WHERE asesor_id IS NOT NULL;

-- Tabla: polizas (pólizas de seguros)
CREATE TABLE IF NOT EXISTS polizas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  producto_parametro_id uuid NULL REFERENCES producto_parametros(id),
  numero_poliza text NOT NULL,
  estatus estatus_poliza NOT NULL DEFAULT 'EN_VIGOR',
  fecha_emision date NOT NULL,
  fecha_renovacion date NULL,
  fecha_alta_sistema timestamptz NOT NULL DEFAULT now(),
  fecha_limite_pago date NULL,
  forma_pago forma_pago NOT NULL,
  periodicidad_pago periodicidad_pago NULL,
  tipo_pago text NULL,
  dia_pago smallint NULL CHECK (dia_pago >= 1 AND dia_pago <= 31),
  meses_check jsonb NOT NULL DEFAULT '{}'::jsonb,
  prima_input numeric(14,2) NOT NULL,
  prima_moneda moneda_poliza NOT NULL,
  prima_mxn numeric(14,2) NOT NULL DEFAULT 0,
  sa_input numeric(18,2) NULL,
  sa_moneda moneda_poliza NULL,
  sa_mxn numeric(18,2) NULL,
  clasificacion_actual tipo_clasificacion_puntos NULL,
  puntos_actuales numeric(10,2) NULL,
  anulada_at timestamptz NULL,
  creado_por uuid NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_polizas_numero UNIQUE (numero_poliza)
);

CREATE INDEX IF NOT EXISTS idx_polizas_cliente_estado ON polizas(cliente_id, estatus);
CREATE INDEX IF NOT EXISTS idx_polizas_producto ON polizas(producto_parametro_id);
CREATE INDEX IF NOT EXISTS polizas_fecha_renovacion_idx ON polizas(fecha_renovacion);
CREATE INDEX IF NOT EXISTS idx_polizas_periodicidad_pago ON polizas(periodicidad_pago);
CREATE INDEX IF NOT EXISTS idx_polizas_fecha_limite_pago 
  ON polizas(fecha_limite_pago) 
  WHERE fecha_limite_pago IS NOT NULL;

-- Tabla: poliza_puntos_cache (cache de cálculo de puntos y comisiones)
CREATE TABLE IF NOT EXISTS poliza_puntos_cache (
  poliza_id uuid PRIMARY KEY REFERENCES polizas(id) ON DELETE CASCADE,
  puntos_total numeric(10,2) NOT NULL,
  clasificacion tipo_clasificacion_puntos NOT NULL,
  base_factor numeric(10,4) NULL,
  producto_factor numeric(10,4) NULL,
  year_factor int NULL,
  prima_anual_snapshot numeric(14,2) NULL,
  producto_parametro_id uuid NULL REFERENCES producto_parametros(id),
  udi_valor numeric(12,6) NULL,
  usd_fx numeric(12,6) NULL,
  breakdown jsonb NULL,
  recalculo_reason text NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poliza_puntos_cache_poliza_base 
  ON poliza_puntos_cache(poliza_id, base_factor)
  WHERE base_factor IS NOT NULL;

-- Tablas de historial y aprobaciones
CREATE TABLE IF NOT EXISTS cliente_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cambio_tipo tipo_cambio_cliente NOT NULL,
  payload_old jsonb NULL,
  payload_new jsonb NULL,
  actor_id uuid NULL,
  creado_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cliente_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  solicitante_id uuid NULL,
  payload_propuesto jsonb NOT NULL,
  estado estado_solicitud_cambio NOT NULL,
  motivo_rechazo text NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  resuelto_at timestamptz NULL,
  resuelto_por uuid NULL
);

CREATE TABLE IF NOT EXISTS historial_costos_poliza (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id uuid NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  prima_anual_old numeric(14,2) NULL,
  prima_anual_new numeric(14,2) NULL,
  porcentaje_comision_old numeric(10,4) NULL,
  porcentaje_comision_new numeric(10,4) NULL,
  actor_id uuid NULL,
  creado_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poliza_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poliza_id uuid NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL,
  payload_propuesto jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE',
  motivo_rechazo text NULL,
  creado_at timestamptz NOT NULL DEFAULT now(),
  resuelto_at timestamptz NULL,
  resuelto_por uuid NULL
);

-- Tabla: agente_meta (objetivos de KPI por agente)
CREATE TABLE IF NOT EXISTS agente_meta (
  usuario_id integer PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha_conexion_text text,
  objetivo integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agente_meta_objetivo ON agente_meta(objetivo);

-- =============================================================================
-- 6. TABLAS DE REFERENCIA: UDI, FX, CALENDARIO
-- =============================================================================

CREATE TABLE IF NOT EXISTS udi_values (
  fecha date PRIMARY KEY,
  valor numeric(12,6) NOT NULL,
  source text NULL,
  fetched_at timestamptz NULL,
  stale boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS fx_values (
  fecha date PRIMARY KEY,
  valor numeric(12,6) NOT NULL,
  source text NULL,
  fetched_at timestamptz NULL,
  stale boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE fx_values IS 'Tipo de cambio USD/MXN del día (PK = fecha)';

CREATE TABLE IF NOT EXISTS dias_mes (
  id bigserial PRIMARY KEY,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio int NULL,
  max_dias smallint NOT NULL CHECK (max_dias BETWEEN 28 AND 31),
  es_bisiesto boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dias_mes_mes_anio_notnull ON dias_mes(mes, anio) WHERE anio IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_dias_mes_mes_anio_null ON dias_mes(mes) WHERE anio IS NULL;

-- =============================================================================
-- 7. TABLAS FASE 2: PROSPECTOS Y PLANIFICACIÓN
-- =============================================================================

CREATE TABLE IF NOT EXISTS prospectos (
  id bigserial PRIMARY KEY,
  agente_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  anio smallint NOT NULL,
  semana_iso smallint NOT NULL,
  nombre text NOT NULL,
  telefono text,
  email text,
  notas text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','seguimiento','con_cita','descartado')),
  fecha_cita timestamptz,
  origen text,
  first_visit_at timestamptz,
  cita_creada boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_prospectos_agente_semana ON prospectos(agente_id, anio, semana_iso);
CREATE INDEX IF NOT EXISTS idx_prospectos_estado ON prospectos(estado);

CREATE TABLE IF NOT EXISTS prospectos_historial (
  id bigserial PRIMARY KEY,
  prospecto_id bigint NOT NULL REFERENCES prospectos(id) ON DELETE CASCADE,
  estado_anterior text,
  estado_nuevo text,
  cambio_descripcion text,
  changed_by bigint REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospectos_historial_prospecto ON prospectos_historial(prospecto_id);

CREATE TABLE IF NOT EXISTS planificaciones (
  id bigserial PRIMARY KEY,
  agente_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  anio smallint NOT NULL,
  semana_iso smallint NOT NULL,
  prima_anual_promedio numeric(12,2) NOT NULL DEFAULT 30000,
  porcentaje_comision numeric(5,2) NOT NULL DEFAULT 35,
  bloques jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz,
  CONSTRAINT planif_unica_agente_semana UNIQUE(agente_id, anio, semana_iso)
);

CREATE INDEX IF NOT EXISTS idx_planif_agente_semana ON planificaciones(agente_id, anio, semana_iso);

-- =============================================================================
-- 8. TABLAS FASE 4: AGENDA Y CITAS
-- =============================================================================

CREATE TABLE IF NOT EXISTS tokens_integracion (
    id bigserial PRIMARY KEY,
    usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    proveedor text NOT NULL CHECK (proveedor IN ('google', 'microsoft', 'zoom', 'teams')),
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamptz,
    scopes text[],
    created_at timestamptz DEFAULT timezone('utc', now()),
    updated_at timestamptz DEFAULT timezone('utc', now()),
    CONSTRAINT tokens_integracion_usuario_proveedor UNIQUE (usuario_id, proveedor)
);

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

-- =============================================================================
-- 9. TABLAS FASE 5: CAMPAÑAS Y SEGMENTOS
-- =============================================================================

CREATE TABLE IF NOT EXISTS segments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    description text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS user_segments (
    usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    assigned_by bigint REFERENCES usuarios(id),
    assigned_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (usuario_id, segment_id)
);

CREATE TABLE IF NOT EXISTS product_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    summary text,
    description text,
    status campaign_status NOT NULL DEFAULT 'draft',
    active_range daterange NOT NULL,
    primary_segment_id uuid REFERENCES segments(id),
    notes text,
    created_by bigint REFERENCES usuarios(id),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS campaign_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    scope text NOT NULL CHECK (scope IN ('eligibility', 'goal')),
    rule_kind text NOT NULL,
    config jsonb NOT NULL,
    priority integer NOT NULL DEFAULT 0,
    logical_group text,
    description text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS campaign_rules_campaign_scope_idx
    ON campaign_rules (campaign_id, scope, priority);

CREATE TABLE IF NOT EXISTS campaign_rewards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    is_accumulative boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS campaign_rewards_campaign_idx
    ON campaign_rewards (campaign_id, sort_order);

CREATE TABLE IF NOT EXISTS campaign_segments (
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    segment_id uuid NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    sort_order integer NOT NULL DEFAULT 0,
    PRIMARY KEY (campaign_id, segment_id)
);

CREATE TABLE IF NOT EXISTS campaign_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    eligible boolean NOT NULL DEFAULT false,
    progress numeric(6,3) NOT NULL DEFAULT 0,
    status campaign_progress_status NOT NULL DEFAULT 'not_eligible',
    metrics jsonb,
    evaluated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT campaign_progress_progress_range CHECK (progress >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_progress_unique_idx
    ON campaign_progress (campaign_id, usuario_id);

-- Tabla de métricas custom para campañas
CREATE TABLE IF NOT EXISTS campaign_custom_metrics (
    id bigserial PRIMARY KEY,
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    metric_key text NOT NULL,
    metric_value numeric(18,4) NOT NULL,
    evaluated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_campaign_custom_metrics UNIQUE (campaign_id, usuario_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_campaign_custom_metrics_campaign
    ON campaign_custom_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_custom_metrics_usuario
    ON campaign_custom_metrics(usuario_id);

-- Cache de datasets de campaña
CREATE TABLE IF NOT EXISTS campaign_cache (
    id bigserial PRIMARY KEY,
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    dataset_key text NOT NULL,
    dataset_value jsonb NOT NULL,
    computed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_campaign_cache UNIQUE (campaign_id, dataset_key)
);

CREATE INDEX IF NOT EXISTS idx_campaign_cache_campaign ON campaign_cache(campaign_id);

-- =============================================================================
-- 10. TABLAS FASE 6: PAGOS Y COMISIONES
-- =============================================================================

CREATE TABLE IF NOT EXISTS poliza_pagos_mensuales (
  id bigserial PRIMARY KEY,
  poliza_id uuid NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  periodo_mes date NOT NULL,
  fecha_programada date NOT NULL,
  fecha_limite date NOT NULL,
  monto_programado numeric(14,2) NOT NULL CHECK (monto_programado >= 0),
  monto_pagado numeric(14,2) CHECK (monto_pagado >= 0),
  fecha_pago_real timestamptz,
  estado poliza_pago_estado NOT NULL DEFAULT 'pendiente',
  notas text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_poliza_periodo UNIQUE(poliza_id, periodo_mes),
  CONSTRAINT ck_fecha_pago_con_monto CHECK (
    (fecha_pago_real IS NULL AND monto_pagado IS NULL) OR 
    (fecha_pago_real IS NOT NULL AND monto_pagado IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_poliza_pagos_poliza_id ON poliza_pagos_mensuales(poliza_id);
CREATE INDEX IF NOT EXISTS idx_poliza_pagos_estado ON poliza_pagos_mensuales(estado);
CREATE INDEX IF NOT EXISTS idx_poliza_pagos_fecha_limite ON poliza_pagos_mensuales(fecha_limite);
CREATE INDEX IF NOT EXISTS idx_poliza_pagos_periodo_mes ON poliza_pagos_mensuales(periodo_mes);
CREATE INDEX IF NOT EXISTS idx_poliza_pagos_alertas 
  ON poliza_pagos_mensuales(estado, fecha_limite) 
  WHERE estado = 'pendiente';

COMMENT ON TABLE poliza_pagos_mensuales IS 'Registro de pagos programados y realizados por póliza y periodo';
COMMENT ON COLUMN poliza_pagos_mensuales.periodo_mes IS 'Primer día del mes al que corresponde el pago';
COMMENT ON COLUMN poliza_pagos_mensuales.monto_programado IS 'Monto esperado según prima anual / periodicidad';

-- Tabla de notificaciones in-app
CREATE TABLE IF NOT EXISTS notificaciones (
  id bigserial PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo varchar(50) NOT NULL CHECK (tipo IN ('pago_vencido', 'pago_proximo', 'comision_disponible', 'sistema')),
  titulo varchar(255) NOT NULL,
  mensaje text NOT NULL,
  leida boolean DEFAULT FALSE,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  leida_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida 
  ON notificaciones(usuario_id, leida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo 
  ON notificaciones(tipo);
CREATE INDEX IF NOT EXISTS idx_notificaciones_created 
  ON notificaciones(created_at DESC);

COMMENT ON TABLE notificaciones IS 'Notificaciones in-app para usuarios (alertas de pagos, comisiones, sistema)';
COMMENT ON COLUMN notificaciones.tipo IS 'pago_vencido | pago_proximo | comision_disponible | sistema';
COMMENT ON COLUMN notificaciones.metadata IS 'Datos extras en JSON: {poliza_id, pago_id, monto, etc.}';

-- =============================================================================
-- 11. TRIGGERS DE UPDATED_AT Y OPERACIONALES
-- =============================================================================

-- usuarios
CREATE TRIGGER trg_usuarios_set_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- candidatos
CREATE TRIGGER trg_candidatos_set_updated_at
  BEFORE UPDATE ON candidatos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- clientes
CREATE TRIGGER trg_clientes_set_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- polizas
CREATE TRIGGER trg_polizas_set_updated_at
  BEFORE UPDATE ON polizas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- poliza_puntos_cache
CREATE TRIGGER trg_poliza_puntos_cache_set_updated_at
  BEFORE UPDATE ON poliza_puntos_cache
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- producto_parametros
CREATE TRIGGER trg_producto_parametros_set_updated_at
  BEFORE UPDATE ON producto_parametros
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- planificaciones
CREATE TRIGGER trg_planificaciones_set_updated_at
  BEFORE UPDATE ON planificaciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- prospectos
CREATE TRIGGER trg_prospectos_set_updated_at
  BEFORE UPDATE ON prospectos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- segments
CREATE TRIGGER trg_segments_set_updated_at
  BEFORE UPDATE ON segments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- product_types
CREATE TRIGGER trg_product_types_set_updated_at
  BEFORE UPDATE ON product_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- campaigns
CREATE TRIGGER trg_campaigns_set_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- campaign_rules
CREATE TRIGGER trg_campaign_rules_set_updated_at
  BEFORE UPDATE ON campaign_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- campaign_rewards
CREATE TRIGGER trg_campaign_rewards_set_updated_at
  BEFORE UPDATE ON campaign_rewards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- campaign_progress
CREATE TRIGGER trg_campaign_progress_set_updated_at
  BEFORE UPDATE ON campaign_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- poliza_pagos_mensuales
CREATE TRIGGER trg_poliza_pagos_set_updated_at
  BEFORE UPDATE ON poliza_pagos_mensuales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- notificaciones
CREATE TRIGGER trg_notificaciones_set_updated_at
  BEFORE UPDATE ON notificaciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 12. FUNCIONES DE NEGOCIO: PRODUCTO_PARAMETROS VARIANT KEYS
-- =============================================================================

CREATE OR REPLACE FUNCTION producto_parametros_set_keys() 
RETURNS trigger 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.moneda_key := COALESCE(NEW.moneda::text, '');
  NEW.duracion_anios_key := COALESCE(NEW.duracion_anios, -1);
  NEW.condicion_sa_tipo_key := COALESCE(NEW.condicion_sa_tipo, '');
  NEW.sa_min_key := COALESCE(NEW.sa_min, (-1)::numeric);
  NEW.sa_max_key := COALESCE(NEW.sa_max, (-1)::numeric);
  NEW.condicion_edad_tipo_key := COALESCE(NEW.condicion_edad_tipo, '');
  NEW.edad_min_key := COALESCE(NEW.edad_min, -1);
  NEW.edad_max_key := COALESCE(NEW.edad_max, -1);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_producto_parametros_set_keys
  BEFORE INSERT OR UPDATE ON producto_parametros
  FOR EACH ROW EXECUTE FUNCTION producto_parametros_set_keys();

-- =============================================================================
-- 13. FUNCIONES DE NEGOCIO: UDI/FX Y NORMALIZACIÓN DE PRIMA
-- =============================================================================

CREATE OR REPLACE FUNCTION get_current_udi(p_fecha date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric;
BEGIN
  SELECT valor INTO v
  FROM udi_values
  WHERE fecha <= COALESCE(p_fecha, CURRENT_DATE)
  ORDER BY fecha DESC
  LIMIT 1;

  IF v IS NULL THEN
    SELECT valor INTO v FROM udi_values ORDER BY fecha DESC LIMIT 1;
  END IF;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION get_fx_usd(p_fecha date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric;
BEGIN
  SELECT valor INTO v
  FROM fx_values
  WHERE fecha <= COALESCE(p_fecha, CURRENT_DATE)
  ORDER BY fecha DESC
  LIMIT 1;

  IF v IS NULL THEN
    SELECT valor INTO v FROM fx_values ORDER BY fecha DESC LIMIT 1;
  END IF;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION normalize_prima(p_monto numeric, p_moneda moneda_poliza, p_fecha date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v numeric;
BEGIN
  IF p_monto IS NULL OR p_moneda IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_moneda = 'MXN'::moneda_poliza THEN
    RETURN round(p_monto, 2);
  ELSIF p_moneda = 'USD'::moneda_poliza THEN
    SELECT get_fx_usd(COALESCE(p_fecha, CURRENT_DATE)) INTO v;
    IF v IS NULL THEN RETURN NULL; END IF;
    RETURN round(p_monto * v, 2);
  ELSIF p_moneda = 'UDI'::moneda_poliza THEN
    SELECT get_current_udi(COALESCE(p_fecha, CURRENT_DATE)) INTO v;
    IF v IS NULL THEN RETURN NULL; END IF;
    RETURN round(p_monto * v, 2);
  ELSE
    RETURN round(p_monto, 2);
  END IF;
END;
$$;

-- =============================================================================
-- 14. FUNCIONES DE NEGOCIO: NORMALIZACIÓN AUTOMÁTICA EN POLIZAS
-- =============================================================================

CREATE OR REPLACE FUNCTION polizas_normalize_amounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prima_mxn numeric;
  v_sa_mxn numeric;
BEGIN
  v_prima_mxn := normalize_prima(NEW.prima_input, NEW.prima_moneda, NEW.fecha_emision);

  IF TG_OP = 'UPDATE' THEN
    NEW.prima_mxn := COALESCE(v_prima_mxn,
                               OLD.prima_mxn,
                               CASE WHEN NEW.prima_moneda = 'MXN'::moneda_poliza THEN round(NEW.prima_input, 2) END,
                               0);
  ELSE
    NEW.prima_mxn := COALESCE(v_prima_mxn,
                               CASE WHEN NEW.prima_moneda = 'MXN'::moneda_poliza THEN round(NEW.prima_input, 2) END,
                               0);
  END IF;

  IF NEW.sa_input IS NOT NULL AND NEW.sa_moneda IS NOT NULL THEN
    v_sa_mxn := normalize_prima(NEW.sa_input, NEW.sa_moneda, NEW.fecha_emision);
    NEW.sa_mxn := v_sa_mxn;
  ELSE
    NEW.sa_mxn := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_polizas_normalize_amounts
  BEFORE INSERT OR UPDATE OF prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision
  ON polizas
  FOR EACH ROW EXECUTE FUNCTION polizas_normalize_amounts();

-- Enforce moneda alignment con producto
CREATE OR REPLACE FUNCTION polizas_before_insupd_enforce_moneda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moneda moneda_poliza;
BEGIN
  IF NEW.producto_parametro_id IS NOT NULL THEN
    SELECT moneda INTO v_moneda FROM producto_parametros WHERE id = NEW.producto_parametro_id;
    IF v_moneda IS NOT NULL THEN
      NEW.prima_moneda := v_moneda;
      NEW.sa_moneda := v_moneda;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_polizas_before_insupd_enforce_moneda
  BEFORE INSERT OR UPDATE ON polizas
  FOR EACH ROW EXECUTE FUNCTION polizas_before_insupd_enforce_moneda();

-- =============================================================================
-- 15. FUNCIONES DE NEGOCIO: CÁLCULO DE PUNTOS Y COMISIONES
-- =============================================================================

CREATE OR REPLACE FUNCTION poliza_year_vigencia(p_fecha_emision date)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN GREATEST(
    1,
    (EXTRACT(YEAR FROM age(CURRENT_DATE, p_fecha_emision))::int + 1)
  );
END;
$$;

CREATE OR REPLACE FUNCTION recalc_puntos_poliza(p_poliza_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prima_input numeric;
  v_prima_mxn numeric;
  v_prima_moneda moneda_poliza;
  v_sa_mxn numeric;
  v_sa_input numeric;
  v_sa_moneda moneda_poliza;
  v_tipo tipo_producto;
  v_estatus estatus_poliza;
  v_pp_id uuid;
  v_year int;
  v_base_factor numeric;
  v_puntos numeric;
  v_clas tipo_clasificacion_puntos;
  v_fx numeric;
  v_udi numeric;
  v_fecha date;
  v_pp_auto uuid;
  v_sa_mxn_live numeric;
BEGIN
  SELECT p.prima_input, p.prima_mxn, p.prima_moneda, p.sa_mxn, p.sa_input, p.sa_moneda,
         p.estatus, p.producto_parametro_id, p.fecha_emision
    INTO v_prima_input, v_prima_mxn, v_prima_moneda, v_sa_mxn, v_sa_input, v_sa_moneda,
         v_estatus, v_pp_id, v_fecha
  FROM polizas p
  WHERE p.id = p_poliza_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'poliza % no existe', p_poliza_id;
  END IF;

  v_prima_mxn := normalize_prima(v_prima_input, v_prima_moneda, CURRENT_DATE);

  v_fx := NULL; v_udi := NULL;
  IF v_prima_moneda = 'USD'::moneda_poliza THEN
    SELECT get_fx_usd(CURRENT_DATE) INTO v_fx;
  ELSIF v_prima_moneda = 'UDI'::moneda_poliza THEN
    SELECT get_current_udi(CURRENT_DATE) INTO v_udi;
  END IF;

  IF v_sa_input IS NOT NULL AND v_sa_moneda IS NOT NULL THEN
    v_sa_mxn_live := normalize_prima(v_sa_input, v_sa_moneda, CURRENT_DATE);
  ELSE
    v_sa_mxn_live := NULL;
  END IF;

  -- Auto-match producto si no está asignado
  IF v_pp_id IS NULL THEN
    SELECT pp.id
      INTO v_pp_auto
    FROM producto_parametros pp
    WHERE pp.activo = true
      AND (pp.moneda IS NULL OR pp.moneda = v_prima_moneda)
      AND (
        v_sa_mxn_live IS NULL
        OR (
          (pp.sa_min IS NULL OR v_sa_mxn_live >= pp.sa_min)
          AND (pp.sa_max IS NULL OR v_sa_mxn_live <= pp.sa_max)
        )
      )
    ORDER BY 
      CASE WHEN pp.moneda = v_prima_moneda THEN 0 ELSE 1 END,
      COALESCE(pp.sa_min, (-1)::numeric) DESC
    LIMIT 1;

    IF v_pp_auto IS NOT NULL THEN
      v_pp_id := v_pp_auto;
      UPDATE polizas SET producto_parametro_id = v_pp_auto, updated_at = now()
      WHERE id = p_poliza_id;
    END IF;
  END IF;

  IF v_estatus = 'ANULADA'::estatus_poliza THEN
    v_puntos := 0;
    v_clas := 'CERO';
  ELSE
    IF v_pp_id IS NOT NULL THEN
      SELECT tipo_producto INTO v_tipo FROM producto_parametros WHERE id = v_pp_id;
    ELSE
      v_tipo := NULL;
    END IF;

    IF v_tipo = 'GMM'::tipo_producto THEN
      IF v_prima_mxn IS NOT NULL AND v_prima_mxn >= 7500 THEN
        v_puntos := 0.5; v_clas := 'MEDIO';
      ELSE
        v_puntos := 0; v_clas := 'CERO';
      END IF;
    ELSIF v_tipo = 'VI'::tipo_producto THEN
      IF v_prima_mxn IS NULL OR v_prima_mxn < 15000 THEN
        v_puntos := 0; v_clas := 'CERO';
      ELSIF v_prima_mxn >= 150000 THEN
        v_puntos := 3; v_clas := 'TRIPLE';
      ELSIF v_prima_mxn >= 50000 THEN
        v_puntos := 2; v_clas := 'DOBLE';
      ELSE
        v_puntos := 1; v_clas := 'SIMPLE';
      END IF;
    ELSE
      v_puntos := 0; v_clas := 'CERO';
    END IF;
  END IF;

  SELECT poliza_year_vigencia(p.fecha_emision) INTO v_year
  FROM polizas p WHERE p.id = p_poliza_id;

  IF v_pp_id IS NOT NULL AND v_estatus = 'EN_VIGOR'::estatus_poliza THEN
    SELECT CASE
             WHEN COALESCE(duracion_anios, 9999) <= 10 THEN
               CASE LEAST(v_year, COALESCE(duracion_anios, 10))
                 WHEN 1 THEN anio_1_percent
                 WHEN 2 THEN anio_2_percent
                 WHEN 3 THEN anio_3_percent
                 WHEN 4 THEN anio_4_percent
                 WHEN 5 THEN anio_5_percent
                 WHEN 6 THEN anio_6_percent
                 WHEN 7 THEN anio_7_percent
                 WHEN 8 THEN anio_8_percent
                 WHEN 9 THEN anio_9_percent
                 WHEN 10 THEN anio_10_percent
                 ELSE NULL
               END
             ELSE
               CASE
                 WHEN v_year = 1 THEN anio_1_percent
                 WHEN v_year = 2 THEN anio_2_percent
                 WHEN v_year = 3 THEN anio_3_percent
                 WHEN v_year = 4 THEN anio_4_percent
                 WHEN v_year = 5 THEN anio_5_percent
                 WHEN v_year = 6 THEN anio_6_percent
                 WHEN v_year = 7 THEN anio_7_percent
                 WHEN v_year = 8 THEN anio_8_percent
                 WHEN v_year = 9 THEN anio_9_percent
                 WHEN v_year = 10 THEN anio_10_percent
                 ELSE anio_11_plus_percent
               END
           END
      INTO v_base_factor
    FROM producto_parametros
    WHERE id = v_pp_id;
  ELSE
    v_base_factor := NULL;
  END IF;

  v_puntos := COALESCE(v_puntos, 0);
  v_clas := COALESCE(v_clas, 'CERO');

  INSERT INTO poliza_puntos_cache (
    poliza_id, puntos_total, clasificacion, base_factor, producto_factor,
    year_factor, prima_anual_snapshot, producto_parametro_id, udi_valor, usd_fx,
    breakdown, recalculo_reason, computed_at, updated_at
  )
  SELECT p.id, v_puntos, v_clas, v_base_factor, NULL,
         v_year, v_prima_mxn, v_pp_id, v_udi, v_fx,
         jsonb_build_object(
           'year', v_year,
           'factor_base', v_base_factor,
           'producto', v_tipo,
           'prima_mxn', v_prima_mxn,
           'sa_mxn', v_sa_mxn_live,
           'prima_moneda', v_prima_moneda,
           'fx_aplicado', v_fx,
           'udi_aplicada', v_udi,
           'tasas_fecha', to_char(CURRENT_DATE, 'YYYY-MM-DD')
         ),
         'recalc', now(), now()
  FROM polizas p WHERE p.id = p_poliza_id
  ON CONFLICT (poliza_id) DO UPDATE SET
    puntos_total = EXCLUDED.puntos_total,
    clasificacion = EXCLUDED.clasificacion,
    base_factor = EXCLUDED.base_factor,
    producto_factor = EXCLUDED.producto_factor,
    year_factor = EXCLUDED.year_factor,
    prima_anual_snapshot = EXCLUDED.prima_anual_snapshot,
    producto_parametro_id = EXCLUDED.producto_parametro_id,
    udi_valor = EXCLUDED.udi_valor,
    usd_fx = EXCLUDED.usd_fx,
    breakdown = EXCLUDED.breakdown,
    recalculo_reason = EXCLUDED.recalculo_reason,
    updated_at = now();

  UPDATE polizas
  SET clasificacion_actual = v_clas,
      puntos_actuales = v_puntos,
      updated_at = now()
  WHERE id = p_poliza_id;
END;
$$;

CREATE OR REPLACE FUNCTION recalc_puntos_poliza_all(p_limit int DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r RECORD;
BEGIN
  FOR r IN 
    SELECT id FROM polizas
    ORDER BY updated_at DESC
    LIMIT COALESCE(p_limit, 2147483647)
  LOOP
    PERFORM recalc_puntos_poliza(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Triggers para recalcular automáticamente
CREATE OR REPLACE FUNCTION polizas_after_change_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM recalc_puntos_poliza(NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_polizas_after_insert_recalc
  AFTER INSERT ON polizas
  FOR EACH ROW EXECUTE FUNCTION polizas_after_change_recalc();

CREATE TRIGGER trg_polizas_after_update_recalc
  AFTER UPDATE OF prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision, estatus, producto_parametro_id ON polizas
  FOR EACH ROW EXECUTE FUNCTION polizas_after_change_recalc();

-- Recalc cuando cambien parámetros de producto
CREATE OR REPLACE FUNCTION recalc_polizas_by_producto_parametro(p_pp_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM polizas WHERE producto_parametro_id = p_pp_id LOOP
    PERFORM recalc_puntos_poliza(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION producto_parametros_after_update_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.anio_1_percent IS DISTINCT FROM OLD.anio_1_percent) OR
     (NEW.anio_2_percent IS DISTINCT FROM OLD.anio_2_percent) OR
     (NEW.anio_3_percent IS DISTINCT FROM OLD.anio_3_percent) OR
     (NEW.anio_4_percent IS DISTINCT FROM OLD.anio_4_percent) OR
     (NEW.anio_5_percent IS DISTINCT FROM OLD.anio_5_percent) OR
     (NEW.anio_6_percent IS DISTINCT FROM OLD.anio_6_percent) OR
     (NEW.anio_7_percent IS DISTINCT FROM OLD.anio_7_percent) OR
     (NEW.anio_8_percent IS DISTINCT FROM OLD.anio_8_percent) OR
     (NEW.anio_9_percent IS DISTINCT FROM OLD.anio_9_percent) OR
     (NEW.anio_10_percent IS DISTINCT FROM OLD.anio_10_percent) OR
     (NEW.anio_11_plus_percent IS DISTINCT FROM OLD.anio_11_plus_percent) OR
     (NEW.duracion_anios IS DISTINCT FROM OLD.duracion_anios) OR
     (NEW.tipo_producto IS DISTINCT FROM OLD.tipo_producto) OR
     (NEW.activo IS DISTINCT FROM OLD.activo) THEN
    PERFORM recalc_polizas_by_producto_parametro(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_producto_parametros_after_update_recalc
  AFTER UPDATE ON producto_parametros
  FOR EACH ROW EXECUTE FUNCTION producto_parametros_after_update_recalc();

CREATE OR REPLACE FUNCTION producto_parametros_after_update_sync_moneda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.moneda IS DISTINCT FROM OLD.moneda AND NEW.moneda IS NOT NULL THEN
    UPDATE polizas
      SET prima_moneda = NEW.moneda,
          sa_moneda = NEW.moneda,
          updated_at = now()
      WHERE producto_parametro_id = NEW.id
        AND (
          prima_moneda IS DISTINCT FROM NEW.moneda
          OR sa_moneda IS DISTINCT FROM NEW.moneda
          OR sa_moneda IS NULL
        );
    PERFORM recalc_polizas_by_producto_parametro(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_producto_parametros_after_update_sync_moneda
  AFTER UPDATE ON producto_parametros
  FOR EACH ROW EXECUTE FUNCTION producto_parametros_after_update_sync_moneda();

-- =============================================================================
-- 16. FUNCIONES DE WORKFLOW: CLIENTE CHANGES
-- =============================================================================

CREATE OR REPLACE FUNCTION submit_cliente_update(p_cliente_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload inválido';
  END IF;

  INSERT INTO cliente_update_requests (
    id, cliente_id, solicitante_id, payload_propuesto, estado, creado_at
  ) VALUES (
    gen_random_uuid(), p_cliente_id, auth.uid(), p_payload, 'PENDIENTE', now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION apply_cliente_update(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_payload jsonb;
  r_old clientes%ROWTYPE;
  r_new clientes%ROWTYPE;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor)';
  END IF;

  SELECT cliente_id, payload_propuesto
    INTO v_cliente_id, v_payload
  FROM cliente_update_requests
  WHERE id = p_request_id AND estado = 'PENDIENTE';

  IF v_cliente_id IS NULL THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;

  SELECT * INTO r_old FROM clientes WHERE id = v_cliente_id FOR UPDATE;

  UPDATE clientes SET
    primer_nombre      = COALESCE(UPPER(TRIM(v_payload->>'primer_nombre')), primer_nombre),
    segundo_nombre     = COALESCE(UPPER(TRIM(v_payload->>'segundo_nombre')), segundo_nombre),
    primer_apellido    = COALESCE(UPPER(TRIM(v_payload->>'primer_apellido')), primer_apellido),
    segundo_apellido   = COALESCE(UPPER(TRIM(v_payload->>'segundo_apellido')), segundo_apellido),
    telefono_celular   = COALESCE(TRIM(v_payload->>'telefono_celular'), telefono_celular),
    correo             = COALESCE(LOWER(TRIM(v_payload->>'correo')), correo),
    full_name_normalizado = UPPER(TRIM(
      COALESCE(v_payload->>'primer_nombre', primer_nombre) || ' ' ||
      COALESCE(v_payload->>'segundo_nombre', COALESCE(segundo_nombre,'')) || ' ' ||
      COALESCE(v_payload->>'primer_apellido', primer_apellido) || ' ' ||
      COALESCE(v_payload->>'segundo_apellido', segundo_apellido)
    )),
    updated_at = now()
  WHERE id = v_cliente_id;

  SELECT * INTO r_new FROM clientes WHERE id = v_cliente_id;

  INSERT INTO cliente_historial (
    id, cliente_id, cambio_tipo, payload_old, payload_new, actor_id, creado_at
  ) VALUES (
    gen_random_uuid(), v_cliente_id, 'APROBACION', to_jsonb(r_old), to_jsonb(r_new), auth.uid(), now()
  );

  UPDATE cliente_update_requests
  SET estado = 'APROBADA', resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION reject_cliente_update(p_request_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor)';
  END IF;

  UPDATE cliente_update_requests
  SET estado = 'RECHAZADA', motivo_rechazo = COALESCE(p_motivo,''), resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id AND estado = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;
END;
$$;

-- =============================================================================
-- 17. FUNCIONES DE WORKFLOW: POLIZA CHANGES
-- =============================================================================

CREATE OR REPLACE FUNCTION submit_poliza_update(p_poliza_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload inválido';
  END IF;

  INSERT INTO poliza_update_requests (
    id, poliza_id, solicitante_id, payload_propuesto, estado, creado_at
  ) VALUES (
    gen_random_uuid(), p_poliza_id, auth.uid(), p_payload, 'PENDIENTE', now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION apply_poliza_update(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poliza_id uuid;
  v_payload jsonb;
  v_estado text;
  r_old polizas%ROWTYPE;
  r_new polizas%ROWTYPE;
  v_old_prima numeric(14,2);
  v_new_prima numeric(14,2);
  v_periodicidad_raw text;
  v_periodicidad_txt periodicidad_pago;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor)';
  END IF;

  SELECT poliza_id, payload_propuesto, estado
    INTO v_poliza_id, v_payload, v_estado
  FROM poliza_update_requests
  WHERE id = p_request_id;

  IF v_poliza_id IS NULL THEN
    RAISE EXCEPTION 'solicitud no encontrada';
  END IF;
  IF v_estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'solicitud no pendiente (estado=%)', v_estado;
  END IF;

  SELECT * INTO r_old FROM polizas WHERE id = v_poliza_id FOR UPDATE;

  v_periodicidad_raw := NULLIF(v_payload->>'periodicidad_pago','');
  IF v_periodicidad_raw IS NOT NULL THEN
    v_periodicidad_raw := upper(trim(v_periodicidad_raw));
    IF v_periodicidad_raw IN ('MENSUAL','M','MES') THEN 
      v_periodicidad_txt := 'mensual';
    ELSIF v_periodicidad_raw IN ('TRIMESTRAL','T','TRIMESTRE') THEN 
      v_periodicidad_txt := 'trimestral';
    ELSIF v_periodicidad_raw IN ('SEMESTRAL','S','SEMESTRA') THEN 
      v_periodicidad_txt := 'semestral';
    ELSIF v_periodicidad_raw IN ('ANUAL','A','ANUALIDAD') THEN 
      v_periodicidad_txt := 'anual';
    ELSE 
      v_periodicidad_txt := NULL;
    END IF;
  ELSE
    v_periodicidad_txt := NULL;
  END IF;

  UPDATE polizas SET
    numero_poliza         = COALESCE(NULLIF(TRIM(v_payload->>'numero_poliza'),''), numero_poliza),
    estatus               = COALESCE(NULLIF(v_payload->>'estatus','')::estatus_poliza, estatus),
    fecha_emision         = COALESCE(NULLIF(v_payload->>'fecha_emision','')::date, fecha_emision),
    fecha_renovacion      = COALESCE(NULLIF(v_payload->>'fecha_renovacion','')::date, fecha_renovacion),
    forma_pago            = COALESCE(NULLIF(v_payload->>'forma_pago','')::forma_pago, forma_pago),
    periodicidad_pago     = COALESCE(v_periodicidad_txt, periodicidad_pago),
    dia_pago              = COALESCE(NULLIF(v_payload->>'dia_pago','')::int, dia_pago),
    prima_input           = COALESCE(NULLIF(v_payload->>'prima_input','')::numeric, prima_input),
    prima_moneda          = COALESCE(NULLIF(v_payload->>'prima_moneda','')::moneda_poliza, prima_moneda),
    sa_input              = COALESCE(NULLIF(v_payload->>'sa_input','')::numeric, sa_input),
    sa_moneda             = COALESCE(NULLIF(v_payload->>'sa_moneda','')::moneda_poliza, sa_moneda),
    producto_parametro_id = COALESCE(NULLIF(v_payload->>'producto_parametro_id','')::uuid, producto_parametro_id),
    meses_check           = COALESCE((CASE WHEN jsonb_typeof(v_payload->'meses_check')='object' THEN v_payload->'meses_check' END), meses_check),
    updated_at            = now()
  WHERE id = v_poliza_id;

  SELECT * INTO r_new FROM polizas WHERE id = v_poliza_id;

  v_old_prima := r_old.prima_input;
  v_new_prima := r_new.prima_input;
  IF v_old_prima IS DISTINCT FROM v_new_prima THEN
    INSERT INTO historial_costos_poliza(
      id, poliza_id, prima_anual_old, prima_anual_new, porcentaje_comision_old, porcentaje_comision_new, actor_id, creado_at
    ) VALUES (
      gen_random_uuid(), v_poliza_id, v_old_prima, v_new_prima, NULL, NULL, auth.uid(), now()
    );
  END IF;

  UPDATE poliza_update_requests
  SET estado='APROBADA', resuelto_at=now(), resuelto_por=auth.uid()
  WHERE id = p_request_id AND estado='PENDIENTE';

  PERFORM recalc_puntos_poliza(v_poliza_id);
END;
$$;

CREATE OR REPLACE FUNCTION reject_poliza_update(p_request_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor)';
  END IF;

  UPDATE poliza_update_requests
  SET estado = 'RECHAZADA', motivo_rechazo = COALESCE(p_motivo,''), resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id AND estado = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;
END;
$$;

-- =============================================================================
-- 18. FUNCIONES FASE 6: GENERACIÓN Y GESTIÓN DE PAGOS
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_generar_pagos_programados()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_divisor integer;
  v_monto_periodo numeric(14,2);
  v_meses_entre_pagos integer;
  v_fecha_primer_pago date;
  v_fecha_limite date;
  v_idx integer;
  v_offset interval;
  v_periodo date;
  v_fecha_prog timestamp;
  v_fecha_limite_calc date;
BEGIN
  IF NEW.periodicidad_pago IS NULL OR NEW.prima_mxn IS NULL OR NEW.prima_mxn <= 0 THEN
    RETURN NEW;
  END IF;

  CASE NEW.periodicidad_pago
    WHEN 'mensual' THEN
      v_divisor := 12;
      v_meses_entre_pagos := 1;
    WHEN 'trimestral' THEN
      v_divisor := 4;
      v_meses_entre_pagos := 3;
    WHEN 'semestral' THEN
      v_divisor := 2;
      v_meses_entre_pagos := 6;
    WHEN 'anual' THEN
      v_divisor := 1;
      v_meses_entre_pagos := 12;
    ELSE
      RETURN NEW;
  END CASE;

  v_monto_periodo := ROUND(NEW.prima_mxn / v_divisor, 2);

  v_fecha_primer_pago := DATE_TRUNC('month', NEW.fecha_emision)::date
    + INTERVAL '1 month' * (CASE WHEN NEW.dia_pago IS NOT NULL THEN NEW.dia_pago - 1 ELSE 0 END);

  v_fecha_limite := COALESCE(
    NEW.fecha_limite_pago,
    (DATE_TRUNC('month', v_fecha_primer_pago) + INTERVAL '1 month - 1 day')::date
  );

  DELETE FROM poliza_pagos_mensuales
  WHERE poliza_id = NEW.id
    AND estado = 'pendiente';

  FOR v_idx IN 0..(v_divisor - 1) LOOP
    v_offset := (v_idx * v_meses_entre_pagos || ' months')::interval;
    v_periodo := (DATE_TRUNC('month', v_fecha_primer_pago) + v_offset)::date;
    v_fecha_prog := v_fecha_primer_pago + v_offset;
    v_fecha_limite_calc := (v_fecha_limite + v_offset)::date;

    INSERT INTO poliza_pagos_mensuales (
      poliza_id,
      periodo_mes,
      fecha_programada,
      fecha_limite,
      monto_programado,
      estado,
      created_by
    ) VALUES (
      NEW.id,
      v_periodo,
      v_fecha_prog,
      v_fecha_limite_calc,
      v_monto_periodo,
      'pendiente',
      NEW.creado_por
    )
    ON CONFLICT (poliza_id, periodo_mes) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_polizas_generar_pagos
  AFTER INSERT OR UPDATE OF periodicidad_pago, fecha_limite_pago, prima_mxn, fecha_emision, dia_pago
  ON polizas
  FOR EACH ROW
  WHEN (NEW.periodicidad_pago IS NOT NULL)
  EXECUTE FUNCTION fn_generar_pagos_programados();

CREATE OR REPLACE FUNCTION fn_actualizar_pagos_vencidos()
RETURNS TABLE(updated_count bigint) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_count bigint;
BEGIN
  UPDATE poliza_pagos_mensuales
  SET estado = 'vencido', 
      updated_at = NOW()
  WHERE estado = 'pendiente' 
    AND fecha_limite < CURRENT_DATE;
  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN QUERY SELECT row_count;
END;
$$;

CREATE OR REPLACE FUNCTION trg_fill_pagado_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'pagado' THEN
    IF NEW.monto_pagado IS NULL THEN
      NEW.monto_pagado := COALESCE(NEW.monto_programado, 0);
    END IF;
    IF NEW.fecha_pago_real IS NULL THEN
      NEW.fecha_pago_real := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_poliza_pagos_fill_pagado
  BEFORE UPDATE ON poliza_pagos_mensuales
  FOR EACH ROW
  WHEN (OLD.estado IS DISTINCT FROM NEW.estado OR NEW.monto_pagado IS NULL OR NEW.fecha_pago_real IS NULL)
  EXECUTE FUNCTION trg_fill_pagado_fields();

-- =============================================================================
-- 19. FUNCIONES FASE 5: INVALIDACIÓN DE CACHE DE CAMPAÑAS
-- =============================================================================

CREATE OR REPLACE FUNCTION invalidate_campaign_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM campaign_cache WHERE campaign_id = COALESCE(NEW.campaign_id, OLD.campaign_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_campaigns_invalidate_cache
  AFTER INSERT OR UPDATE OR DELETE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_campaign_cache();

CREATE TRIGGER trg_campaign_rules_invalidate_cache
  AFTER INSERT OR UPDATE OR DELETE ON campaign_rules
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_campaign_cache();

CREATE OR REPLACE FUNCTION invalidate_all_campaigns_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM campaign_cache;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_polizas_invalidate_campaigns
  AFTER INSERT OR UPDATE ON polizas
  FOR EACH STATEMENT
  EXECUTE FUNCTION invalidate_all_campaigns_cache();

CREATE TRIGGER trg_planificaciones_invalidate_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON planificaciones
  FOR EACH STATEMENT
  EXECUTE FUNCTION invalidate_all_campaigns_cache();

-- =============================================================================
-- 20. VIEWS: VALORES ACTUALES Y UIS
-- =============================================================================

CREATE OR REPLACE VIEW polizas_valores_actuales AS
WITH latest_udi AS (
  SELECT valor AS udi_valor FROM udi_values ORDER BY fecha DESC LIMIT 1
), latest_fx AS (
  SELECT valor AS usd_fx FROM fx_values ORDER BY fecha DESC LIMIT 1
)
SELECT p.*,
  CASE 
    WHEN p.prima_moneda = 'MXN' THEN p.prima_input
    WHEN p.prima_moneda = 'USD' THEN p.prima_input * (SELECT usd_fx FROM latest_fx)
    WHEN p.prima_moneda = 'UDI' THEN p.prima_input * (SELECT udi_valor FROM latest_udi)
    ELSE p.prima_input
  END AS prima_mxn_actual,
  CASE 
    WHEN p.sa_moneda = 'MXN' THEN p.sa_input
    WHEN p.sa_moneda = 'USD' THEN p.sa_input * (SELECT usd_fx FROM latest_fx)
    WHEN p.sa_moneda = 'UDI' THEN p.sa_input * (SELECT udi_valor FROM latest_udi)
    ELSE p.sa_input
  END AS sa_mxn_actual,
  (SELECT udi_valor FROM latest_udi) AS udi_valor_usado,
  (SELECT usd_fx FROM latest_fx) AS usd_fx_usado
FROM polizas p;

CREATE OR REPLACE VIEW polizas_ui AS
SELECT 
  id,
  cliente_id,
  numero_poliza,
  estatus,
  forma_pago,
  periodicidad_pago,
  prima_input,
  prima_moneda,
  sa_input,
  sa_moneda,
  fecha_emision,
  fecha_renovacion,
  tipo_pago,
  dia_pago,
  meses_check,
  producto_parametro_id,
  fecha_alta_sistema
FROM polizas;

CREATE OR REPLACE VIEW citas_ocupadas AS
    SELECT agente_id AS usuario_id, inicio, fin
    FROM citas
    WHERE estado = 'confirmada'
    UNION ALL
    SELECT supervisor_id AS usuario_id, inicio, fin
    FROM citas
    WHERE estado = 'confirmada' AND supervisor_id IS NOT NULL;

-- =============================================================================
-- 21. VIEWS FASE 6: COMISIONES Y CONEXIÓN
-- =============================================================================

CREATE OR REPLACE VIEW vw_agentes_con_mes_conexion AS
SELECT 
  u.id AS usuario_id,
  u.id_auth,
  u.email,
  u.nombre AS agente_nombre,
  c.mes_conexion,
  c.candidato,
  c.efc
FROM usuarios u
INNER JOIN candidatos c ON LOWER(c.email_agente) = LOWER(u.email)
WHERE u.rol IN ('agente','supervisor')
  AND u.activo = TRUE
  AND c.eliminado = FALSE
  AND c.mes_conexion IS NOT NULL
  AND c.mes_conexion <> '';

CREATE OR REPLACE VIEW vw_agentes_sin_mes_conexion AS
SELECT 
  u.id AS usuario_id,
  u.id_auth,
  u.email,
  u.nombre AS agente_nombre
FROM usuarios u
WHERE u.rol IN ('agente','supervisor')
  AND u.activo = TRUE
  AND NOT EXISTS (
    SELECT 1 
    FROM candidatos c 
    WHERE LOWER(c.email_agente) = LOWER(u.email)
      AND c.eliminado = FALSE
      AND c.mes_conexion IS NOT NULL
      AND c.mes_conexion <> ''
  );

CREATE OR REPLACE VIEW vw_comisiones_agente_mes AS
SELECT 
  cl.asesor_id,
  u.id AS usuario_id,
  u.nombre AS agente_nombre,
  u.email AS agente_email,
  DATE_TRUNC('month', ppm.periodo_mes)::date AS mes_emision,
  TO_CHAR(DATE_TRUNC('month', ppm.periodo_mes), 'YYYY-MM') AS periodo,
  COUNT(DISTINCT p.id) AS total_polizas,
  SUM(ppm.monto_pagado) AS prima_total,
  SUM(ppm.monto_pagado * COALESCE(ppc.base_factor, 0) / 100) AS comision_estimada,
  SUM(
    CASE 
      WHEN ppm.estado = 'pagado' THEN ppm.monto_pagado * COALESCE(ppc.base_factor, 0) / 100
      ELSE 0
    END
  ) AS comision_vigente
FROM poliza_pagos_mensuales ppm
INNER JOIN polizas p ON ppm.poliza_id = p.id
INNER JOIN clientes cl ON p.cliente_id = cl.id
INNER JOIN usuarios u ON cl.asesor_id = u.id_auth
LEFT JOIN poliza_puntos_cache ppc ON p.id = ppc.poliza_id
WHERE p.anulada_at IS NULL
  AND u.rol IN ('agente','supervisor')
  AND u.activo = TRUE
  AND ppm.estado = 'pagado'
GROUP BY cl.asesor_id, u.id, u.nombre, u.email, DATE_TRUNC('month', ppm.periodo_mes);

CREATE OR REPLACE VIEW vw_dashboard_comisiones_con_conexion AS
SELECT 
  acm.periodo,
  acm.mes_emision,
  agc.agente_nombre,
  agc.mes_conexion,
  agc.efc,
  acm.total_polizas,
  acm.prima_total,
  acm.comision_estimada,
  acm.comision_vigente,
  agc.usuario_id,
  agc.id_auth,
  agc.email
FROM vw_comisiones_agente_mes acm
INNER JOIN vw_agentes_con_mes_conexion agc 
  ON acm.asesor_id = agc.id_auth
ORDER BY acm.periodo DESC, agc.agente_nombre;

CREATE OR REPLACE VIEW vw_dashboard_comisiones_sin_conexion AS
SELECT 
  acm.periodo,
  acm.mes_emision,
  asnc.agente_nombre,
  acm.total_polizas,
  acm.prima_total,
  acm.comision_estimada,
  acm.comision_vigente,
  asnc.usuario_id,
  asnc.id_auth,
  asnc.email
FROM vw_comisiones_agente_mes acm
INNER JOIN vw_agentes_sin_mes_conexion asnc 
  ON acm.asesor_id = asnc.id_auth
ORDER BY acm.periodo DESC, asnc.agente_nombre;

CREATE OR REPLACE VIEW vw_agente_comision_mes_actual AS
SELECT 
  u.id_auth as agente_id,
  u.id as usuario_id,
  u.nombre as agente_nombre,
  u.email as agente_email,
  COALESCE(SUM(ppm.monto_programado), 0) as importe_programado,
  COALESCE(SUM(ppm.monto_pagado), 0) as importe_pagado,
  COALESCE(
    SUM(CASE WHEN ppm.estado = 'pendiente' THEN ppm.monto_programado ELSE 0 END), 
    0
  ) as importe_pendiente,
  COUNT(DISTINCT p.id) FILTER (WHERE p.estatus = 'EN_VIGOR') as polizas_vigentes,
  COUNT(DISTINCT ppm.id) FILTER (WHERE ppm.estado = 'vencido') as pagos_vencidos
FROM usuarios u
LEFT JOIN clientes cl ON cl.asesor_id = u.id_auth
LEFT JOIN polizas p ON p.cliente_id = cl.id AND p.anulada_at IS NULL
LEFT JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id 
  AND DATE_TRUNC('month', ppm.periodo_mes) = DATE_TRUNC('month', CURRENT_DATE)
WHERE u.rol IN ('agente','supervisor')
  AND u.activo = true
GROUP BY u.id_auth, u.id, u.nombre, u.email;

-- View de progreso de campañas (Phase 5)
CREATE OR REPLACE VIEW campaign_progress_summary AS
SELECT 
  c.id AS campaign_id,
  c.slug,
  c.name,
  c.status,
  COUNT(DISTINCT cp.usuario_id) AS total_participants,
  COUNT(DISTINCT cp.usuario_id) FILTER (WHERE cp.eligible = true) AS eligible_count,
  COUNT(DISTINCT cp.usuario_id) FILTER (WHERE cp.status = 'completed') AS completed_count,
  AVG(cp.progress) FILTER (WHERE cp.eligible = true) AS avg_progress,
  MAX(cp.evaluated_at) AS last_evaluation
FROM campaigns c
LEFT JOIN campaign_progress cp ON c.id = cp.campaign_id
GROUP BY c.id, c.slug, c.name, c.status;

-- =============================================================================
-- 22. ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE udi_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE dias_mes ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE polizas ENABLE ROW LEVEL SECURITY;
ALTER TABLE poliza_puntos_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE cliente_update_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_costos_poliza ENABLE ROW LEVEL SECURITY;
ALTER TABLE poliza_update_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agente_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospectos_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE planificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens_integracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_integracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_custom_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE poliza_pagos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Políticas para udi_values y fx_values
CREATE POLICY sel_udi_values ON udi_values
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY ins_udi_values_super ON udi_values
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());
CREATE POLICY upd_udi_values_super ON udi_values
  FOR UPDATE TO authenticated
  USING (is_super_role());
CREATE POLICY del_udi_values_super ON udi_values
  FOR DELETE TO authenticated
  USING (is_super_role());

CREATE POLICY sel_fx_values ON fx_values
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY ins_fx_values_super ON fx_values
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());
CREATE POLICY upd_fx_values_super ON fx_values
  FOR UPDATE TO authenticated
  USING (is_super_role());
CREATE POLICY del_fx_values_super ON fx_values
  FOR DELETE TO authenticated
  USING (is_super_role());

-- Políticas para clientes
CREATE POLICY sel_clientes ON clientes
  FOR SELECT TO authenticated
  USING (asesor_id = auth.uid() OR is_super_role());
CREATE POLICY upd_clientes_super ON clientes
  FOR UPDATE TO authenticated
  USING (is_super_role());
CREATE POLICY ins_clientes_asesor ON clientes
  FOR INSERT TO authenticated
  WITH CHECK (asesor_id = auth.uid() OR is_super_role());

-- Políticas para polizas
CREATE POLICY sel_polizas ON polizas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = polizas.cliente_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );
CREATE POLICY upd_polizas_super ON polizas
  FOR UPDATE TO authenticated
  USING (is_super_role());

-- Políticas para poliza_puntos_cache
CREATE POLICY sel_poliza_puntos_cache ON poliza_puntos_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM polizas p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = poliza_puntos_cache.poliza_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );
CREATE POLICY ins_poliza_puntos_cache_super ON poliza_puntos_cache
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());
CREATE POLICY upd_poliza_puntos_cache_super ON poliza_puntos_cache
  FOR UPDATE TO authenticated
  USING (is_super_role());
CREATE POLICY del_poliza_puntos_cache_super ON poliza_puntos_cache
  FOR DELETE TO authenticated
  USING (is_super_role());

-- Políticas para cliente_update_requests
CREATE POLICY ins_cliente_update_requests ON cliente_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());
CREATE POLICY sel_cliente_update_requests ON cliente_update_requests
  FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR is_super_role());
CREATE POLICY upd_cliente_update_requests_super ON cliente_update_requests
  FOR UPDATE TO authenticated
  USING (is_super_role());

-- Políticas para poliza_update_requests
CREATE POLICY ins_poliza_update_requests ON poliza_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());
CREATE POLICY sel_poliza_update_requests ON poliza_update_requests
  FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR is_super_role());
CREATE POLICY upd_poliza_update_requests_super ON poliza_update_requests
  FOR UPDATE TO authenticated
  USING (is_super_role());

-- Políticas para cliente_historial
CREATE POLICY sel_cliente_historial ON cliente_historial
  FOR SELECT TO authenticated
  USING (is_super_role());
CREATE POLICY ins_cliente_historial_super ON cliente_historial
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

-- Políticas para historial_costos_poliza
CREATE POLICY sel_historial_costos_poliza_super ON historial_costos_poliza
  FOR SELECT TO authenticated
  USING (is_super_role());
CREATE POLICY ins_historial_costos_poliza_super ON historial_costos_poliza
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

-- Políticas para poliza_pagos_mensuales
CREATE POLICY sel_poliza_pagos_mensuales ON poliza_pagos_mensuales
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM polizas p
      INNER JOIN clientes c ON p.cliente_id = c.id
      WHERE p.id = poliza_pagos_mensuales.poliza_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );
CREATE POLICY upd_poliza_pagos_mensuales ON poliza_pagos_mensuales
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM polizas p
      INNER JOIN clientes c ON p.cliente_id = c.id
      WHERE p.id = poliza_pagos_mensuales.poliza_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );

-- Políticas para notificaciones
CREATE POLICY pol_notificaciones_select ON notificaciones
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());
CREATE POLICY pol_notificaciones_update ON notificaciones
  FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid());
CREATE POLICY pol_notificaciones_insert ON notificaciones
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Políticas para segments
CREATE POLICY segments_select_all ON segments
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY segments_manage_super ON segments
  FOR ALL TO authenticated
  USING (is_super_role());

-- Políticas para product_types
CREATE POLICY product_types_select_all ON product_types
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY product_types_manage_super ON product_types
  FOR ALL TO authenticated
  USING (is_super_role());

-- Políticas para campaigns
CREATE POLICY campaigns_select_all ON campaigns
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY campaigns_manage_super ON campaigns
  FOR ALL TO authenticated
  USING (is_super_role());

-- Políticas para campaign_rules
CREATE POLICY campaign_rules_select_all ON campaign_rules
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY campaign_rules_manage_super ON campaign_rules
  FOR ALL TO authenticated
  USING (is_super_role());

-- Políticas para campaign_progress
CREATE POLICY campaign_progress_select_all ON campaign_progress
  FOR SELECT TO authenticated
  USING (true);
CREATE POLICY campaign_progress_manage_super ON campaign_progress
  FOR ALL TO authenticated
  USING (is_super_role());

-- =============================================================================
-- 23. GRANTS Y PERMISOS
-- =============================================================================

GRANT SELECT ON polizas_ui TO anon;
GRANT SELECT ON polizas_ui TO authenticated;
GRANT SELECT ON polizas_ui TO service_role;

GRANT SELECT ON vw_agentes_con_mes_conexion TO authenticated;
GRANT SELECT ON vw_agentes_sin_mes_conexion TO authenticated;
GRANT SELECT ON vw_comisiones_agente_mes TO authenticated;
GRANT SELECT ON vw_dashboard_comisiones_con_conexion TO authenticated;
GRANT SELECT ON vw_dashboard_comisiones_sin_conexion TO authenticated;
GRANT SELECT ON vw_agente_comision_mes_actual TO authenticated;
GRANT SELECT ON campaign_progress_summary TO authenticated;

GRANT EXECUTE ON FUNCTION fn_actualizar_pagos_vencidos() TO service_role;

-- =============================================================================
-- 24. DATOS SEMILLA MÍNIMOS
-- =============================================================================

-- Seed UDI y FX con valores iniciales
INSERT INTO udi_values(fecha, valor, source, fetched_at, stale)
VALUES (CURRENT_DATE, 7.500000, 'seed', now(), false)
ON CONFLICT (fecha) DO NOTHING;

INSERT INTO fx_values(fecha, valor, source, fetched_at, stale)
VALUES (CURRENT_DATE, 17.000000, 'seed', now(), false)
ON CONFLICT (fecha) DO NOTHING;

-- Seed dias_mes (calendario básico)
INSERT INTO dias_mes(mes, anio, max_dias, es_bisiesto)
VALUES
  (1, NULL, 31, false),
  (2, NULL, 28, false),
  (3, NULL, 31, false),
  (4, NULL, 30, false),
  (5, NULL, 31, false),
  (6, NULL, 30, false),
  (7, NULL, 31, false),
  (8, NULL, 31, false),
  (9, NULL, 30, false),
  (10, NULL, 31, false),
  (11, NULL, 30, false),
  (12, NULL, 31, false)
ON CONFLICT DO NOTHING;

-- Seed product_types (Phase 5)
INSERT INTO product_types (code, name, description)
VALUES
  ('VI', 'Vida Individual', 'Productos de seguro de vida individual'),
  ('GMM', 'Gastos Médicos Mayores', 'Productos de seguro de gastos médicos mayores')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- 23. FUNCIONES Y TRIGGERS DE INVALIDACIÓN DE CACHE POR USUARIO
-- =============================================================================

-- Función: Invalidar cache de campaign_progress para un usuario
CREATE OR REPLACE FUNCTION invalidate_campaign_cache_for_user(p_usuario_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM campaign_progress WHERE usuario_id = p_usuario_id;
END;
$$;

COMMENT ON FUNCTION invalidate_campaign_cache_for_user(bigint) IS 'Invalida el cache de campaign_progress para un usuario específico';

-- Trigger function: Invalidar cache cuando cambian candidatos
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_candidatos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Solo invalidar si cambió mes_conexion
  IF (TG_OP = 'UPDATE' AND OLD.mes_conexion IS DISTINCT FROM NEW.mes_conexion) 
     OR TG_OP = 'INSERT' THEN
    
    -- Buscar el usuario_id por email
    SELECT u.id INTO v_usuario_id
    FROM usuarios u
    WHERE LOWER(u.email) = LOWER(COALESCE(NEW.email_agente, ''))
    LIMIT 1;
    
    IF v_usuario_id IS NOT NULL THEN
      PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_invalidate_cache_on_candidatos() IS 'Invalida cache cuando cambia mes_conexion u otros datos de candidatos';

CREATE TRIGGER trigger_invalidate_cache_on_candidatos
  AFTER INSERT OR UPDATE ON candidatos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_candidatos();

-- Trigger function: Invalidar cache cuando cambian clientes
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_clientes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Obtener usuario_id del asesor
  SELECT u.id INTO v_usuario_id
  FROM usuarios u
  WHERE u.id_auth = COALESCE(NEW.asesor_id, OLD.asesor_id)
  LIMIT 1;
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION trigger_invalidate_cache_on_clientes() IS 'Invalida cache cuando se crean/modifican/eliminan clientes';

CREATE TRIGGER trigger_invalidate_cache_on_clientes
  AFTER INSERT OR UPDATE OR DELETE ON clientes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_clientes();

-- Trigger function: Invalidar cache cuando cambian pólizas
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_polizas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_usuario_id bigint;
  v_asesor_id_auth uuid;
BEGIN
  SELECT c.asesor_id INTO v_asesor_id_auth
  FROM clientes c
  WHERE c.id = COALESCE(NEW.cliente_id, OLD.cliente_id)
  LIMIT 1;
  
  IF v_asesor_id_auth IS NOT NULL THEN
    SELECT u.id INTO v_usuario_id
    FROM usuarios u
    WHERE u.id_auth = v_asesor_id_auth
    LIMIT 1;
    
    IF v_usuario_id IS NOT NULL THEN
      PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION trigger_invalidate_cache_on_polizas() IS 'Invalida cache cuando se crean/modifican/eliminan pólizas';

CREATE TRIGGER trigger_invalidate_cache_on_polizas
  AFTER INSERT OR UPDATE OR DELETE ON polizas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_polizas();

-- Trigger function: Invalidar cache cuando cambian planificaciones
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_planificaciones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- agente_id en planificaciones es directamente el usuario_id
  v_usuario_id := COALESCE(NEW.agente_id, OLD.agente_id);
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION trigger_invalidate_cache_on_planificaciones() IS 'Invalida cache cuando cambian planificaciones';

CREATE TRIGGER trigger_invalidate_cache_on_planificaciones
  AFTER INSERT OR UPDATE OR DELETE ON planificaciones
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_planificaciones();

-- Trigger function: Invalidar cache cuando cambian prospectos
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_prospectos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_usuario_id bigint;
BEGIN
  -- Obtener usuario_id del agente
  SELECT u.id INTO v_usuario_id
  FROM usuarios u
  WHERE u.id = COALESCE(NEW.agente_id, OLD.agente_id)
  LIMIT 1;
  
  IF v_usuario_id IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(v_usuario_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION trigger_invalidate_cache_on_prospectos() IS 'Invalida cache cuando cambian prospectos (afecta RC metrics)';

CREATE TRIGGER trigger_invalidate_cache_on_prospectos
  AFTER INSERT OR UPDATE OR DELETE ON prospectos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_prospectos();

-- Trigger function: Invalidar cache cuando cambian user_segments
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_user_segments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.usuario_id, OLD.usuario_id) IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(COALESCE(NEW.usuario_id, OLD.usuario_id));
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION trigger_invalidate_cache_on_user_segments() IS 'Invalida cache cuando cambian los segmentos del usuario (afecta elegibilidad por SEGMENT rules)';

CREATE TRIGGER trigger_invalidate_cache_on_user_segments
  AFTER INSERT OR UPDATE OR DELETE ON user_segments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_user_segments();

-- Trigger function: Invalidar cache cuando cambian custom metrics
CREATE OR REPLACE FUNCTION trigger_invalidate_cache_on_custom_metrics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.usuario_id, OLD.usuario_id) IS NOT NULL THEN
    PERFORM invalidate_campaign_cache_for_user(COALESCE(NEW.usuario_id, OLD.usuario_id));
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION trigger_invalidate_cache_on_custom_metrics() IS 'Invalida cache cuando cambian métricas personalizadas de campañas';

CREATE TRIGGER trigger_invalidate_cache_on_custom_metrics
  AFTER INSERT OR UPDATE OR DELETE ON campaign_custom_metrics
  FOR EACH ROW
  EXECUTE FUNCTION trigger_invalidate_cache_on_custom_metrics();

COMMIT;

-- =============================================================================
-- FIN DEL SCHEMA CONSOLIDADO
-- =============================================================================
-- 
-- MIGRACIONES CONSOLIDADAS (102 archivos):
--
-- Base Fase 2 (prospectos, planificación):
--   20250827_add_email_agente_to_candidatos.sql
--   20250827_fase2_prospectos_planificacion.sql
--   20250828_alter_prospectos_fecha_cita_timestamp.sql
--   20250828_parametros_and_fix_fecha_cita.sql
--   20250829_set_roles_timezone_cdmx.sql
--   20250831_add_email_candidato_unique.sql
--   20250831_add_etapas_completadas_to_candidatos.sql
--   20250903_prospectos_historial.sql
--   20250904_align_candidatos_develop.sql
--   20250904_align_usuarios_roles.sql
--
-- Fase 3 SQUASH (producto_parametros, clientes, polizas, puntos, comisiones):
--   20250914_fase3_squash.sql → Consolida 51 migraciones individuales de sept 2025
--     Incluye todas las migraciones desde 20250908 hasta 20250914
--     (CREATE tipos, tablas core, funciones UDI/FX, recalc_puntos, RLS, workflows)
--
-- Post-Fase 3 (ajustes y fixes septiembre):
--   20250914_rls_historial_costos_poliza.sql
--   20250914_sync_poliza_moneda_with_producto.sql
--   20250914_use_latest_fx_udi_for_points.sql
--   20250923_seed_producto_parametros.sql
--   20250929_add_pop_fields_to_candidatos.sql
--   20250929_add_ya_es_cliente_estado.sql
--
-- Fase 4 (agenda, citas, integraciones):
--   20251016_phase4_agenda_base.sql
--   20251019_add_email_to_prospectos.sql
--   20251019_clientes_soft_delete.sql
--   20251019_transfer_usuario_soft_delete.sql
--   20251020_tokens_integracion_teams.sql
--
-- Fase 5 (campañas, segmentos, product_types):
--   20251111_phase5_campaigns_segments.sql
--   20251112_phase5_metrics_indexes.sql
--   20251112_phase5_metrics_views.sql
--   20251112_phase5_product_type_refactor.sql
--   20251112_phase5_segment_utilities.sql
--   20251113_add_mes_conexion_to_candidatos.sql
--   20251113_phase5_roles_normalization.sql
--   20251113_phase5_segment_permissions_fix.sql
--   20251117_create_campaigns_custom_metrics.sql
--   20251118_campaign_progress_summary_view.sql
--   20251119_add_logical_groups_to_campaign_rules.sql
--   20251120_campaign_cache_cron_job.sql
--   20251120_campaign_datasets_function.sql
--   20251120_invalidate_campaign_cache_triggers.sql
--   20251124_campaign_evaluation_cron.sql
--   20251124_fix_invalidate_cache_polizas_trigger.sql
--   20251124_fix_polizas_producto_parametro_id_type.sql
--   20251124_materialize_cancelaciones_indices.sql
--   20251125_optimize_cancelaciones_view.sql
--
-- Security & Performance Fixes (diciembre 2025):
--   20251210_enable_rls_missing_tables.sql
--   20251210_fix_function_search_path.sql
--   20251210_fix_remaining_security_issues.sql
--   20251210_optimize_performance_security.sql
--   20251211_fix_8_remaining_functions.sql
--   20251211_fix_all_usuarios_functions.sql
--   20251211_fix_invalidate_cache_function.sql
--   20251211_fix_is_super_role_search_path.sql
--   20251211_fix_planificaciones_trigger.sql
--   20251211_fix_polizas_trigger.sql
--   20251211_fix_prospectos_policies_search_path.sql
--   20251211_fix_remaining_9_functions.sql
--   20251227_fix_all_search_path_issues.sql
--
-- Fase 6 SQUASH (pagos mensuales, comisiones, notificaciones):
--   20260106_phase6_pagos_comisiones_squash.sql → Consolida:
--     20251227_fase6_pagos_comisiones.sql
--     20260105_adjust_comisiones_pagado.sql
--     20260105_fix_mes_conexion_empty.sql
--     20260105_include_supervisores_comisiones.sql
--     20260105_trigger_fill_pagado.sql
--   (Crea poliza_pagos_mensuales, migra periodicidad_pago, views comisiones)
--
-- Notificaciones:
--   20251227_notificaciones.sql
--   20260121_notificaciones_updated_at.sql
--
-- =============================================================================
-- CARACTERÍSTICAS DEL SCHEMA:
-- 
-- ✓ Idempotente: Se puede ejecutar múltiples veces sin errores
-- ✓ Transaccional: Todo se ejecuta dentro de una transacción BEGIN/COMMIT
-- ✓ Seguro: Todos los SECURITY DEFINER con SET search_path = public
-- ✓ RLS completo: Row Level Security habilitado en todas las tablas
-- ✓ Triggers automáticos: updated_at, recalc_puntos, generación pagos, cache
-- ✓ Funciones de negocio: UDI/FX, normalización, puntos, comisiones, workflows
-- ✓ Views optimizadas: Dashboards de comisiones, campañas, valores actuales
-- ✓ Datos semilla: UDI, FX, dias_mes, product_types
-- 
-- VERSIÓN: 1.0.0 (Consolidación completa hasta 2026-01-21)
-- =============================================================================


