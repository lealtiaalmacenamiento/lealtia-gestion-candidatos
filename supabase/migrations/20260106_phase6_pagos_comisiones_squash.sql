-- Fase 6 (squash): Pagos mensuales y comisiones de pólizas
-- Fecha: 2026-01-06
-- Incluye: creación de pagos mensuales, ajustes de comisiones, fixes de mes_conexion vacío, inclusión de supervisores

-- =======================
-- 1) Migrar enum periodicidad_pago (solo si aún usa códigos cortos)
-- =======================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'periodicidad_pago'
      AND e.enumlabel IN ('M','T','S','A')
  ) THEN
    RAISE NOTICE 'Migrando enum periodicidad_pago...';
    DROP VIEW IF EXISTS polizas_ui CASCADE;

    ALTER TYPE periodicidad_pago RENAME TO periodicidad_pago_old;
    CREATE TYPE periodicidad_pago AS ENUM ('mensual', 'trimestral', 'semestral', 'anual');

    ALTER TABLE polizas
      ALTER COLUMN periodicidad_pago TYPE periodicidad_pago
      USING (
        CASE periodicidad_pago::text
          WHEN 'M' THEN 'mensual'::periodicidad_pago
          WHEN 'T' THEN 'trimestral'::periodicidad_pago
          WHEN 'S' THEN 'semestral'::periodicidad_pago
          WHEN 'A' THEN 'anual'::periodicidad_pago
          ELSE NULL
        END
      );

    DROP TYPE periodicidad_pago_old;
  END IF;
END $$;

-- Recrear vista polizas_ui
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

COMMENT ON TYPE periodicidad_pago IS 'Periodicidad de pago de pólizas: mensual (12 pagos/año), trimestral (4), semestral (2), anual (1)';

-- =======================
-- 2) Campos y tipos para pagos
-- =======================
ALTER TABLE polizas 
  ADD COLUMN IF NOT EXISTS fecha_limite_pago date;

COMMENT ON COLUMN polizas.fecha_limite_pago IS 'Fecha límite general para pagos (se puede sobrescribir por periodo)';

CREATE INDEX IF NOT EXISTS idx_polizas_fecha_limite_pago 
  ON polizas(fecha_limite_pago) 
  WHERE fecha_limite_pago IS NOT NULL;

-- Estado de pagos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'poliza_pago_estado') THEN
    CREATE TYPE poliza_pago_estado AS ENUM ('pendiente', 'pagado', 'vencido', 'omitido');
  END IF;
END $$;

COMMENT ON TYPE poliza_pago_estado IS 'Estados de pago: pendiente, pagado, vencido, omitido';

-- Tabla de pagos mensuales
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

-- Trigger updated_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_poliza_pagos_set_updated_at'
  ) THEN
    DROP TRIGGER trg_poliza_pagos_set_updated_at ON poliza_pagos_mensuales;
  END IF;
  CREATE TRIGGER trg_poliza_pagos_set_updated_at
    BEFORE UPDATE ON poliza_pagos_mensuales
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
END $$;

-- =======================
-- 3) Función: generar pagos programados
-- =======================
CREATE OR REPLACE FUNCTION fn_generar_pagos_programados()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_generar_pagos_programados() IS 'Genera pagos programados al insertar/actualizar póliza. Solo elimina/regenera pagos pendientes.';

-- Trigger en polizas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_polizas_generar_pagos'
  ) THEN
    DROP TRIGGER trg_polizas_generar_pagos ON polizas;
  END IF;
  CREATE TRIGGER trg_polizas_generar_pagos
    AFTER INSERT OR UPDATE OF periodicidad_pago, fecha_limite_pago, prima_mxn, fecha_emision, dia_pago
    ON polizas
    FOR EACH ROW
    WHEN (NEW.periodicidad_pago IS NOT NULL)
    EXECUTE FUNCTION fn_generar_pagos_programados();
END $$;

COMMENT ON TRIGGER trg_polizas_generar_pagos ON polizas IS 'Regenera pagos programados cuando cambian datos relevantes de la póliza';

-- =======================
-- 4) Funciones de apoyo pagos
-- =======================
CREATE OR REPLACE FUNCTION fn_actualizar_pagos_vencidos()
RETURNS TABLE(updated_count bigint) 
LANGUAGE plpgsql
SECURITY DEFINER
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

COMMENT ON FUNCTION fn_actualizar_pagos_vencidos() IS 'Marca como vencidos los pagos pendientes que pasaron su fecha límite. Usar desde cron/edge function.';
GRANT EXECUTE ON FUNCTION fn_actualizar_pagos_vencidos() TO service_role;

-- Auto-fill al marcar pagado
CREATE OR REPLACE FUNCTION trg_fill_pagado_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_poliza_pagos_fill_pagado'
  ) THEN
    DROP TRIGGER trg_poliza_pagos_fill_pagado ON poliza_pagos_mensuales;
  END IF;
  CREATE TRIGGER trg_poliza_pagos_fill_pagado
    BEFORE UPDATE ON poliza_pagos_mensuales
    FOR EACH ROW
    WHEN (OLD.estado IS DISTINCT FROM NEW.estado OR NEW.monto_pagado IS NULL OR NEW.fecha_pago_real IS NULL)
    EXECUTE FUNCTION trg_fill_pagado_fields();
END $$;

-- =======================
-- 5) Vistas de comisiones y conexión (versión final con supervisores y mes_conexion no vacío)
-- =======================
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

COMMENT ON VIEW vw_agentes_con_mes_conexion IS 'Agentes y supervisores con mes de conexión registrado (no vacío) en candidatos';

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

COMMENT ON VIEW vw_agentes_sin_mes_conexion IS 'Agentes y supervisores que no tienen mes de conexión (nulo o vacío)';

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

COMMENT ON VIEW vw_comisiones_agente_mes IS 'Comisiones agregadas por agente/supervisor y mes, basadas en pagos pagados y base_factor de cada póliza';

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

COMMENT ON VIEW vw_dashboard_comisiones_con_conexion IS 'Dashboard: Comisiones de agentes/supervisores CON mes de conexión';

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

COMMENT ON VIEW vw_dashboard_comisiones_sin_conexion IS 'Dashboard: Comisiones de agentes/supervisores SIN mes de conexión';

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

COMMENT ON VIEW vw_agente_comision_mes_actual IS 'Resumen de pagos y comisiones del mes actual por agente/supervisor';

-- =======================
-- 6) RLS policies
-- =======================
ALTER TABLE poliza_pagos_mensuales ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sel_poliza_pagos_mensuales') THEN
    DROP POLICY sel_poliza_pagos_mensuales ON poliza_pagos_mensuales;
  END IF;
  CREATE POLICY sel_poliza_pagos_mensuales
    ON poliza_pagos_mensuales FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM polizas p
        INNER JOIN clientes c ON p.cliente_id = c.id
        WHERE p.id = poliza_pagos_mensuales.poliza_id
          AND (c.asesor_id = auth.uid() OR is_super_role())
      )
    );
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'upd_poliza_pagos_mensuales') THEN
    DROP POLICY upd_poliza_pagos_mensuales ON poliza_pagos_mensuales;
  END IF;
  CREATE POLICY upd_poliza_pagos_mensuales
    ON poliza_pagos_mensuales FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM polizas p
        INNER JOIN clientes c ON p.cliente_id = c.id
        WHERE p.id = poliza_pagos_mensuales.poliza_id
          AND (c.asesor_id = auth.uid() OR is_super_role())
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM polizas p
        INNER JOIN clientes c ON p.cliente_id = c.id
        WHERE p.id = poliza_pagos_mensuales.poliza_id
          AND (c.asesor_id = auth.uid() OR is_super_role())
      )
    );
END $$;

-- =======================
-- 7) Grants
-- =======================
GRANT SELECT ON vw_agentes_con_mes_conexion TO authenticated;
GRANT SELECT ON vw_agentes_sin_mes_conexion TO authenticated;
GRANT SELECT ON vw_comisiones_agente_mes TO authenticated;
GRANT SELECT ON vw_dashboard_comisiones_con_conexion TO authenticated;
GRANT SELECT ON vw_dashboard_comisiones_sin_conexion TO authenticated;
GRANT SELECT ON vw_agente_comision_mes_actual TO authenticated;

-- =======================
-- 8) Candidatos: fecha de nacimiento
-- =======================
ALTER TABLE candidatos
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date;

COMMENT ON COLUMN candidatos.fecha_nacimiento IS 'Fecha de nacimiento del candidato';

-- =======================
-- 9) Índices adicionales
-- =======================
CREATE INDEX IF NOT EXISTS idx_candidatos_mes_conexion 
  ON candidatos(mes_conexion) 
  WHERE mes_conexion IS NOT NULL AND mes_conexion <> '' AND eliminado = false;

CREATE INDEX IF NOT EXISTS idx_poliza_puntos_cache_poliza_base 
  ON poliza_puntos_cache(poliza_id, base_factor)
  WHERE base_factor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_asesor_activo 
  ON clientes(asesor_id, activo) 
  WHERE asesor_id IS NOT NULL;

-- =======================
-- 10) Notificaciones in-app (sistema / pagos / comisiones)
-- =======================
CREATE TABLE IF NOT EXISTS notificaciones (
  id BIGSERIAL PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('pago_vencido', 'pago_proximo', 'comision_disponible', 'sistema')),
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT NOT NULL,
  leida BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  leida_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_leida 
  ON notificaciones(usuario_id, leida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_tipo 
  ON notificaciones(tipo);
CREATE INDEX IF NOT EXISTS idx_notificaciones_created 
  ON notificaciones(created_at DESC);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notificaciones' AND policyname = 'pol_notificaciones_select') THEN
    DROP POLICY pol_notificaciones_select ON notificaciones;
  END IF;
  CREATE POLICY pol_notificaciones_select 
    ON notificaciones FOR SELECT 
    USING (usuario_id = auth.uid());
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notificaciones' AND policyname = 'pol_notificaciones_update') THEN
    DROP POLICY pol_notificaciones_update ON notificaciones;
  END IF;
  CREATE POLICY pol_notificaciones_update 
    ON notificaciones FOR UPDATE 
    USING (usuario_id = auth.uid())
    WITH CHECK (usuario_id = auth.uid());
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notificaciones' AND policyname = 'pol_notificaciones_insert') THEN
    DROP POLICY pol_notificaciones_insert ON notificaciones;
  END IF;
  CREATE POLICY pol_notificaciones_insert 
    ON notificaciones FOR INSERT 
    WITH CHECK (true);
END $$;

COMMENT ON TABLE notificaciones IS 'Notificaciones in-app para usuarios (alertas de pagos, comisiones, sistema)';
COMMENT ON COLUMN notificaciones.tipo IS 'pago_vencido | pago_proximo | comision_disponible | sistema';
COMMENT ON COLUMN notificaciones.metadata IS 'Datos extras en JSON: {poliza_id, pago_id, monto, etc.}';

-- FIN MIGRACIÓN FASE 6 SQUASH
