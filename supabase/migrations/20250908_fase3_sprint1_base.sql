-- Fase 3 – Sprint 1: Migraciones base
-- Fecha: 2025-09-08
-- Objetivo: Estructura mínima (ENUMs, secuencia/código de cliente, tablas base y RLS inicial)

-- Extensiones necesarias (omitido: Supabase ya incluye pgcrypto)

-- Tipos ENUM (creación directa; se asume entorno nuevo)
CREATE TYPE estatus_poliza AS ENUM ('EN_VIGOR', 'ANULADA');
CREATE TYPE forma_pago AS ENUM ('MODO_DIRECTO', 'CARGO_AUTOMATICO');
CREATE TYPE tipo_producto AS ENUM ('VI', 'GMM');
CREATE TYPE tipo_clasificacion_puntos AS ENUM ('CERO','MEDIO','SIMPLE','DOBLE','TRIPLE');
CREATE TYPE moneda_poliza AS ENUM ('MXN','USD','UDI');
CREATE TYPE estado_solicitud_cambio AS ENUM ('PENDIENTE','APROBADA','RECHAZADA');
CREATE TYPE tipo_cambio_cliente AS ENUM ('CREACION','MODIFICACION','APROBACION','RECHAZO');

-- Secuencia y función para código de cliente
CREATE SEQUENCE IF NOT EXISTS seq_cliente_code START 1;

CREATE OR REPLACE FUNCTION generar_cliente_code() RETURNS text AS $$
  SELECT 'LEACL-' || lpad(nextval('seq_cliente_code')::text, 6, '0');
$$ LANGUAGE sql VOLATILE;

-- Función utilitaria: actualizar updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabla producto_parametros
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
  creado_at timestamptz NOT NULL DEFAULT now()
);

-- (retirado) columnas generadas: se usa trigger con columnas planas abajo

-- Sustituir columnas generadas por columnas normales + trigger (evita restricción de IMMUTABLE)
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

-- Normaliza datos existentes, si los hay
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

-- Tablas de valores UDI y FX
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

-- Calendario de días por mes (con reglas de unicidad para default y año específico)
CREATE TABLE IF NOT EXISTS dias_mes (
  id bigserial PRIMARY KEY,
  mes smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio int NULL,
  max_dias smallint NOT NULL CHECK (max_dias BETWEEN 28 AND 31),
  es_bisiesto boolean NOT NULL DEFAULT false
);
-- Único para registros específicos por año
CREATE UNIQUE INDEX IF NOT EXISTS uq_dias_mes_mes_anio_notnull ON dias_mes(mes, anio) WHERE anio IS NOT NULL;
-- Único para registro default (anio IS NULL) por mes
CREATE UNIQUE INDEX IF NOT EXISTS uq_dias_mes_mes_anio_null ON dias_mes(mes) WHERE anio IS NULL;

-- Seed inicial dias_mes (solo si vacío)
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

-- Tabla clientes
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
  creado_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Índice de apoyo para detección de duplicados
CREATE INDEX IF NOT EXISTS idx_clientes_email_apellidos ON clientes (lower(correo), primer_apellido, segundo_apellido);

-- Trigger updated_at clientes
DROP TRIGGER IF EXISTS trg_clientes_set_updated_at ON clientes;
CREATE TRIGGER trg_clientes_set_updated_at
BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabla polizas (crear si no existe)
CREATE TABLE IF NOT EXISTS polizas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  producto_parametro_id uuid NULL REFERENCES producto_parametros(id),
  numero_poliza text NOT NULL,
  estatus estatus_poliza NOT NULL DEFAULT 'EN_VIGOR',
  fecha_emision date NOT NULL,
  fecha_alta_sistema timestamptz NOT NULL DEFAULT now(),
  forma_pago forma_pago NOT NULL,
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

-- Índices de apoyo polizas
CREATE INDEX IF NOT EXISTS idx_polizas_cliente_estado ON polizas(cliente_id, estatus);
CREATE INDEX IF NOT EXISTS idx_polizas_producto ON polizas(producto_parametro_id);

-- Trigger updated_at polizas
DROP TRIGGER IF EXISTS trg_polizas_set_updated_at ON polizas;
CREATE TRIGGER trg_polizas_set_updated_at
BEFORE UPDATE ON polizas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabla poliza_puntos_cache
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

-- Trigger updated_at poliza_puntos_cache
DROP TRIGGER IF EXISTS trg_poliza_puntos_cache_set_updated_at ON poliza_puntos_cache;
CREATE TRIGGER trg_poliza_puntos_cache_set_updated_at
BEFORE UPDATE ON poliza_puntos_cache
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabla cliente_historial
CREATE TABLE IF NOT EXISTS cliente_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cambio_tipo tipo_cambio_cliente NOT NULL,
  payload_old jsonb NULL,
  payload_new jsonb NULL,
  actor_id uuid NULL,
  creado_at timestamptz NOT NULL DEFAULT now()
);

-- Tabla cliente_update_requests
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

-- Tabla historial_costos_poliza
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

-- RLS inicial (habilitar, políticas se añaden en sprints siguientes)
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

-- Fin Sprint 1
