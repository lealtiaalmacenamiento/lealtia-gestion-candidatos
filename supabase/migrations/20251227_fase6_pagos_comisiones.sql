-- Fase 6: Pagos mensuales y comisiones de pólizas
-- Fecha: 2025-12-27
-- Descripción: Registro de pagos mensuales, alertas de vencimiento, y dashboard de comisiones

-- =======================
-- 1. MODIFICAR ENUM periodicidad_pago
-- =======================
-- Cambiar de códigos cortos ('A','S','T','M') a valores legibles

-- Paso 1: Guardar definición de vista polizas_ui
DO $$ 
DECLARE
  view_def text;
BEGIN
  SELECT pg_get_viewdef('polizas_ui', true) INTO view_def;
  RAISE NOTICE 'Guardada definición de polizas_ui';
END $$;

-- Paso 2: Dropear vista que depende de periodicidad_pago
DROP VIEW IF EXISTS polizas_ui CASCADE;

-- Paso 3: Renombrar enum actual
ALTER TYPE periodicidad_pago RENAME TO periodicidad_pago_old;

-- Paso 4: Crear nuevo enum con valores legibles
CREATE TYPE periodicidad_pago AS ENUM ('mensual', 'trimestral', 'semestral', 'anual');

-- Paso 5: Actualizar columna con conversión de valores
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

-- Paso 6: Eliminar enum antiguo
DROP TYPE periodicidad_pago_old;

-- Paso 7: Recrear vista polizas_ui con nuevo enum
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
-- 2. AGREGAR CAMPOS FALTANTES A polizas
-- =======================
ALTER TABLE polizas 
  ADD COLUMN IF NOT EXISTS fecha_limite_pago date;

COMMENT ON COLUMN polizas.fecha_limite_pago IS 'Fecha límite general para pagos (se puede sobrescribir por periodo)';

-- Índice para búsquedas por fecha límite
CREATE INDEX IF NOT EXISTS idx_polizas_fecha_limite_pago 
  ON polizas(fecha_limite_pago) 
  WHERE fecha_limite_pago IS NOT NULL;

-- =======================
-- 3. CREAR ENUM poliza_pago_estado
-- =======================
CREATE TYPE poliza_pago_estado AS ENUM ('pendiente', 'pagado', 'vencido', 'omitido');

COMMENT ON TYPE poliza_pago_estado IS 'Estados de pago: pendiente (no pagado aún), pagado (confirmado), vencido (pasó fecha límite), omitido (no aplica)';

-- =======================
-- 4. CREAR TABLA poliza_pagos_mensuales
-- =======================
CREATE TABLE poliza_pagos_mensuales (
  id bigserial PRIMARY KEY,
  poliza_id uuid NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  periodo_mes date NOT NULL,  -- Primer día del mes (ej: '2025-01-01')
  fecha_programada date NOT NULL,  -- Fecha esperada de pago según periodicidad
  fecha_limite date NOT NULL,  -- Fecha límite para pagar (editable)
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

-- Índices para rendimiento
CREATE INDEX idx_poliza_pagos_poliza_id ON poliza_pagos_mensuales(poliza_id);
CREATE INDEX idx_poliza_pagos_estado ON poliza_pagos_mensuales(estado);
CREATE INDEX idx_poliza_pagos_fecha_limite ON poliza_pagos_mensuales(fecha_limite);
CREATE INDEX idx_poliza_pagos_periodo_mes ON poliza_pagos_mensuales(periodo_mes);

-- Índice compuesto para alertas (pagos vencidos o próximos)
CREATE INDEX idx_poliza_pagos_alertas 
  ON poliza_pagos_mensuales(estado, fecha_limite) 
  WHERE estado = 'pendiente';

COMMENT ON TABLE poliza_pagos_mensuales IS 'Registro de pagos programados y realizados por póliza y periodo';
COMMENT ON COLUMN poliza_pagos_mensuales.periodo_mes IS 'Primer día del mes al que corresponde el pago';
COMMENT ON COLUMN poliza_pagos_mensuales.monto_programado IS 'Monto esperado según prima anual / periodicidad';

-- Trigger para updated_at
CREATE TRIGGER trg_poliza_pagos_set_updated_at
  BEFORE UPDATE ON poliza_pagos_mensuales
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- =======================
-- 5. FUNCIÓN: Generar pagos programados
-- =======================
CREATE OR REPLACE FUNCTION fn_generar_pagos_programados()
RETURNS TRIGGER AS $$
DECLARE
  v_divisor integer;
  v_monto_periodo numeric(14,2);
  v_meses_entre_pagos integer;
  v_fecha_primer_pago date;
  v_fecha_limite date;
  v_periodo date;
  v_contador integer := 0;
  v_max_periodos integer := 12; -- Máximo periodos a generar (1 año)
BEGIN
  -- Solo generar si tiene periodicidad y prima
  IF NEW.periodicidad_pago IS NULL OR NEW.prima_mxn IS NULL OR NEW.prima_mxn <= 0 THEN
    RETURN NEW;
  END IF;

  -- Determinar divisor y meses entre pagos según periodicidad
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
      RETURN NEW; -- Periodicidad desconocida
  END CASE;

  -- Calcular monto por periodo
  v_monto_periodo := ROUND(NEW.prima_mxn / v_divisor, 2);

  -- Fecha de primer pago: usar dia_pago o día 1 del mes de emisión
  v_fecha_primer_pago := DATE_TRUNC('month', NEW.fecha_emision)::date 
    + INTERVAL '1 month' * (CASE WHEN NEW.dia_pago IS NOT NULL THEN NEW.dia_pago - 1 ELSE 0 END);

  -- Fecha límite: usar fecha_limite_pago de póliza o último día del mes
  v_fecha_limite := COALESCE(
    NEW.fecha_limite_pago,
    (DATE_TRUNC('month', v_fecha_primer_pago) + INTERVAL '1 month - 1 day')::date
  );

  -- Eliminar pagos pendientes existentes (no tocar pagados/vencidos/omitidos)
  DELETE FROM poliza_pagos_mensuales 
  WHERE poliza_id = NEW.id 
    AND estado = 'pendiente';

  -- Generar periodos
  v_periodo := DATE_TRUNC('month', v_fecha_primer_pago)::date;
  
  WHILE v_contador < v_max_periodos LOOP
    -- Insertar pago programado
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
      v_fecha_primer_pago + (v_contador * v_meses_entre_pagos || ' months')::interval,
      v_fecha_limite + (v_contador * v_meses_entre_pagos || ' months')::interval,
      v_monto_periodo,
      'pendiente',
      NEW.creado_por
    )
    ON CONFLICT (poliza_id, periodo_mes) DO NOTHING; -- Por si ya existe

    v_contador := v_contador + 1;
    
    -- Avanzar periodo según periodicidad
    EXIT WHEN v_contador >= v_divisor; -- Solo generar los periodos según periodicidad
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_generar_pagos_programados() IS 'Genera pagos programados al insertar/actualizar póliza. Solo elimina/regenera pagos pendientes.';

-- =======================
-- 6. TRIGGER: Generar pagos al crear/modificar póliza
-- =======================
CREATE TRIGGER trg_polizas_generar_pagos
  AFTER INSERT OR UPDATE OF periodicidad_pago, fecha_limite_pago, prima_mxn, fecha_emision, dia_pago
  ON polizas
  FOR EACH ROW
  WHEN (NEW.periodicidad_pago IS NOT NULL)
  EXECUTE FUNCTION fn_generar_pagos_programados();

COMMENT ON TRIGGER trg_polizas_generar_pagos ON polizas IS 'Regenera pagos programados cuando cambian datos relevantes de la póliza';

-- =======================
-- 7. FUNCIÓN: Actualizar pagos vencidos (para cron)
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

COMMENT ON FUNCTION fn_actualizar_pagos_vencidos() IS 'Marca como vencidos los pagos pendientes que pasaron su fecha límite. Usar desde Edge Function o cron.';

GRANT EXECUTE ON FUNCTION fn_actualizar_pagos_vencidos() TO service_role;

-- =======================
-- 8. VISTAS: Dashboard de comisiones
-- =======================

-- Vista: Agentes con mes de conexión
CREATE OR REPLACE VIEW vw_agentes_con_mes_conexion AS
SELECT 
  u.id as usuario_id,
  u.id_auth,
  u.email,
  u.nombre as agente_nombre,
  c.mes_conexion,
  c.candidato,
  c.efc
FROM usuarios u
INNER JOIN candidatos c ON LOWER(c.email_agente) = LOWER(u.email)
WHERE u.rol = 'agente' 
  AND u.activo = true
  AND c.eliminado = false
  AND c.mes_conexion IS NOT NULL;

COMMENT ON VIEW vw_agentes_con_mes_conexion IS 'Agentes que tienen mes de conexión registrado en candidatos';

-- Vista: Agentes sin mes de conexión
CREATE OR REPLACE VIEW vw_agentes_sin_mes_conexion AS
SELECT 
  u.id as usuario_id,
  u.id_auth,
  u.email,
  u.nombre as agente_nombre
FROM usuarios u
WHERE u.rol = 'agente' 
  AND u.activo = true
  AND NOT EXISTS (
    SELECT 1 
    FROM candidatos c 
    WHERE LOWER(c.email_agente) = LOWER(u.email)
      AND c.eliminado = false
      AND c.mes_conexion IS NOT NULL
  );

COMMENT ON VIEW vw_agentes_sin_mes_conexion IS 'Agentes que NO tienen mes de conexión en candidatos';

-- Vista: Comisiones por agente y mes
CREATE OR REPLACE VIEW vw_comisiones_agente_mes AS
SELECT 
  cl.asesor_id,
  u.id as usuario_id,
  u.nombre as agente_nombre,
  u.email as agente_email,
  DATE_TRUNC('month', p.fecha_emision)::date as mes_emision,
  TO_CHAR(DATE_TRUNC('month', p.fecha_emision), 'YYYY-MM') as periodo,
  COUNT(DISTINCT p.id) as total_polizas,
  SUM(p.prima_mxn) as prima_total,
  -- Usar base_factor del cache (porcentaje real de comisión por póliza)
  SUM(p.prima_mxn * COALESCE(ppc.base_factor, 0) / 100) as comision_estimada,
  SUM(
    CASE 
      WHEN p.estatus = 'EN_VIGOR' 
      THEN p.prima_mxn * COALESCE(ppc.base_factor, 0) / 100 
      ELSE 0 
    END
  ) as comision_vigente
FROM polizas p
INNER JOIN clientes cl ON p.cliente_id = cl.id
INNER JOIN usuarios u ON cl.asesor_id = u.id_auth
LEFT JOIN poliza_puntos_cache ppc ON p.id = ppc.poliza_id
WHERE p.anulada_at IS NULL
  AND u.rol = 'agente'
  AND u.activo = true
GROUP BY cl.asesor_id, u.id, u.nombre, u.email, DATE_TRUNC('month', p.fecha_emision);

COMMENT ON VIEW vw_comisiones_agente_mes IS 'Comisiones agregadas por agente y mes, usando base_factor real de cada póliza';

-- Vista: Dashboard comisiones CON mes de conexión
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

COMMENT ON VIEW vw_dashboard_comisiones_con_conexion IS 'Dashboard: Comisiones de agentes CON mes de conexión';

-- Vista: Dashboard comisiones SIN mes de conexión
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

COMMENT ON VIEW vw_dashboard_comisiones_sin_conexion IS 'Dashboard: Comisiones de agentes SIN mes de conexión';

-- Vista: Comisión del mes actual por agente
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
WHERE u.rol = 'agente' 
  AND u.activo = true
GROUP BY u.id_auth, u.id, u.nombre, u.email;

COMMENT ON VIEW vw_agente_comision_mes_actual IS 'Resumen de pagos y comisiones del mes actual por agente';

-- =======================
-- 9. RLS POLICIES
-- =======================

ALTER TABLE poliza_pagos_mensuales ENABLE ROW LEVEL SECURITY;

-- Policy: SELECT para agentes (solo sus pólizas) y supervisores (todas)
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

-- Policy: UPDATE para agentes (sus pólizas) y supervisores (todas)
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

-- Policy: INSERT automático solo desde triggers (service_role)
-- No crear policy INSERT para usuarios normales

-- Permisos para vistas
GRANT SELECT ON vw_agentes_con_mes_conexion TO authenticated;
GRANT SELECT ON vw_agentes_sin_mes_conexion TO authenticated;
GRANT SELECT ON vw_comisiones_agente_mes TO authenticated;
GRANT SELECT ON vw_dashboard_comisiones_con_conexion TO authenticated;
GRANT SELECT ON vw_dashboard_comisiones_sin_conexion TO authenticated;
GRANT SELECT ON vw_agente_comision_mes_actual TO authenticated;

-- =======================
-- 10. ÍNDICES ADICIONALES RECOMENDADOS
-- =======================

-- Para búsquedas frecuentes en dashboard de comisiones
CREATE INDEX IF NOT EXISTS idx_candidatos_mes_conexion 
  ON candidatos(mes_conexion) 
  WHERE mes_conexion IS NOT NULL AND eliminado = false;

CREATE INDEX IF NOT EXISTS idx_poliza_puntos_cache_poliza_base 
  ON poliza_puntos_cache(poliza_id, base_factor)
  WHERE base_factor IS NOT NULL;

-- Para joins en vistas de comisiones
CREATE INDEX IF NOT EXISTS idx_clientes_asesor_activo 
  ON clientes(asesor_id, activo) 
  WHERE asesor_id IS NOT NULL;

-- =======================
-- FIN MIGRACIÓN FASE 6
-- =======================
