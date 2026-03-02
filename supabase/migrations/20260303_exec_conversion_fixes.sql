-- =============================================================================
-- FIX: Zona "Conversión y actividad" del Dashboard Ejecutivo
--
-- Cambios por función:
--   rpc_exec_funnel          — CURRENT_DATE → CDMX
--   rpc_exec_citas_stats     — CURRENT_DATE → CDMX
--   rpc_exec_sla_stats       — CURRENT_DATE → CDMX
--                              tiempo_primer_contacto_dias: NULL → avg días a examen
--   rpc_exec_motivos_descarte— CURRENT_DATE → CDMX
--   rpc_exec_polizas_por_tipo— agregar p_desde/p_hasta + CDMX (filtra por fecha_emision)
--   rpc_exec_polizas_vencer  — CURRENT_DATE → CDMX
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. rpc_exec_funnel
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_exec_funnel(
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
  v_desde := COALESCE(p_desde, date_trunc('year', v_today_cdmx::timestamp)::date);
  v_hasta  := COALESCE(p_hasta, v_today_cdmx);

  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    WITH etapas AS (
      SELECT
        CASE
          WHEN c.fecha_creacion_ct IS NOT NULL                                   THEN 'ganado'
          WHEN c.proceso = 'POST EXAMEN'                                         THEN 'cotizando'
          WHEN c.proceso = 'PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL'         THEN 'cotizando'
          WHEN c.proceso = 'PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS'         THEN 'prospecto'
          ELSE 'nuevo'
        END AS estado,
        COUNT(*) AS cnt
      FROM candidatos c
      LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
      WHERE c.eliminado = false
        AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
      GROUP BY 1
    ),
    ranked AS (
      SELECT
        CASE estado
          WHEN 'nuevo'     THEN 1
          WHEN 'prospecto' THEN 2
          WHEN 'cotizando' THEN 3
          WHEN 'ganado'    THEN 4
          ELSE                  5
        END AS orden,
        CASE estado
          WHEN 'nuevo'     THEN 'Candidatos'
          WHEN 'prospecto' THEN 'En proceso'
          WHEN 'cotizando' THEN 'Avanzados'
          WHEN 'ganado'    THEN 'Completados'
          ELSE estado
        END AS label,
        cnt
      FROM etapas
    ),
    grouped AS (
      SELECT MIN(orden) AS orden, label, SUM(cnt) AS cnt
      FROM ranked GROUP BY label
    ),
    totaled AS (
      SELECT orden, label, cnt, SUM(cnt) OVER () AS total FROM grouped
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'label',      label,
          'count',      cnt,
          'porcentaje', ROUND(cnt::numeric / NULLIF(total, 0) * 100, 1)
        )
        ORDER BY orden
      ),
      '[]'::jsonb
    )
    FROM totaled
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. rpc_exec_citas_stats
-- -----------------------------------------------------------------------------
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
  v_now_cdmx   timestamptz := NOW() AT TIME ZONE 'America/Mexico_City';
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

-- -----------------------------------------------------------------------------
-- 3. rpc_exec_sla_stats
--    tiempo_primer_contacto_dias → días promedio a examen (fecha_tentativa_de_examen)
--    tiempo_cierre_dias          → días promedio a obtener CT
--    sin_primer_contacto         → candidatos sin fecha de examen aún
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_exec_sla_stats(
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
      -- Días promedio desde registro hasta examen
      'tiempo_primer_contacto_dias',
        ROUND(
          AVG(
            CASE WHEN c.fecha_tentativa_de_examen IS NOT NULL
              THEN (c.fecha_tentativa_de_examen - c.fecha_de_creacion::date)::numeric
            END
          )::numeric, 1
        ),
      -- Días promedio desde registro hasta CT (cierre)
      'tiempo_cierre_dias',
        ROUND(
          AVG(
            CASE WHEN c.fecha_creacion_ct IS NOT NULL
              THEN (c.fecha_creacion_ct - c.fecha_de_creacion::date)::numeric
            END
          )::numeric, 1
        ),
      -- Sin examen programado
      'sin_primer_contacto',
        COUNT(*) FILTER (WHERE c.fecha_tentativa_de_examen IS NULL),
      'muestra_total',
        COUNT(*)
    )
    FROM candidatos c
    LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
    WHERE c.eliminado = false
      AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
      AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. rpc_exec_motivos_descarte
-- -----------------------------------------------------------------------------
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
        COUNT(*)                                         AS cnt
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

-- -----------------------------------------------------------------------------
-- 5. rpc_exec_polizas_por_tipo  — añadir p_desde/p_hasta + CDMX
--    Filtra por fecha_emision del periodo seleccionado
-- -----------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION rpc_exec_polizas_por_tipo(date, date, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. rpc_exec_polizas_vencer — CDMX
-- -----------------------------------------------------------------------------
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

COMMENT ON FUNCTION rpc_exec_funnel(date, date, uuid) IS
  'Embudo de conversión por etapa. Timezone CDMX.';
COMMENT ON FUNCTION rpc_exec_citas_stats(date, date, uuid) IS
  'Estadísticas de citas del periodo. Timezone CDMX.';
COMMENT ON FUNCTION rpc_exec_sla_stats(date, date, uuid) IS
  'SLA: días_a_examen (primer_contacto) y días_a_CT (cierre). Timezone CDMX.';
COMMENT ON FUNCTION rpc_exec_motivos_descarte(date, date, uuid) IS
  'Top 10 motivos de descarte de prospectos. Timezone CDMX.';
COMMENT ON FUNCTION rpc_exec_polizas_por_tipo(date, date, uuid) IS
  'Pólizas EN_VIGOR por tipo, filtradas por fecha_emision del periodo. Timezone CDMX.';
COMMENT ON FUNCTION rpc_exec_polizas_vencer(int, uuid) IS
  'Pólizas próximas a vencer. Días calculados desde hoy CDMX.';
