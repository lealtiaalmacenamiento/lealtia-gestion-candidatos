-- Fase 3 Squash Migration (2025-09-08 .. 2025-09-14)
-- Purpose: Consolidate all Phase 3 changes into a single migration for production
-- Notes:
--  - Idempotent where possible (CREATE OR REPLACE, guards on types, triggers, policies)
--  - Excludes destructive dev-only resets (TRUNCATE/seed resets, debug RPCs)
--  - Uses final versions of functions/policies from late 2025-09-14

BEGIN;

-- ===============
-- Extensions/Pragmas
-- ===============
-- Ensure pgcrypto exists (Supabase usually provides it). If needed, uncomment:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- NOTE: These CREATE TYPE statements assume the types don't exist yet in production.
-- If they already exist, run drops/guards manually before applying this squash.
CREATE TYPE estatus_poliza AS ENUM ('EN_VIGOR', 'ANULADA');
CREATE TYPE forma_pago AS ENUM ('MODO_DIRECTO', 'CARGO_AUTOMATICO');
CREATE TYPE tipo_producto AS ENUM ('VI', 'GMM');
CREATE TYPE tipo_clasificacion_puntos AS ENUM ('CERO','MEDIO','SIMPLE','DOBLE','TRIPLE');
CREATE TYPE moneda_poliza AS ENUM ('MXN','USD','UDI');
CREATE TYPE estado_solicitud_cambio AS ENUM ('PENDIENTE','APROBADA','RECHAZADA');
CREATE TYPE tipo_cambio_cliente AS ENUM ('CREACION','MODIFICACION','APROBACION','RECHAZO');
CREATE TYPE periodicidad_pago AS ENUM ('A','S','T','M');

-- ===============
-- Sequences & Basic helpers
-- ===============
CREATE SEQUENCE IF NOT EXISTS seq_cliente_code START 1;

CREATE OR REPLACE FUNCTION generar_cliente_code() RETURNS text AS $$
  SELECT 'LEACL-' || lpad(nextval('seq_cliente_code')::text, 6, '0');
$$ LANGUAGE sql VOLATILE;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===============
-- Core tables
-- ===============
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
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Variant keys (plain columns + trigger)
ALTER TABLE producto_parametros
  DROP COLUMN IF EXISTS moneda_key,
  DROP COLUMN IF EXISTS duracion_anios_key,
  DROP COLUMN IF EXISTS condicion_sa_tipo_key,
  DROP COLUMN IF EXISTS sa_min_key,
  DROP COLUMN IF EXISTS sa_max_key,
  DROP COLUMN IF EXISTS condicion_edad_tipo_key,
  DROP COLUMN IF EXISTS edad_min_key,
  DROP COLUMN IF EXISTS edad_max_key;

ALTER TABLE producto_parametros
  ADD COLUMN IF NOT EXISTS moneda_key text,
  ADD COLUMN IF NOT EXISTS duracion_anios_key int,
  ADD COLUMN IF NOT EXISTS condicion_sa_tipo_key text,
  ADD COLUMN IF NOT EXISTS sa_min_key numeric(18,2),
  ADD COLUMN IF NOT EXISTS sa_max_key numeric(18,2),
  ADD COLUMN IF NOT EXISTS condicion_edad_tipo_key text,
  ADD COLUMN IF NOT EXISTS edad_min_key int,
  ADD COLUMN IF NOT EXISTS edad_max_key int;

CREATE OR REPLACE FUNCTION producto_parametros_set_keys() RETURNS trigger AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_producto_parametros_set_keys ON producto_parametros;
CREATE TRIGGER trg_producto_parametros_set_keys
BEFORE INSERT OR UPDATE ON producto_parametros
FOR EACH ROW EXECUTE FUNCTION producto_parametros_set_keys();

UPDATE producto_parametros SET
  moneda_key = COALESCE(moneda::text, ''),
  duracion_anios_key = COALESCE(duracion_anios, -1),
  condicion_sa_tipo_key = COALESCE(condicion_sa_tipo, ''),
  sa_min_key = COALESCE(sa_min, (-1)::numeric),
  sa_max_key = COALESCE(sa_max, (-1)::numeric),
  condicion_edad_tipo_key = COALESCE(condicion_edad_tipo, ''),
  edad_min_key = COALESCE(edad_min, -1),
  edad_max_key = COALESCE(edad_max, -1);

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

-- Reference data tables: UDI/FX and calendar
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

INSERT INTO dias_mes(mes, anio, max_dias, es_bisiesto)
SELECT v.mes, v.anio, v.max_dias, v.es_bisiesto FROM (
  VALUES
    (1::smallint, NULL::int, 31::smallint, false),
    (2::smallint, NULL::int, 28::smallint, false),
    (3::smallint, NULL::int, 31::smallint, false),
    (4::smallint, NULL::int, 30::smallint, false),
    (5::smallint, NULL::int, 31::smallint, false),
    (6::smallint, NULL::int, 30::smallint, false),
    (7::smallint, NULL::int, 31::smallint, false),
    (8::smallint, NULL::int, 31::smallint, false),
    (9::smallint, NULL::int, 30::smallint, false),
    (10::smallint, NULL::int, 31::smallint, false),
    (11::smallint, NULL::int, 30::smallint, false),
    (12::smallint, NULL::int, 31::smallint, false)
) AS v(mes, anio, max_dias, es_bisiesto)
ON CONFLICT DO NOTHING;

-- Business tables: clientes
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
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_email_apellidos ON clientes (lower(correo), primer_apellido, segundo_apellido);
DROP TRIGGER IF EXISTS trg_clientes_set_updated_at ON clientes;
CREATE TRIGGER trg_clientes_set_updated_at
BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- polizas
CREATE TABLE IF NOT EXISTS polizas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  producto_parametro_id uuid NULL REFERENCES producto_parametros(id),
  numero_poliza text NOT NULL,
  estatus estatus_poliza NOT NULL DEFAULT 'EN_VIGOR',
  fecha_emision date NOT NULL,
  fecha_alta_sistema timestamptz NOT NULL DEFAULT now(),
  forma_pago forma_pago NOT NULL,
  periodicidad_pago periodicidad_pago NULL,
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
  -- extended fields
  fecha_renovacion date NULL,
  tipo_pago text NULL,
  dia_pago smallint NULL CHECK (dia_pago >= 1 AND dia_pago <= 31),
  meses_check jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_polizas_numero UNIQUE (numero_poliza)
);
CREATE INDEX IF NOT EXISTS idx_polizas_cliente_estado ON polizas(cliente_id, estatus);
CREATE INDEX IF NOT EXISTS idx_polizas_producto ON polizas(producto_parametro_id);
CREATE INDEX IF NOT EXISTS polizas_fecha_renovacion_idx ON polizas(fecha_renovacion);
CREATE INDEX IF NOT EXISTS idx_polizas_periodicidad_pago ON polizas(periodicidad_pago);
DROP TRIGGER IF EXISTS trg_polizas_set_updated_at ON polizas;
CREATE TRIGGER trg_polizas_set_updated_at
BEFORE UPDATE ON polizas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cache
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
DROP TRIGGER IF EXISTS trg_poliza_puntos_cache_set_updated_at ON poliza_puntos_cache;
CREATE TRIGGER trg_poliza_puntos_cache_set_updated_at
BEFORE UPDATE ON poliza_puntos_cache
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Historial & Requests
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

-- Agent meta (kpis)
CREATE TABLE IF NOT EXISTS public.agente_meta (
  usuario_id integer PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
  fecha_conexion_text text,
  objetivo integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agente_meta_objetivo ON public.agente_meta(objetivo);

-- ===============
-- RLS toggle
-- ===============
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

-- ===============
-- Role helpers
-- ===============
CREATE OR REPLACE FUNCTION jwt_role()
RETURNS text
AS $$
BEGIN
  RETURN COALESCE((current_setting('request.jwt.claims', true)::jsonb)->>'role', '');
END;
$$ LANGUAGE plpgsql STABLE;

-- Final simplified version (id_auth + JWT fallback)
CREATE OR REPLACE FUNCTION is_super_role()
RETURNS boolean
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM usuarios
    WHERE id_auth = auth.uid()
      AND activo IS TRUE
      AND lower(rol) IN ('superusuario','super_usuario','supervisor','admin')
  ) OR jwt_role() IN ('superusuario','super_usuario','supervisor','admin');
END;
$$ LANGUAGE plpgsql;

-- ===============
-- UDI/FX helpers & normalization
-- ===============
CREATE OR REPLACE FUNCTION get_current_udi(p_fecha date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
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

CREATE OR REPLACE FUNCTION polizas_normalize_amounts()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_polizas_normalize_amounts ON polizas;
CREATE TRIGGER trg_polizas_normalize_amounts
BEFORE INSERT OR UPDATE OF prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision
ON polizas
FOR EACH ROW EXECUTE FUNCTION polizas_normalize_amounts();

-- Enforce moneda alignment with producto
CREATE OR REPLACE FUNCTION polizas_before_insupd_enforce_moneda()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_polizas_before_insupd_enforce_moneda ON polizas;
CREATE TRIGGER trg_polizas_before_insupd_enforce_moneda
BEFORE INSERT OR UPDATE ON polizas
FOR EACH ROW EXECUTE FUNCTION polizas_before_insupd_enforce_moneda();

-- ===============
-- Points/commission computation
-- ===============
CREATE OR REPLACE FUNCTION poliza_year_vigencia(p_fecha_emision date)
RETURNS int
AS $$
BEGIN
  RETURN GREATEST(
    1,
    (EXTRACT(YEAR FROM age(CURRENT_DATE, p_fecha_emision))::int + 1)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Latest: compute using CURRENT_DATE FX/UDI
CREATE OR REPLACE FUNCTION public.recalc_puntos_poliza(p_poliza_id uuid)
RETURNS void
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalc_puntos_poliza_all(p_limit int DEFAULT NULL)
RETURNS int
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
$$ LANGUAGE plpgsql;

-- Triggers to recalc after changes
CREATE OR REPLACE FUNCTION polizas_after_change_recalc()
RETURNS trigger
AS $$
BEGIN
  PERFORM recalc_puntos_poliza(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_polizas_after_insert_recalc ON polizas;
CREATE TRIGGER trg_polizas_after_insert_recalc
AFTER INSERT ON polizas
FOR EACH ROW EXECUTE FUNCTION polizas_after_change_recalc();

DROP TRIGGER IF EXISTS trg_polizas_after_update_recalc ON polizas;
CREATE TRIGGER trg_polizas_after_update_recalc
AFTER UPDATE OF prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision, estatus, producto_parametro_id ON polizas
FOR EACH ROW EXECUTE FUNCTION polizas_after_change_recalc();

-- Recalcs on producto changes
CREATE OR REPLACE FUNCTION recalc_polizas_by_producto_parametro(p_pp_id uuid)
RETURNS int
LANGUAGE plpgsql
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
AS $$
DECLARE
  v_changed boolean := false;
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

DROP TRIGGER IF EXISTS trg_producto_parametros_after_update_recalc ON producto_parametros;
CREATE TRIGGER trg_producto_parametros_after_update_recalc
AFTER UPDATE ON producto_parametros
FOR EACH ROW EXECUTE FUNCTION producto_parametros_after_update_recalc();

CREATE OR REPLACE FUNCTION producto_parametros_after_update_sync_moneda()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_changed boolean := false;
BEGIN
  IF NEW.moneda IS DISTINCT FROM OLD.moneda THEN
    v_changed := true;
  END IF;

  IF v_changed THEN
    IF NEW.moneda IS NOT NULL THEN
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
    END IF;
    PERFORM recalc_polizas_by_producto_parametro(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_producto_parametros_after_update_sync_moneda ON producto_parametros;
CREATE TRIGGER trg_producto_parametros_after_update_sync_moneda
AFTER UPDATE ON producto_parametros
FOR EACH ROW EXECUTE FUNCTION producto_parametros_after_update_sync_moneda();

-- ===============
-- Views
-- ===============
DROP VIEW IF EXISTS polizas_valores_actuales;
CREATE VIEW polizas_valores_actuales AS
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

-- Recreate a simple UI view of polizas
CREATE OR REPLACE VIEW public.polizas_ui AS
SELECT 
  p.id,
  p.cliente_id,
  p.numero_poliza,
  p.estatus,
  p.forma_pago,
  p.periodicidad_pago,
  p.prima_input,
  p.prima_moneda,
  p.sa_input,
  p.sa_moneda,
  p.fecha_emision,
  p.fecha_renovacion,
  p.tipo_pago,
  p.dia_pago,
  p.meses_check,
  p.producto_parametro_id,
  p.fecha_alta_sistema
FROM public.polizas p;

-- ===============
-- Client change workflow
-- ===============
CREATE OR REPLACE FUNCTION submit_cliente_update(p_cliente_id uuid, p_payload jsonb)
RETURNS uuid
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION apply_cliente_update(p_request_id uuid)
RETURNS void
AS $$
DECLARE
  v_cliente_id uuid;
  v_payload jsonb;
  r_old clientes%ROWTYPE;
  r_new clientes%ROWTYPE;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
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
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_cliente_update(p_request_id uuid, p_motivo text)
RETURNS void
AS $$
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
  END IF;

  UPDATE cliente_update_requests
  SET estado = 'RECHAZADA', motivo_rechazo = COALESCE(p_motivo,'') , resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id AND estado = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ===============
-- Poliza change workflow
-- ===============
CREATE OR REPLACE FUNCTION submit_poliza_update(p_poliza_id uuid, p_payload jsonb)
RETURNS uuid
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
$$ LANGUAGE plpgsql;

-- Final robust version without FOR UPDATE on requests read
CREATE OR REPLACE FUNCTION apply_poliza_update(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
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
  v_periodicidad_txt text;
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
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
    IF v_periodicidad_raw IN ('A','ANUAL','ANUALIDAD') THEN v_periodicidad_txt := 'A';
    ELSIF v_periodicidad_raw IN ('S','SEMESTRAL','SEMESTRA') THEN v_periodicidad_txt := 'S';
    ELSIF v_periodicidad_raw IN ('T','TRIMESTRAL','TRIMESTRE') THEN v_periodicidad_txt := 'T';
    ELSIF v_periodicidad_raw IN ('M','MENSUAL','MES') THEN v_periodicidad_txt := 'M';
    ELSIF v_periodicidad_raw IN ('A','S','T','M') THEN v_periodicidad_txt := v_periodicidad_raw; ELSE v_periodicidad_txt := NULL; END IF;
  END IF;

  UPDATE polizas SET
    numero_poliza         = COALESCE(NULLIF(TRIM(v_payload->>'numero_poliza'),''), numero_poliza),
    estatus               = COALESCE(NULLIF(v_payload->>'estatus','')::estatus_poliza, estatus),
    fecha_emision         = COALESCE(NULLIF(v_payload->>'fecha_emision','')::date, fecha_emision),
    fecha_renovacion      = COALESCE(NULLIF(v_payload->>'fecha_renovacion','')::date, fecha_renovacion),
    forma_pago            = COALESCE(NULLIF(v_payload->>'forma_pago','')::forma_pago, forma_pago),
    periodicidad_pago     = COALESCE((CASE WHEN v_periodicidad_txt IS NOT NULL THEN v_periodicidad_txt::public.periodicidad_pago END), periodicidad_pago),
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
AS $$
BEGIN
  IF NOT is_super_role() THEN
    RAISE EXCEPTION 'permiso denegado (se requiere supervisor/super_usuario)';
  END IF;

  UPDATE poliza_update_requests
  SET estado = 'RECHAZADA', motivo_rechazo = COALESCE(p_motivo,''), resuelto_at = now(), resuelto_por = auth.uid()
  WHERE id = p_request_id AND estado = 'PENDIENTE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'solicitud no encontrada o no pendiente';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ===============
-- RLS Policies
-- ===============
-- udi_values / fx_values: read all authenticated; write only super
DROP POLICY IF EXISTS sel_udi_values ON udi_values;
CREATE POLICY sel_udi_values ON udi_values
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS ins_udi_values_super ON udi_values;
CREATE POLICY ins_udi_values_super ON udi_values
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());
DROP POLICY IF EXISTS upd_udi_values_super ON udi_values;
CREATE POLICY upd_udi_values_super ON udi_values
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());
DROP POLICY IF EXISTS del_udi_values_super ON udi_values;
CREATE POLICY del_udi_values_super ON udi_values
  FOR DELETE TO authenticated
  USING (is_super_role());

DROP POLICY IF EXISTS sel_fx_values ON fx_values;
CREATE POLICY sel_fx_values ON fx_values
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS ins_fx_values_super ON fx_values;
CREATE POLICY ins_fx_values_super ON fx_values
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());
DROP POLICY IF EXISTS upd_fx_values_super ON fx_values;
CREATE POLICY upd_fx_values_super ON fx_values
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());
DROP POLICY IF EXISTS del_fx_values_super ON fx_values;
CREATE POLICY del_fx_values_super ON fx_values
  FOR DELETE TO authenticated
  USING (is_super_role());

-- clientes
DROP POLICY IF EXISTS sel_clientes ON clientes;
CREATE POLICY sel_clientes ON clientes
  FOR SELECT TO authenticated
  USING (asesor_id = auth.uid() OR is_super_role());
DROP POLICY IF EXISTS upd_clientes_super ON clientes;
CREATE POLICY upd_clientes_super ON clientes
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());
DROP POLICY IF EXISTS ins_clientes_asesor ON clientes;
CREATE POLICY ins_clientes_asesor ON clientes
  FOR INSERT TO authenticated
  WITH CHECK (asesor_id = auth.uid() OR is_super_role());

-- polizas
DROP POLICY IF EXISTS sel_polizas ON polizas;
CREATE POLICY sel_polizas ON polizas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = polizas.cliente_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );
DROP POLICY IF EXISTS upd_polizas_super ON polizas;
CREATE POLICY upd_polizas_super ON polizas
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

-- poliza_puntos_cache
DROP POLICY IF EXISTS sel_poliza_puntos_cache ON poliza_puntos_cache;
DROP POLICY IF EXISTS ins_poliza_puntos_cache_super ON poliza_puntos_cache;
DROP POLICY IF EXISTS upd_poliza_puntos_cache_super ON poliza_puntos_cache;
DROP POLICY IF EXISTS del_poliza_puntos_cache_super ON poliza_puntos_cache;
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
  USING (is_super_role())
  WITH CHECK (is_super_role());
CREATE POLICY del_poliza_puntos_cache_super ON poliza_puntos_cache
  FOR DELETE TO authenticated
  USING (is_super_role());

-- cliente_update_requests
DROP POLICY IF EXISTS ins_cliente_update_requests ON cliente_update_requests;
CREATE POLICY ins_cliente_update_requests ON cliente_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());
DROP POLICY IF EXISTS sel_cliente_update_requests ON cliente_update_requests;
CREATE POLICY sel_cliente_update_requests ON cliente_update_requests
  FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR is_super_role());
DROP POLICY IF EXISTS upd_cliente_update_requests_super ON cliente_update_requests;
CREATE POLICY upd_cliente_update_requests_super ON cliente_update_requests
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

-- poliza_update_requests
DROP POLICY IF EXISTS ins_poliza_update_requests ON poliza_update_requests;
CREATE POLICY ins_poliza_update_requests ON poliza_update_requests
  FOR INSERT TO authenticated
  WITH CHECK (solicitante_id = auth.uid());
DROP POLICY IF EXISTS sel_poliza_update_requests ON poliza_update_requests;
CREATE POLICY sel_poliza_update_requests ON poliza_update_requests
  FOR SELECT TO authenticated
  USING (solicitante_id = auth.uid() OR is_super_role());
DROP POLICY IF EXISTS upd_poliza_update_requests_super ON poliza_update_requests;
CREATE POLICY upd_poliza_update_requests_super ON poliza_update_requests
  FOR UPDATE TO authenticated
  USING (is_super_role())
  WITH CHECK (is_super_role());

-- cliente_historial (select/insert super)
DROP POLICY IF EXISTS sel_cliente_historial ON cliente_historial;
CREATE POLICY sel_cliente_historial ON cliente_historial
  FOR SELECT TO authenticated
  USING (is_super_role());
DROP POLICY IF EXISTS ins_cliente_historial_super ON cliente_historial;
CREATE POLICY ins_cliente_historial_super ON cliente_historial
  FOR INSERT TO authenticated
  WITH CHECK (is_super_role());

-- historial_costos_poliza (select/insert super)
DROP POLICY IF EXISTS sel_historial_costos_poliza_super ON historial_costos_poliza;
DROP POLICY IF EXISTS ins_historial_costos_poliza_super ON historial_costos_poliza;
CREATE POLICY sel_historial_costos_poliza_super ON historial_costos_poliza
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios u WHERE u.id_auth = auth.uid() AND lower(u.rol) IN ('superusuario','super_usuario','supervisor','admin')
    )
  );
CREATE POLICY ins_historial_costos_poliza_super ON historial_costos_poliza
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios u WHERE u.id_auth = auth.uid() AND lower(u.rol) IN ('superusuario','super_usuario','supervisor','admin')
    )
  );

-- ===============
-- Minimal seeds (safe, idempotent)
-- ===============
INSERT INTO udi_values(fecha, valor, source, fetched_at, stale)
SELECT d, 7.500000::numeric, 'seed', now(), false
FROM (SELECT CURRENT_DATE::date AS d) s
ON CONFLICT (fecha) DO NOTHING;

INSERT INTO fx_values(fecha, valor, source, fetched_at, stale)
SELECT d, 17.000000::numeric, 'seed', now(), false
FROM (SELECT CURRENT_DATE::date AS d) s
ON CONFLICT (fecha) DO NOTHING;

-- ===============
-- Grants for views (optional, typical Supabase roles)
-- ===============
GRANT SELECT ON public.polizas_ui TO anon;
GRANT SELECT ON public.polizas_ui TO authenticated;
GRANT SELECT ON public.polizas_ui TO service_role;

COMMIT;
