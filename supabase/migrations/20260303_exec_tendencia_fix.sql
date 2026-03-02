-- =============================================================================
-- FIX: rpc_exec_tendencia
--   1. CURRENT_DATE → CDMX (America/Mexico_City)
--   2. polizas_mes: fecha_alta_sistema → fecha_emision
--   3. ingreso_emitido: prima_mxn de polizas → monto_pagado de poliza_pagos_mensuales
--      agrupado por mes de fecha_pago_real donde estado = 'pagado'
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_tendencia(
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
  v_today_cdmx date := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde date;
  v_hasta date;
BEGIN
  v_desde := COALESCE(p_desde, (v_today_cdmx - interval '11 months')::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    WITH meses AS (
      SELECT generate_series(
        date_trunc('month', v_desde),
        date_trunc('month', v_hasta),
        interval '1 month'
      )::date AS mes
    ),
    candidatos_mes AS (
      SELECT
        date_trunc('month', c.fecha_de_creacion)::date AS mes,
        COUNT(*)                                        AS nuevos_candidatos
      FROM candidatos c
      LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
      WHERE c.eliminado = false
        AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
      GROUP BY date_trunc('month', c.fecha_de_creacion)
    ),
    ganados_mes AS (
      SELECT
        date_trunc('month', c.fecha_creacion_ct)::date AS mes,
        COUNT(*)                                        AS ganados
      FROM candidatos c
      LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
      WHERE c.eliminado = false
        AND c.fecha_creacion_ct BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
      GROUP BY date_trunc('month', c.fecha_creacion_ct)
    ),
    polizas_mes AS (
      -- Pólizas agrupadas por mes de fecha_emision (no fecha_alta_sistema)
      SELECT
        date_trunc('month', p.fecha_emision)::date AS mes,
        COUNT(*)                                    AS polizas_emitidas
      FROM polizas p
      INNER JOIN clientes cl ON p.cliente_id = cl.id
      WHERE p.fecha_emision BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
      GROUP BY date_trunc('month', p.fecha_emision)
    ),
    ingresos_mes AS (
      -- Ingreso real = pagos cobrados agrupados por mes de fecha_pago_real
      SELECT
        date_trunc('month', pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::date AS mes,
        COALESCE(SUM(pp.monto_pagado), 0)                                                 AS ingreso_emitido
      FROM poliza_pagos_mensuales pp
      INNER JOIN polizas   p  ON pp.poliza_id = p.id
      INNER JOIN clientes cl  ON p.cliente_id  = cl.id
      WHERE pp.estado = 'pagado'
        AND (pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::date BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
      GROUP BY date_trunc('month', pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'mes',               TO_CHAR(m.mes, 'YYYY-MM'),
          'mes_label',         TO_CHAR(m.mes, 'Mon YY'),
          'nuevos_candidatos', COALESCE(cm.nuevos_candidatos, 0),
          'ganados',           COALESCE(gm.ganados, 0),
          'polizas_emitidas',  COALESCE(pm.polizas_emitidas, 0),
          'ingreso_emitido',   COALESCE(im.ingreso_emitido, 0)
        )
        ORDER BY m.mes
      ),
      '[]'::jsonb
    )
    FROM meses m
    LEFT JOIN candidatos_mes cm ON cm.mes = m.mes
    LEFT JOIN ganados_mes    gm ON gm.mes = m.mes
    LEFT JOIN polizas_mes    pm ON pm.mes = m.mes
    LEFT JOIN ingresos_mes   im ON im.mes = m.mes
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_tendencia(date, date, uuid) IS
  'Serie temporal mensual: candidatos nuevos, ganados, pólizas (por fecha_emision), '
  'ingreso cobrado (monto_pagado de poliza_pagos_mensuales estado=pagado, por fecha_pago_real CDMX).';
