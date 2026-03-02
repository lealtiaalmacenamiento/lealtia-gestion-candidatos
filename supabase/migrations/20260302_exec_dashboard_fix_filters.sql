-- =============================================================================
-- FIX: rpc_exec_kpis — filtrar por periodo + reemplazar pipeline_value
--      con conteo de prospectos por estado
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
  v_desde date := COALESCE(p_desde, date_trunc('month', CURRENT_DATE)::date);
  v_hasta date := COALESCE(p_hasta, CURRENT_DATE);

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
  v_dias_mes           int;
  v_dias_trans         int;
  v_ingreso_mes        numeric := 0;
  v_proyeccion         numeric := 0;

  -- Prospectos por estado (filtrados por periodo)
  v_prospectos_pendiente   bigint := 0;
  v_prospectos_seguimiento bigint := 0;
  v_prospectos_con_cita    bigint := 0;
  v_prospectos_descartado  bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

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

  -- INGRESO: pólizas dadas de alta en el periodo
  SELECT COALESCE(SUM(p.prima_mxn), 0) INTO v_ingreso_mxn
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus    = 'EN_VIGOR'
    AND p.anulada_at  IS NULL
    AND p.fecha_alta_sistema::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  -- PÓLIZAS ACTIVAS emitidas en el periodo
  SELECT COUNT(*) INTO v_polizas_activas
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus    = 'EN_VIGOR'
    AND p.anulada_at  IS NULL
    AND p.fecha_alta_sistema::date BETWEEN v_desde AND v_hasta
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

  -- PROYECCIÓN LINEAL AL FIN DE MES (siempre sobre mes actual)
  v_dias_mes   := EXTRACT(DAY FROM
                    (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::int;
  v_dias_trans := EXTRACT(DAY FROM CURRENT_DATE)::int;

  SELECT COALESCE(SUM(p.prima_mxn), 0) INTO v_ingreso_mes
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus    = 'EN_VIGOR'
    AND p.anulada_at  IS NULL
    AND p.fecha_alta_sistema::date
          BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  IF v_dias_trans > 0 THEN
    v_proyeccion := ROUND((v_ingreso_mes / v_dias_trans) * v_dias_mes, 2);
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
    'dias_transcurridos',      v_dias_trans,
    'dias_mes',                v_dias_mes,
    'prospectos_pendiente',    v_prospectos_pendiente,
    'prospectos_seguimiento',  v_prospectos_seguimiento,
    'prospectos_con_cita',     v_prospectos_con_cita,
    'prospectos_descartado',   v_prospectos_descartado
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_kpis(date, date, uuid) IS
  'KPIs del Dashboard Ejecutivo. Todos los conteos filtrados por periodo p_desde/p_hasta. '
  'Reemplaza pipeline_value con conteo de prospectos por estado.';
