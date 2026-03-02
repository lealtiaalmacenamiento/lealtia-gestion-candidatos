-- =============================================================================
-- rpc_exec_tendencia: agregar parámetro p_granularity ('day' | 'month' | 'year')
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_tendencia(
  p_desde          date    DEFAULT NULL,
  p_hasta          date    DEFAULT NULL,
  p_asesor_auth_id uuid    DEFAULT NULL,
  p_granularity    text    DEFAULT 'month'   -- 'day' | 'month' | 'year'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_cdmx  date := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde       date;
  v_hasta       date;
  v_gran        text;
  v_interval    interval;
  v_label_fmt   text;
BEGIN
  v_desde := COALESCE(p_desde, (v_today_cdmx - interval '11 months')::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  -- Normalizar granularidad
  v_gran := CASE p_granularity
    WHEN 'day'   THEN 'day'
    WHEN 'year'  THEN 'year'
    ELSE              'month'
  END;

  v_interval  := CASE v_gran WHEN 'day' THEN interval '1 day'  WHEN 'year' THEN interval '1 year'  ELSE interval '1 month' END;
  v_label_fmt := CASE v_gran WHEN 'day' THEN 'DD Mon'          WHEN 'year' THEN 'YYYY'              ELSE 'Mon YY'           END;

  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    WITH periodos AS (
      SELECT generate_series(
        date_trunc(v_gran, v_desde::timestamp),
        date_trunc(v_gran, v_hasta::timestamp),
        v_interval
      )::date AS periodo
    ),
    candidatos_p AS (
      SELECT
        date_trunc(v_gran, c.fecha_de_creacion::timestamp)::date AS periodo,
        COUNT(*)                                                   AS nuevos_candidatos
      FROM candidatos c
      LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
      WHERE c.eliminado = false
        AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
      GROUP BY date_trunc(v_gran, c.fecha_de_creacion::timestamp)
    ),
    ganados_p AS (
      SELECT
        date_trunc(v_gran, c.fecha_creacion_ct::timestamp)::date AS periodo,
        COUNT(*)                                                   AS ganados
      FROM candidatos c
      LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
      WHERE c.eliminado = false
        AND c.fecha_creacion_ct BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
      GROUP BY date_trunc(v_gran, c.fecha_creacion_ct::timestamp)
    ),
    polizas_p AS (
      SELECT
        date_trunc(v_gran, p.fecha_emision::timestamp)::date AS periodo,
        COUNT(*)                                              AS polizas_emitidas
      FROM polizas p
      INNER JOIN clientes cl ON p.cliente_id = cl.id
      WHERE p.fecha_emision BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
      GROUP BY date_trunc(v_gran, p.fecha_emision::timestamp)
    ),
    ingresos_p AS (
      SELECT
        date_trunc(v_gran, (pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::timestamp)::date AS periodo,
        COALESCE(SUM(pp.monto_pagado), 0)                                                             AS ingreso_emitido
      FROM poliza_pagos_mensuales pp
      INNER JOIN polizas   p  ON pp.poliza_id = p.id
      INNER JOIN clientes cl  ON p.cliente_id  = cl.id
      WHERE pp.estado = 'pagado'
        AND (pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::date BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
      GROUP BY date_trunc(v_gran, (pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::timestamp)
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'mes',               TO_CHAR(p.periodo, 'YYYY-MM-DD'),
          'mes_label',         TO_CHAR(p.periodo, v_label_fmt),
          'nuevos_candidatos', COALESCE(cp.nuevos_candidatos, 0),
          'ganados',           COALESCE(gp.ganados, 0),
          'polizas_emitidas',  COALESCE(pp2.polizas_emitidas, 0),
          'ingreso_emitido',   COALESCE(ip.ingreso_emitido, 0)
        )
        ORDER BY p.periodo
      ),
      '[]'::jsonb
    )
    FROM periodos p
    LEFT JOIN candidatos_p cp  ON cp.periodo  = p.periodo
    LEFT JOIN ganados_p    gp  ON gp.periodo  = p.periodo
    LEFT JOIN polizas_p    pp2 ON pp2.periodo = p.periodo
    LEFT JOIN ingresos_p   ip  ON ip.periodo  = p.periodo
  );
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_exec_tendencia(date, date, uuid, text) TO authenticated;

COMMENT ON FUNCTION rpc_exec_tendencia(date, date, uuid, text) IS
  'Serie temporal con granularidad configurable (day/month/year). '
  'Ingreso cobrado = monto_pagado de poliza_pagos_mensuales estado=pagado. '
  'Pólizas por fecha_emision. Timezone CDMX.';
