-- =============================================================================
-- LEALTIA GESTION CANDIDATOS — EXECUTIVE DASHBOARD (CONSOLIDADO)
-- Consolida todas las migraciones del dashboard ejecutivo:
--   20260228, 20260302, 20260303_*, 20260317_*
-- Contiene la versión FINAL de cada función RPC.
-- =============================================================================
-- TABLAS FUENTE:
--   candidatos  — embudo CRM agentes (fases registro→agente)
--   prospectos  — trabajo semanal asesor (clientes potenciales)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. COLUMNAS ADICIONALES
-- =============================================================================

ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS motivo_descarte text;

COMMENT ON COLUMN prospectos.motivo_descarte IS
  'Razón de descarte cuando estado = ''descartado'': '
  'precio, competencia, sin_interes, sin_respuesta, otro, etc.';

-- =============================================================================
-- 2. VISTA: vw_exec_asesores_base
-- =============================================================================

CREATE OR REPLACE VIEW vw_exec_asesores_base AS
SELECT
  u.id          AS usuario_id,
  u.id_auth     AS asesor_auth_id,
  u.email,
  u.nombre,
  u.rol
FROM usuarios u
WHERE u.activo = true
  AND u.rol IN ('agente', 'supervisor');

COMMENT ON VIEW vw_exec_asesores_base IS
  'Vista de asesores activos para filtros del Dashboard Ejecutivo.';

-- =============================================================================
-- 3. rpc_exec_asesores_list
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_asesores_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'usuario_id',     u.usuario_id,
          'asesor_auth_id', u.asesor_auth_id,
          'nombre',         u.nombre,
          'email',          u.email,
          'rol',            u.rol
        )
        ORDER BY u.nombre
      ),
      '[]'::jsonb
    )
    FROM vw_exec_asesores_base u
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_asesores_list() IS
  'Lista de agentes/supervisores activos para el selector de filtros del Dashboard Ejecutivo.';

-- =============================================================================
-- 4. rpc_exec_kpis
--    Ingreso = monto_pagado de poliza_pagos_mensuales (estado=pagado, fecha_pago_real en periodo)
--    Pólizas activas/canceladas filtradas por fecha_emision/anulada_at del periodo
--    Proyección lineal CDMX al fin del mes actual
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
  v_today_cdmx date;
  v_desde      date;
  v_hasta      date;

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

  v_fin_mes_hasta  date;
  v_dias_mes_hasta int;
  v_dias_elapsed   int;
  v_proyeccion     numeric := 0;

  v_prospectos_pendiente   bigint := 0;
  v_prospectos_seguimiento bigint := 0;
  v_prospectos_con_cita    bigint := 0;
  v_prospectos_descartado  bigint := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  v_today_cdmx := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde := COALESCE(p_desde, date_trunc('month', NOW() AT TIME ZONE 'America/Mexico_City')::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  IF p_asesor_auth_id IS NOT NULL THEN
    SELECT id INTO v_asesor_usuario_id FROM usuarios
    WHERE id_auth = p_asesor_auth_id LIMIT 1;
  END IF;

  SELECT COUNT(*) INTO v_total_candidatos
  FROM candidatos c
  LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
  WHERE c.eliminado = false
    AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id);

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

  SELECT COUNT(*) INTO v_total_clientes
  FROM clientes cl
  WHERE cl.activo = true
    AND cl.creado_at::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  SELECT COALESCE(SUM(pp.monto_pagado), 0) INTO v_ingreso_mxn
  FROM poliza_pagos_mensuales pp
  INNER JOIN polizas p   ON pp.poliza_id = p.id
  INNER JOIN clientes cl ON p.cliente_id  = cl.id
  WHERE pp.estado = 'pagado'
    AND pp.fecha_pago_real::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  SELECT COUNT(*) INTO v_polizas_activas
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus    = 'EN_VIGOR'
    AND p.anulada_at  IS NULL
    AND p.fecha_emision BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  SELECT COUNT(*) INTO v_polizas_canceladas
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus       = 'ANULADA'
    AND p.anulada_at::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  SELECT
    COUNT(*) FILTER (WHERE pr.estado = 'pendiente'),
    COUNT(*) FILTER (WHERE pr.estado = 'seguimiento'),
    COUNT(*) FILTER (WHERE pr.estado = 'con_cita'),
    COUNT(*) FILTER (WHERE pr.estado = 'descartado')
  INTO v_prospectos_pendiente, v_prospectos_seguimiento, v_prospectos_con_cita, v_prospectos_descartado
  FROM prospectos pr
  WHERE pr.created_at::date BETWEEN v_desde AND v_hasta
    AND (v_asesor_usuario_id IS NULL OR pr.agente_id = v_asesor_usuario_id);

  v_fin_mes_hasta  := (date_trunc('month', v_today_cdmx::timestamp) + interval '1 month - 1 day')::date;
  v_dias_mes_hasta := EXTRACT(DAY FROM v_fin_mes_hasta)::int;
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
  'KPIs del Dashboard Ejecutivo. Ingreso = monto_pagado (poliza_pagos_mensuales estado=pagado, fecha en periodo). '
  'Pólizas por fecha_emision/anulada_at del periodo. Proyección lineal CDMX al fin del mes actual.';

-- =============================================================================
-- 5. rpc_exec_tendencia  — serie temporal con granularidad day/month/year
--    Ingreso = monto_pagado de poliza_pagos_mensuales (estado=pagado)
--    Timezone CDMX
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_tendencia(
  p_desde          date DEFAULT NULL,
  p_hasta          date DEFAULT NULL,
  p_asesor_auth_id uuid DEFAULT NULL,
  p_granularity    text DEFAULT 'month'   -- 'day' | 'month' | 'year'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_cdmx date := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde      date;
  v_hasta      date;
  v_gran       text;
  v_interval   interval;
  v_label_fmt  text;
BEGIN
  v_desde := COALESCE(p_desde, (v_today_cdmx - interval '11 months')::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  v_gran := CASE p_granularity
    WHEN 'day'  THEN 'day'
    WHEN 'year' THEN 'year'
    ELSE             'month'
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
        COUNT(*) AS nuevos_candidatos
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
        COUNT(*) AS ganados
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
        COUNT(*) AS polizas_emitidas
      FROM polizas p
      INNER JOIN clientes cl ON p.cliente_id = cl.id
      WHERE p.fecha_emision BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
      GROUP BY date_trunc(v_gran, p.fecha_emision::timestamp)
    ),
    ingresos_p AS (
      SELECT
        date_trunc(v_gran, (pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::timestamp)::date AS periodo,
        COALESCE(SUM(pp.monto_pagado), 0) AS ingreso_emitido
      FROM poliza_pagos_mensuales pp
      INNER JOIN polizas  p  ON pp.poliza_id = p.id
      INNER JOIN clientes cl ON p.cliente_id  = cl.id
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

COMMENT ON FUNCTION rpc_exec_tendencia(date, date, uuid, text) IS
  'Serie temporal con granularidad configurable (day/month/year). '
  'Ingreso cobrado = monto_pagado de poliza_pagos_mensuales estado=pagado. '
  'Pólizas por fecha_emision. Timezone CDMX.';

-- =============================================================================
-- 6. rpc_exec_funnel
--    9 fases (igual que módulo candidatos). Sin filtro de periodo.
--    Solo filtra por asesor opcionalmente.
--    Elimina la sobrecarga antigua de 3 params (date,date,uuid).
-- =============================================================================

DROP FUNCTION IF EXISTS public.rpc_exec_funnel(date, date, uuid);

CREATE OR REPLACE FUNCTION rpc_exec_funnel(
  p_asesor_auth_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asesor_usuario_id bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  IF p_asesor_auth_id IS NOT NULL THEN
    SELECT id INTO v_asesor_usuario_id FROM usuarios
    WHERE id_auth = p_asesor_auth_id LIMIT 1;
  END IF;

  RETURN (
    WITH per_cand AS (
      SELECT
        CASE
          WHEN COALESCE((c.etapas_completadas->'periodo_para_registro_y_envio_de_documentos'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'capacitacion_cedula_a1'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'periodo_para_ingresar_folio_oficina_virtual'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'periodo_para_playbook'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'pre_escuela_sesion_unica_de_arranque'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'fecha_limite_para_presentar_curricula_cdp'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'inicio_escuela_fundamental'->>'completed')::bool, false)
            THEN 'agente'
          WHEN c.fecha_creacion_pop IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_creacion_pop'->>'completed')::bool, false)
            AND NOT COALESCE((c.etapas_completadas->'fecha_creacion_ct'->>'completed')::bool, false)
            THEN 'prospeccion'
          WHEN c.periodo_para_registro_y_envio_de_documentos IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_registro_y_envio_de_documentos'->>'completed')::bool, false)
            THEN 'registro'
          WHEN c.capacitacion_cedula_a1 IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'capacitacion_cedula_a1'->>'completed')::bool, false)
            THEN 'capacitacion_a1'
          WHEN c.fecha_tentativa_de_examen IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_tentativa_de_examen'->>'completed')::bool, false)
            THEN 'examen'
          WHEN c.periodo_para_ingresar_folio_oficina_virtual IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_ingresar_folio_oficina_virtual'->>'completed')::bool, false)
            THEN 'folio_ov'
          WHEN c.periodo_para_playbook IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_playbook'->>'completed')::bool, false)
            THEN 'playbook'
          WHEN c.pre_escuela_sesion_unica_de_arranque IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'pre_escuela_sesion_unica_de_arranque'->>'completed')::bool, false)
            THEN 'pre_escuela'
          WHEN c.fecha_limite_para_presentar_curricula_cdp IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_limite_para_presentar_curricula_cdp'->>'completed')::bool, false)
            THEN 'curricula_cdp'
          WHEN c.inicio_escuela_fundamental IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'inicio_escuela_fundamental'->>'completed')::bool, false)
            THEN 'escuela_fundamental'
          ELSE 'prospeccion'
        END AS fase
      FROM candidatos c
      LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
      WHERE c.eliminado = false
        AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
    ),
    counts AS (
      SELECT fase, COUNT(*) AS cnt FROM per_cand GROUP BY fase
    ),
    phase_order(fase, orden, label) AS (
      VALUES
        ('prospeccion',         1, 'Prospección'),
        ('registro',            2, 'Registro y envío'),
        ('capacitacion_a1',     3, 'Capacitación A1'),
        ('examen',              4, 'Examen'),
        ('folio_ov',            5, 'Folio Oficina Virtual'),
        ('playbook',            6, 'Playbook'),
        ('pre_escuela',         7, 'Pre-escuela'),
        ('curricula_cdp',       8, 'Currícula CDP'),
        ('escuela_fundamental', 9, 'Escuela Fundamental'),
        ('agente',             10, 'Agente')
    ),
    total_cte AS (
      SELECT SUM(cnt)::numeric AS total FROM counts
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'key',        po.fase,
          'label',      po.label,
          'count',      COALESCE(cn.cnt, 0),
          'porcentaje', ROUND(COALESCE(cn.cnt, 0)::numeric / NULLIF(tc.total, 0) * 100, 1)
        )
        ORDER BY po.orden
      ),
      '[]'::jsonb
    )
    FROM phase_order po
    CROSS JOIN total_cte tc
    LEFT JOIN counts cn ON cn.fase = po.fase
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_funnel(uuid) IS
  'Embudo de candidatos con 9 fases (igual que módulo candidatos). Sin filtro de periodo — siempre muestra todos los candidatos activos. Filterable por asesor.';

-- =============================================================================
-- 7. rpc_exec_citas_stats — Timezone CDMX
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_citas_stats(
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
  v_desde := COALESCE(p_desde, date_trunc('month', v_today_cdmx::timestamp)::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total',       COUNT(*),
      'confirmadas', COUNT(*) FILTER (WHERE estado = 'confirmada'),
      'canceladas',  COUNT(*) FILTER (WHERE estado = 'cancelada'),
      'completadas', COUNT(*) FILTER (WHERE estado = 'confirmada' AND fin  < NOW()),
      'pendientes',  COUNT(*) FILTER (WHERE estado = 'confirmada' AND fin >= NOW()),
      'por_mes', (
        WITH meses AS (
          SELECT generate_series(
            date_trunc('month', v_desde::timestamp),
            date_trunc('month', v_hasta::timestamp),
            interval '1 month'
          )::date AS mes
        ),
        stats AS (
          SELECT
            date_trunc('month', ci2.inicio AT TIME ZONE 'America/Mexico_City')::date AS mes,
            COUNT(*)                                                                   AS total,
            COUNT(*) FILTER (WHERE ci2.estado = 'confirmada')                         AS confirmadas,
            COUNT(*) FILTER (WHERE ci2.estado = 'cancelada')                          AS canceladas,
            COUNT(*) FILTER (WHERE ci2.estado = 'confirmada' AND ci2.fin < NOW())     AS completadas
          FROM citas ci2
          WHERE (ci2.inicio AT TIME ZONE 'America/Mexico_City')::date BETWEEN v_desde AND v_hasta
            AND (p_asesor_auth_id IS NULL OR ci2.agente_id = p_asesor_auth_id)
          GROUP BY date_trunc('month', ci2.inicio AT TIME ZONE 'America/Mexico_City')
        )
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'mes',         TO_CHAR(m.mes, 'YYYY-MM'),
              'mes_label',   TO_CHAR(m.mes, 'Mon YY'),
              'total',       COALESCE(s.total,       0),
              'confirmadas', COALESCE(s.confirmadas, 0),
              'canceladas',  COALESCE(s.canceladas,  0),
              'completadas', COALESCE(s.completadas, 0)
            )
            ORDER BY m.mes
          ),
          '[]'::jsonb
        )
        FROM meses m
        LEFT JOIN stats s ON s.mes = m.mes
      )
    )
    FROM citas ci
    WHERE (ci.inicio AT TIME ZONE 'America/Mexico_City')::date BETWEEN v_desde AND v_hasta
      AND (p_asesor_auth_id IS NULL OR ci.agente_id = p_asesor_auth_id)
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_citas_stats(date, date, uuid) IS
  'Estadísticas de citas del periodo. Timezone CDMX.';

-- =============================================================================
-- 8. rpc_exec_sla_stats
--    Fuente: prospectos (clientes potenciales).
--    tiempo_primer_contacto_dias = avg(first_visit_at - created_at)
--    tiempo_cierre_dias          = avg(updated_at - created_at) para con_cita|descartado
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_exec_sla_stats(
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
  v_today_cdmx        date   := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde             date;
  v_hasta             date;
  v_asesor_usuario_id bigint;
BEGIN
  v_desde := COALESCE(p_desde, date_trunc('month', v_today_cdmx::timestamp)::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  IF p_asesor_auth_id IS NOT NULL THEN
    SELECT id INTO v_asesor_usuario_id FROM usuarios
    WHERE id_auth = p_asesor_auth_id LIMIT 1;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'tiempo_primer_contacto_dias',
        ROUND(
          AVG(
            CASE WHEN pr.first_visit_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (pr.first_visit_at - pr.created_at)) / 86400.0
            END
          )::numeric, 1
        ),
      'tiempo_cierre_dias',
        ROUND(
          AVG(
            CASE WHEN pr.estado IN ('con_cita', 'descartado') AND pr.updated_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (pr.updated_at - pr.created_at)) / 86400.0
            END
          )::numeric, 1
        ),
      'sin_primer_contacto',
        COUNT(*) FILTER (WHERE pr.first_visit_at IS NULL),
      'muestra_total',
        COUNT(*)
    )
    FROM prospectos pr
    WHERE pr.created_at::date BETWEEN v_desde AND v_hasta
      AND (v_asesor_usuario_id IS NULL OR pr.agente_id = v_asesor_usuario_id)
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_exec_sla_stats(date, date, uuid) IS
  'SLA de prospectos (clientes potenciales): días a primer contacto (first_visit_at) y días a cierre (con_cita|descartado). Filtrable por periodo y asesor.';

-- =============================================================================
-- 9. rpc_exec_motivos_descarte — Timezone CDMX
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_motivos_descarte(
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
  v_today_cdmx        date   := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde             date;
  v_hasta             date;
  v_asesor_usuario_id bigint;
BEGIN
  v_desde := COALESCE(p_desde, date_trunc('year', v_today_cdmx::timestamp)::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  IF p_asesor_auth_id IS NOT NULL THEN
    SELECT id INTO v_asesor_usuario_id FROM usuarios
    WHERE id_auth = p_asesor_auth_id LIMIT 1;
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('motivo', motivo_descarte, 'count', cnt)
        ORDER BY cnt DESC
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT
        COALESCE(pr.motivo_descarte, 'Sin especificar') AS motivo_descarte,
        COUNT(*) AS cnt
      FROM prospectos pr
      WHERE pr.estado = 'descartado'
        AND COALESCE(pr.updated_at, pr.created_at)::date BETWEEN v_desde AND v_hasta
        AND (v_asesor_usuario_id IS NULL OR pr.agente_id = v_asesor_usuario_id)
      GROUP BY COALESCE(pr.motivo_descarte, 'Sin especificar')
      ORDER BY cnt DESC
      LIMIT 10
    ) ranked
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_motivos_descarte(date, date, uuid) IS
  'Top 10 motivos de descarte de prospectos. Timezone CDMX.';

-- =============================================================================
-- 10. rpc_exec_polizas_por_tipo
--     Filtrada por fecha_emision del periodo. Timezone CDMX.
--     Mantiene sobrecarga de 1-arg (p_asesor_auth_id only) por compatibilidad.
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_polizas_por_tipo(
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
  v_desde := COALESCE(p_desde, date_trunc('month', v_today_cdmx::timestamp)::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    WITH agg AS (
      SELECT
        COALESCE(pp.tipo_producto::text, 'Sin tipo') AS tipo,
        COUNT(p.id)                                  AS cnt,
        COALESCE(SUM(p.prima_mxn), 0)               AS prima_total
      FROM polizas p
      INNER JOIN clientes cl            ON p.cliente_id           = cl.id
      LEFT  JOIN producto_parametros pp ON p.producto_parametro_id = pp.id
      WHERE p.estatus    = 'EN_VIGOR'
        AND p.anulada_at  IS NULL
        AND p.fecha_emision BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
      GROUP BY pp.tipo_producto
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'tipo',        tipo,
          'count',       cnt,
          'prima_total', prima_total
        )
        ORDER BY prima_total DESC
      ),
      '[]'::jsonb
    )
    FROM agg
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_polizas_por_tipo(date, date, uuid) IS
  'Pólizas EN_VIGOR por tipo, filtradas por fecha_emision del periodo. Timezone CDMX.';

-- =============================================================================
-- 11. rpc_exec_polizas_vencer — Timezone CDMX
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_polizas_vencer(
  p_dias_alerta    int  DEFAULT 60,
  p_asesor_auth_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_cdmx date := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'poliza_id',        p.id,
          'numero_poliza',    p.numero_poliza,
          'cliente',          cl.primer_nombre || ' ' || cl.primer_apellido,
          'asesor',           COALESCE(u.nombre, '—'),
          'fecha_renovacion', p.fecha_renovacion,
          'dias_restantes',   (p.fecha_renovacion - v_today_cdmx),
          'prima_mxn',        p.prima_mxn,
          'tipo_producto',    COALESCE(pp.tipo_producto::text, '—')
        )
        ORDER BY p.fecha_renovacion ASC
      ),
      '[]'::jsonb
    )
    FROM polizas p
    INNER JOIN clientes cl            ON p.cliente_id           = cl.id
    LEFT  JOIN usuarios u             ON cl.asesor_id           = u.id_auth
    LEFT  JOIN producto_parametros pp ON p.producto_parametro_id = pp.id
    WHERE p.estatus          = 'EN_VIGOR'
      AND p.fecha_renovacion  IS NOT NULL
      AND p.fecha_renovacion  BETWEEN v_today_cdmx AND (v_today_cdmx + p_dias_alerta)
      AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_polizas_vencer(int, uuid) IS
  'Pólizas próximas a vencer. Días calculados desde hoy CDMX.';

-- =============================================================================
-- 12. rpc_exec_top_asesores
--     Ingreso = cobrado real del periodo (poliza_pagos_mensuales estado=pagado)
--     Conv % sobre prospectos del periodo
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_exec_top_asesores(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_limit int  DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_cdmx date := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde date := COALESCE(p_desde, date_trunc('year', v_today_cdmx::timestamp)::date);
  v_hasta date := COALESCE(p_hasta, v_today_cdmx);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(row_data ORDER BY ingreso_cobrado DESC),
      '[]'::jsonb
    )
    FROM (
      SELECT
        jsonb_build_object(
          'usuario_id',         u.id,
          'asesor_auth_id',     u.id_auth,
          'nombre',             u.nombre,
          'email',              u.email,
          'rol',                u.rol,
          'clientes_total',     COUNT(DISTINCT cl.id),
          'polizas_activas',    COUNT(DISTINCT pol.id)
                                  FILTER (WHERE pol.estatus = 'EN_VIGOR' AND pol.anulada_at IS NULL),
          'ingreso_generado',   COALESCE(
                                  SUM(pp.monto_pagado)
                                    FILTER (
                                      WHERE pp.estado = 'pagado'
                                        AND (pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::date
                                              BETWEEN v_desde AND v_hasta
                                    ),
                                  0
                                ),
          'candidatos_nuevos',  (
            SELECT COUNT(*) FROM prospectos pr
            WHERE pr.agente_id = u.id
              AND pr.created_at::date BETWEEN v_desde AND v_hasta
          ),
          'conversion_pct',     (
            SELECT ROUND(
              CASE WHEN COUNT(*) = 0 THEN 0
                ELSE COUNT(*) FILTER (WHERE pr.estado IN ('con_cita', 'ya_es_cliente'))::numeric
                       / COUNT(*) * 100
              END, 1
            )
            FROM prospectos pr
            WHERE pr.agente_id = u.id
              AND pr.created_at::date BETWEEN v_desde AND v_hasta
          )
        ) AS row_data,
        COALESCE(
          SUM(pp.monto_pagado)
            FILTER (
              WHERE pp.estado = 'pagado'
                AND (pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::date
                      BETWEEN v_desde AND v_hasta
            ),
          0
        ) AS ingreso_cobrado
      FROM usuarios           u
      LEFT JOIN clientes      cl  ON cl.asesor_id  = u.id_auth
      LEFT JOIN polizas       pol ON pol.cliente_id = cl.id
      LEFT JOIN poliza_pagos_mensuales pp ON pp.poliza_id = pol.id
      WHERE u.rol    IN ('agente', 'supervisor')
        AND u.activo  = true
      GROUP BY u.id, u.id_auth, u.nombre, u.email, u.rol
      ORDER BY ingreso_cobrado DESC
      LIMIT p_limit
    ) ranked
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_exec_top_asesores(date, date, int) IS
  'Leaderboard de asesores ordenado por ingreso cobrado real del periodo (poliza_pagos_mensuales estado=pagado). Conv% sobre prospectos del periodo.';

-- =============================================================================
-- 13. rpc_exec_top_clientes
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_top_clientes(
  p_asesor_auth_id uuid DEFAULT NULL,
  p_limit          int  DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(row_data ORDER BY valor_total DESC),
      '[]'::jsonb
    )
    FROM (
      SELECT
        jsonb_build_object(
          'cliente_id',      cl.id,
          'cliente_code',    cl.cliente_code,
          'nombre',          cl.primer_nombre || ' ' || cl.primer_apellido,
          'asesor',          COALESCE(u.nombre, '—'),
          'polizas_activas', COUNT(p.id)
                               FILTER (WHERE p.estatus = 'EN_VIGOR' AND p.anulada_at IS NULL),
          'valor_total',     COALESCE(
                               SUM(p.prima_mxn)
                                 FILTER (WHERE p.estatus = 'EN_VIGOR' AND p.anulada_at IS NULL),
                               0
                             )
        ) AS row_data,
        COALESCE(
          SUM(p.prima_mxn) FILTER (WHERE p.estatus = 'EN_VIGOR' AND p.anulada_at IS NULL),
          0
        ) AS valor_total
      FROM clientes cl
      LEFT JOIN polizas p ON p.cliente_id = cl.id
      LEFT JOIN usuarios u ON cl.asesor_id = u.id_auth
      WHERE cl.activo = true
        AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
      GROUP BY cl.id, cl.cliente_code, cl.primer_nombre, cl.primer_apellido, u.nombre
      ORDER BY valor_total DESC
      LIMIT p_limit
    ) ranked
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_top_clientes(uuid, int) IS
  'Leaderboard de clientes: pólizas activas y valor total de prima.';

-- =============================================================================
-- 14. GRANTS
-- =============================================================================

GRANT SELECT ON vw_exec_asesores_base TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_exec_asesores_list()                      TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_kpis(date, date, uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_tendencia(date, date, uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_funnel(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_citas_stats(date, date, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_sla_stats(date, date, uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_motivos_descarte(date, date, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_polizas_por_tipo(date, date, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_polizas_vencer(int, uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_top_asesores(date, date, int)        TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_top_clientes(uuid, int)              TO authenticated;

COMMIT;
