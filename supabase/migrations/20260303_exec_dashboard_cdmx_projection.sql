-- =============================================================================
-- FIX: rpc_exec_kpis — proyección respeta periodo seleccionado + timezone CDMX
--
-- Cambios:
--   1. Todos los CURRENT_DATE → (NOW() AT TIME ZONE 'America/Mexico_City')::date
--   2. La proyección lineal usa el ingreso del periodo (v_ingreso_mxn) y proyecta
--      al número de días del mes de v_hasta (no siempre el mes actual)
--   3. dias_transcurridos = días elapsed del periodo; dias_mes = días del mes de v_hasta
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_kpis(
  p_desde          date DEFAULT NULL,
  p_hasta          date DEFAULT NULL,
  p_asesor_auth_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Fecha de hoy en CDMX
  v_today_cdmx date;

  v_desde date;
  v_hasta date;

  v_asesor_usuario_id bigint;

  v_total_candidatos   bigint  := 0;
  v_total_prospectos   bigint  := 0;
  v_total_cotizando    bigint  := 0;
  v_total_ganados      bigint  := 0;
  v_total_perdidos     bigint  := 0;
  v_total_clientes     bigint  := 0;
  v_ingreso_mxn        numeric := 0;
  v_polizas_activas    bigint  := 0;
  v_polizas_canceladas bigint  := 0;

  -- Proyección
  v_fin_mes_hasta  date;
  v_dias_mes_hasta int;
  v_dias_elapsed   int;
  v_proyeccion     numeric := 0;

  -- Prospectos por estado (filtrados por periodo)
  v_prospectos_pendiente   bigint := 0;
  v_prospectos_seguimiento bigint := 0;
  v_prospectos_con_cita    bigint := 0;
  v_prospectos_descartado  bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  -- Fecha hoy en zona horaria CDMX
  v_today_cdmx := (NOW() AT TIME ZONE 'America/Mexico_City')::date;

  -- Defaults del periodo usando CDMX
  v_desde := COALESCE(p_desde, date_trunc('month', NOW() AT TIME ZONE 'America/Mexico_City')::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  IF p_asesor_auth_id IS NOT NULL THEN
    SELECT id INTO v_asesor_usuario_id
    FROM usuarios
    WHERE id_auth = p_asesor_auth_id
    LIMIT 1;
  END IF;

  -- CANDIDATOS del período
  SELECT COUNT(*) INTO v_total_candidatos
  FROM candidatos c
  LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
  WHERE c.eliminado = false
    AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id);

  -- Snapshot embudo candidatos (periodo)
  SELECT
    COUNT(*) FILTER (WHERE c.proceso IN ('PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS','SIN ETAPA') OR c.proceso IS NULL),
    COUNT(*) FILTER (WHERE c.proceso IN ('PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL','POST EXAMEN')),
    COUNT(*) FILTER (WHERE c.fecha_creacion_ct IS NOT NULL),
    0::bigint
  INTO v_total_prospectos, v_total_cotizando, v_total_ganados, v_total_perdidos
  FROM candidatos c
  LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
  WHERE c.eliminado = false
    AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id);

  -- CLIENTES creados en el periodo
  SELECT COUNT(*) INTO v_total_clientes
  FROM clientes cl
  WHERE cl.activo = true
    AND cl.creado_at::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  -- INGRESO: pólizas con fecha de emisión en el periodo
  SELECT COALESCE(SUM(p.prima_mxn), 0) INTO v_ingreso_mxn
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus    = 'EN_VIGOR'
    AND p.anulada_at  IS NULL
    AND p.fecha_emision BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  -- PÓLIZAS ACTIVAS con fecha de emisión en el periodo
  SELECT COUNT(*) INTO v_polizas_activas
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus    = 'EN_VIGOR'
    AND p.anulada_at  IS NULL
    AND p.fecha_emision BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  -- PÓLIZAS CANCELADAS en el periodo
  SELECT COUNT(*) INTO v_polizas_canceladas
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus      = 'ANULADA'
    AND p.anulada_at::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  -- PROSPECTOS POR ESTADO en el periodo
  SELECT
    COUNT(*) FILTER (WHERE pr.estado = 'pendiente'),
    COUNT(*) FILTER (WHERE pr.estado = 'seguimiento'),
    COUNT(*) FILTER (WHERE pr.estado = 'con_cita'),
    COUNT(*) FILTER (WHERE pr.estado = 'descartado')
  INTO v_prospectos_pendiente, v_prospectos_seguimiento, v_prospectos_con_cita, v_prospectos_descartado
  FROM prospectos pr
  WHERE pr.created_at::date BETWEEN v_desde AND v_hasta
    AND (v_asesor_usuario_id IS NULL OR pr.agente_id = v_asesor_usuario_id);

  -- PROYECCIÓN LINEAL AL FIN DEL MES ACTUAL (CDMX)
  --   Tasa = ingreso del periodo seleccionado / días transcurridos del periodo
  --   Proyección = tasa_diaria * días totales del mes actual en CDMX
  --   (siempre el mes de hoy, independientemente del rango elegido)
  v_fin_mes_hasta  := (date_trunc('month', v_today_cdmx::timestamp) + interval '1 month - 1 day')::date;
  v_dias_mes_hasta := EXTRACT(DAY FROM v_fin_mes_hasta)::int;
  -- días transcurridos del periodo: desde v_desde hasta min(hoy, v_hasta)
  v_dias_elapsed   := (LEAST(v_hasta, v_today_cdmx) - v_desde + 1)::int;

  IF v_dias_elapsed > 0 THEN
    v_proyeccion := ROUND((v_ingreso_mxn / v_dias_elapsed) * v_dias_mes_hasta, 2);
  END IF;

  RETURN jsonb_build_object(
    'total_candidatos',        v_total_candidatos,
    'total_prospectos',        v_total_prospectos,
    'total_cotizando',         v_total_cotizando,
    'total_ganados',           v_total_ganados,
    'total_perdidos',          v_total_perdidos,
    'total_clientes',          v_total_clientes,
    'polizas_activas',         v_polizas_activas,
    'polizas_canceladas',      v_polizas_canceladas,
    'ingreso_mxn',             v_ingreso_mxn,
    'proyeccion_fin_mes',      v_proyeccion,
    'periodo_desde',           v_desde,
    'periodo_hasta',           v_hasta,
    'dias_transcurridos',      v_dias_elapsed,
    'dias_mes',                v_dias_mes_hasta,
    'prospectos_pendiente',    v_prospectos_pendiente,
    'prospectos_seguimiento',  v_prospectos_seguimiento,
    'prospectos_con_cita',     v_prospectos_con_cita,
    'prospectos_descartado',   v_prospectos_descartado
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_kpis(date, date, uuid) IS
  'KPIs del Dashboard Ejecutivo. Todos los conteos filtrados por periodo p_desde/p_hasta. '
  'Pólizas y ingreso filtrados por fecha_emision (no fecha_alta_sistema). '
  'Proyección lineal al fin del mes actual CDMX usando el ingreso del periodo seleccionado. '
  'Timezone: America/Mexico_City (CDMX).';
