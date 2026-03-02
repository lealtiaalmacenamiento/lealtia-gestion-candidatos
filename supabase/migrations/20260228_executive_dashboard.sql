-- =============================================================================
-- LEALTIA GESTION CANDIDATOS - EXECUTIVE DASHBOARD MIGRATION
-- Fecha: 2026-02-28
-- Descripción: Agrega columnas, vistas y funciones RPC para el
--              Dashboard Ejecutivo (admin/supervisor únicamente).
-- =============================================================================
-- DISTINCIÓN CLAVE DE TABLAS:
--   • candidatos  — embudo CRM principal (nuevo→prospecto→cotizando→ganado/perdido)
--                   NO recibe columnas nuevas.
--   • prospectos  — tabla de trabajo semanal del agente
--                   (pendiente→seguimiento→con_cita→descartado)
--                   ← aquí vive motivo_descarte (prima estimada la toma de planificaciones)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. COLUMNAS ADICIONALES EN PROSPECTOS
-- =============================================================================

-- Razón de descarte cuando estado = 'descartado'
ALTER TABLE prospectos ADD COLUMN IF NOT EXISTS motivo_descarte text;

COMMENT ON COLUMN prospectos.motivo_descarte IS
  'Razón de descarte cuando estado = ''descartado'': '
  'precio, competencia, sin_interes, sin_respuesta, otro, etc.';

-- =============================================================================
-- 2. VIEW: vw_exec_asesores_base
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
-- 3. RPC: rpc_exec_asesores_list
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_asesores_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
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
-- 4. RPC: rpc_exec_kpis
--
--    PARÁMETROS:
--      p_desde          — inicio del período (default: inicio del mes actual)
--      p_hasta          — fin del período    (default: hoy)
--      p_asesor_auth_id — UUID auth.users del asesor (NULL = todos)
--
--    Pipeline Value = suma de planificaciones.prima_anual_promedio de PROSPECTOS activos
--                     (estado: pendiente, seguimiento, con_cita)
--    prospectos.agente_id es bigint (usuarios.id), se resuelve desde uuid.
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

  -- Resolver usuario_id interno (bigint) para filtrar prospectos
  v_asesor_usuario_id bigint;

  -- KPIs candidatos
  v_total_candidatos   bigint  := 0;
  v_total_prospectos   bigint  := 0;
  v_total_cotizando    bigint  := 0;
  v_total_ganados      bigint  := 0;
  v_total_perdidos     bigint  := 0;
  -- KPIs clientes
  v_total_clientes     bigint  := 0;
  -- Financiero
  v_ingreso_mxn        numeric := 0;
  v_pipeline_value     numeric := 0;
  v_polizas_activas    bigint  := 0;
  v_polizas_canceladas bigint  := 0;
  -- Proyección
  v_dias_mes           int;
  v_dias_trans         int;
  v_ingreso_mes        numeric := 0;
  v_proyeccion         numeric := 0;
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  -- Resolver usuario_id bigint del asesor para filtrar prospectos
  IF p_asesor_auth_id IS NOT NULL THEN
    SELECT id INTO v_asesor_usuario_id
    FROM usuarios
    WHERE id_auth = p_asesor_auth_id
    LIMIT 1;
  END IF;

  -- CANDIDATOS del período (email_agente → usuarios.email)
  SELECT COUNT(*) INTO v_total_candidatos
  FROM candidatos c
  LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
  WHERE c.eliminado = false
    AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id);

  -- Snapshot del pipeline: etapas mapeadas desde proceso/efc
  SELECT
    COUNT(*) FILTER (WHERE c.proceso IN ('PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS','SIN ETAPA') OR c.proceso IS NULL)  AS prospectos,
    COUNT(*) FILTER (WHERE c.proceso IN ('PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL','POST EXAMEN'))                      AS cotizando,
    COUNT(*) FILTER (WHERE c.fecha_creacion_ct IS NOT NULL)                                                                               AS ganados,
    0::bigint                                                                                                               AS perdidos
  INTO v_total_prospectos, v_total_cotizando, v_total_ganados, v_total_perdidos
  FROM candidatos c
  LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
  WHERE c.eliminado = false
    AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id);

  -- CLIENTES ACTIVOS
  SELECT COUNT(*) INTO v_total_clientes
  FROM clientes cl
  WHERE cl.activo = true
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  -- INGRESO TOTAL (pólizas EN_VIGOR)
  SELECT COALESCE(SUM(p.prima_mxn), 0) INTO v_ingreso_mxn
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus    = 'EN_VIGOR'
    AND p.anulada_at  IS NULL
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  -- PIPELINE VALUE — usa planificaciones.prima_anual_promedio (configurada por el agente)
  --   prospectos.agente_id es bigint, usar v_asesor_usuario_id resuelto arriba.
  --   Si no hay planificación relacionada usa $30,000 MXN como promedio de mercado.
  SELECT COALESCE(SUM(COALESCE(pl.prima_anual_promedio, 30000)), 0) INTO v_pipeline_value
  FROM prospectos pr
  LEFT JOIN planificaciones pl
    ON pl.agente_id   = pr.agente_id
   AND pl.anio       = pr.anio
   AND pl.semana_iso = pr.semana_iso
  WHERE pr.estado IN ('pendiente', 'seguimiento', 'con_cita')
    AND (v_asesor_usuario_id IS NULL OR pr.agente_id = v_asesor_usuario_id);

  -- PÓLIZAS ACTIVAS Y CANCELADAS
  SELECT COUNT(*) INTO v_polizas_activas
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus    = 'EN_VIGOR'
    AND p.anulada_at  IS NULL
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  SELECT COUNT(*) INTO v_polizas_canceladas
  FROM polizas p
  INNER JOIN clientes cl ON p.cliente_id = cl.id
  WHERE p.estatus       = 'ANULADA'
    AND p.anulada_at::date BETWEEN v_desde AND v_hasta
    AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id);

  -- PROYECCIÓN LINEAL AL FIN DE MES
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
    'total_candidatos',      v_total_candidatos,
    'total_prospectos',      v_total_prospectos,
    'total_cotizando',       v_total_cotizando,
    'total_ganados',         v_total_ganados,
    'total_perdidos',        v_total_perdidos,
    'total_clientes',        v_total_clientes,
    'polizas_activas',       v_polizas_activas,
    'polizas_canceladas',    v_polizas_canceladas,
    'ingreso_mxn',           v_ingreso_mxn,
    'pipeline_value',        v_pipeline_value,
    'ingreso_mes_actual',    v_ingreso_mes,
    'proyeccion_fin_mes',    v_proyeccion,
    'periodo_desde',         v_desde,
    'periodo_hasta',         v_hasta,
    'dias_transcurridos',    v_dias_trans,
    'dias_mes',              v_dias_mes
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_kpis(date, date, uuid) IS
  'KPIs del Dashboard Ejecutivo. '
  'Pipeline Value = suma de planificaciones.prima_anual_promedio de prospectos activos (JOIN vía agente_id+anio+semana_iso).';

-- =============================================================================
-- 5. RPC: rpc_exec_tendencia (serie temporal mensual)
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
  v_desde date := COALESCE(p_desde, (CURRENT_DATE - interval '11 months')::date);
  v_hasta date := COALESCE(p_hasta, CURRENT_DATE);
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
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
      -- Ganados agrupados por mes de CONEXIÓN (fecha_creacion_ct)
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
      SELECT
        date_trunc('month', p.fecha_alta_sistema)::date AS mes,
        COUNT(*)                                         AS polizas_emitidas,
        COALESCE(SUM(p.prima_mxn), 0)                   AS ingreso_emitido
      FROM polizas p
      INNER JOIN clientes cl ON p.cliente_id = cl.id
      WHERE p.fecha_alta_sistema::date BETWEEN v_desde AND v_hasta
        AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
      GROUP BY date_trunc('month', p.fecha_alta_sistema)
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'mes',               TO_CHAR(m.mes, 'YYYY-MM'),
          'mes_label',         TO_CHAR(m.mes, 'Mon YY'),
          'nuevos_candidatos', COALESCE(cm.nuevos_candidatos, 0),
          'ganados',           COALESCE(gm.ganados, 0),
          'polizas_emitidas',  COALESCE(pm.polizas_emitidas, 0),
          'ingreso_emitido',   COALESCE(pm.ingreso_emitido, 0)
        )
        ORDER BY m.mes
      ),
      '[]'::jsonb
    )
    FROM meses m
    LEFT JOIN candidatos_mes cm ON cm.mes = m.mes
    LEFT JOIN ganados_mes    gm ON gm.mes = m.mes
    LEFT JOIN polizas_mes    pm ON pm.mes = m.mes
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_tendencia(date, date, uuid) IS
  'Serie temporal mensual: candidatos nuevos, ganados, pólizas e ingreso.';

-- =============================================================================
-- 6. RPC: rpc_exec_funnel (embudo candidatos — tabla candidatos)
-- =============================================================================

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
  v_desde date := COALESCE(p_desde, date_trunc('year', CURRENT_DATE)::date);
  v_hasta date := COALESCE(p_hasta, CURRENT_DATE);
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    WITH etapas AS (
      SELECT
        CASE
          WHEN c.fecha_creacion_ct IS NOT NULL                                                        THEN 'ganado'
          WHEN c.proceso = 'POST EXAMEN'                                                THEN 'cotizando'
          WHEN c.proceso = 'PERIODO PARA INGRESAR FOLIO OFICINA VIRTUAL'               THEN 'cotizando'
          WHEN c.proceso = 'PERIODO PARA REGISTRO Y ENVÍO DE DOCUMENTOS'               THEN 'prospecto'
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
          WHEN 'nuevo'         THEN 1
          WHEN 'prospecto'     THEN 2
          WHEN 'cotizando'     THEN 3
          WHEN 'ganado'        THEN 4
          ELSE                      5
        END AS orden,
        CASE estado
          WHEN 'nuevo'         THEN 'Candidatos'
          WHEN 'prospecto'     THEN 'En proceso'
          WHEN 'cotizando'     THEN 'Avanzados'
          WHEN 'ganado'        THEN 'Completados'
          ELSE estado
        END AS label,
        cnt
      FROM etapas
    ),

    grouped AS (
      SELECT MIN(orden) AS orden, label, SUM(cnt) AS cnt
      FROM ranked
      GROUP BY label
    ),
    totaled AS (
      SELECT orden, label, cnt, SUM(cnt) OVER () AS total
      FROM grouped
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'label',      label,
          'count',      cnt,
          'porcentaje', ROUND(
            cnt::numeric / NULLIF(total, 0) * 100, 1
          )
        )
        ORDER BY orden
      ),
      '[]'::jsonb
    )
    FROM totaled
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_funnel(date, date, uuid) IS
  'Embudo de conversión por etapa (tabla candidatos — CRM principal).';

-- =============================================================================
-- 7. RPC: rpc_exec_citas_stats
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
  v_desde date := COALESCE(p_desde, date_trunc('month', CURRENT_DATE)::date);
  v_hasta date := COALESCE(p_hasta, CURRENT_DATE);
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total',       COUNT(*),
      'confirmadas', COUNT(*) FILTER (WHERE estado = 'confirmada'),
      'canceladas',  COUNT(*) FILTER (WHERE estado = 'cancelada'),
      'completadas', COUNT(*) FILTER (WHERE estado = 'confirmada' AND fin  < now()),
      'pendientes',  COUNT(*) FILTER (WHERE estado = 'confirmada' AND fin >= now()),
      'por_mes', (
        WITH meses AS (
          SELECT generate_series(
            date_trunc('month', v_desde),
            date_trunc('month', v_hasta),
            interval '1 month'
          )::date AS mes
        ),
        stats AS (
          SELECT
            date_trunc('month', ci2.inicio)::date                                 AS mes,
            COUNT(*)                                                               AS total,
            COUNT(*) FILTER (WHERE ci2.estado = 'confirmada')                     AS confirmadas,
            COUNT(*) FILTER (WHERE ci2.estado = 'cancelada')                      AS canceladas,
            COUNT(*) FILTER (WHERE ci2.estado = 'confirmada' AND ci2.fin < now()) AS completadas
          FROM citas ci2
          WHERE ci2.inicio::date BETWEEN v_desde AND v_hasta
            AND (p_asesor_auth_id IS NULL OR ci2.agente_id = p_asesor_auth_id)
          GROUP BY date_trunc('month', ci2.inicio)
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
    WHERE ci.inicio::date BETWEEN v_desde AND v_hasta
      AND (p_asesor_auth_id IS NULL OR ci.agente_id = p_asesor_auth_id)
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_citas_stats(date, date, uuid) IS
  'Estadísticas de actividad comercial (citas) para el Dashboard Ejecutivo.';

-- =============================================================================
-- 8. RPC: rpc_exec_sla_stats
-- =============================================================================

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
  v_desde date := COALESCE(p_desde, date_trunc('month', CURRENT_DATE)::date);
  v_hasta date := COALESCE(p_hasta, CURRENT_DATE);
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'tiempo_primer_contacto_dias',
        NULL::numeric,
      'tiempo_cierre_dias',
        ROUND(
          AVG(
            CASE WHEN c.fecha_creacion_ct IS NOT NULL
              THEN (c.fecha_creacion_ct - c.fecha_de_creacion::date)::numeric
            END
          )::numeric, 1
        ),
      'sin_primer_contacto',
        COUNT(*) FILTER (WHERE c.fecha_creacion_ct IS NULL),
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

COMMENT ON FUNCTION rpc_exec_sla_stats(date, date, uuid) IS
  'Tiempos promedio de primer contacto y cierre de candidatos (SLA).';

-- =============================================================================
-- 9. RPC: rpc_exec_motivos_descarte
--    Fuente: tabla PROSPECTOS (estado = 'descartado' + motivo_descarte).
--    prospectos.agente_id es bigint → se resuelve desde p_asesor_auth_id.
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
  v_desde             date   := COALESCE(p_desde, date_trunc('year', CURRENT_DATE)::date);
  v_hasta             date   := COALESCE(p_hasta, CURRENT_DATE);
  v_asesor_usuario_id bigint;
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  IF p_asesor_auth_id IS NOT NULL THEN
    SELECT id INTO v_asesor_usuario_id
    FROM usuarios
    WHERE id_auth = p_asesor_auth_id
    LIMIT 1;
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

COMMENT ON FUNCTION rpc_exec_motivos_descarte(date, date, uuid) IS
  'Top 10 motivos de descarte de prospectos (tabla prospectos, estado = ''descartado'').';

-- =============================================================================
-- 10. RPC: rpc_exec_polizas_por_tipo
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_polizas_por_tipo(
  p_asesor_auth_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
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

COMMENT ON FUNCTION rpc_exec_polizas_por_tipo(uuid) IS
  'Distribución de pólizas activas por tipo de producto (VI / GMM) para gráfica de dona.';

-- =============================================================================
-- 11. RPC: rpc_exec_polizas_vencer
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
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
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
          'dias_restantes',   (p.fecha_renovacion - CURRENT_DATE),
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
      AND p.fecha_renovacion  BETWEEN CURRENT_DATE AND (CURRENT_DATE + p_dias_alerta)
      AND (p_asesor_auth_id IS NULL OR cl.asesor_id = p_asesor_auth_id)
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_polizas_vencer(int, uuid) IS
  'Lista de pólizas próximas a vencer en los próximos N días (alerta de retención).';

-- =============================================================================
-- 12. RPC: rpc_exec_top_asesores
-- =============================================================================

CREATE OR REPLACE FUNCTION rpc_exec_top_asesores(
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
  v_desde date := COALESCE(p_desde, date_trunc('year', CURRENT_DATE)::date);
  v_hasta date := COALESCE(p_hasta, CURRENT_DATE);
BEGIN
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
  IF auth.uid() IS NOT NULL AND NOT is_super_role() THEN
    RAISE EXCEPTION 'Acceso denegado: se requiere rol admin o supervisor';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(row_data ORDER BY ingreso_generado DESC),
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
          'polizas_activas',    COUNT(DISTINCT p.id)
                                  FILTER (WHERE p.estatus = 'EN_VIGOR' AND p.anulada_at IS NULL),
          'ingreso_generado',   COALESCE(
                                  SUM(p.prima_mxn)
                                    FILTER (WHERE p.estatus = 'EN_VIGOR' AND p.anulada_at IS NULL),
                                  0
                                ),
          'candidatos_nuevos',  (
            SELECT COUNT(*)
            FROM candidatos c
            WHERE lower(c.email_agente) = lower(u.email)
              AND c.eliminado = false
              AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
          ),
          'candidatos_ganados', (
            SELECT COUNT(*)
            FROM candidatos c
            WHERE lower(c.email_agente) = lower(u.email)
              AND c.eliminado = false
              AND c.fecha_creacion_ct BETWEEN v_desde AND v_hasta
          ),
          'conversion_pct',     (
            SELECT ROUND(
              CASE
                WHEN COUNT(*) = 0 THEN 0
                ELSE COUNT(*) FILTER (WHERE c.fecha_creacion_ct IS NOT NULL)::numeric
                       / COUNT(*) * 100
              END, 1
            )
            FROM candidatos c
            WHERE lower(c.email_agente) = lower(u.email)
              AND c.eliminado = false
              AND c.fecha_de_creacion::date BETWEEN v_desde AND v_hasta
          )
        ) AS row_data,
        COALESCE(
          SUM(p.prima_mxn) FILTER (WHERE p.estatus = 'EN_VIGOR' AND p.anulada_at IS NULL),
          0
        ) AS ingreso_generado
      FROM usuarios u
      LEFT JOIN clientes cl ON cl.asesor_id  = u.id_auth
      LEFT JOIN polizas p   ON p.cliente_id  = cl.id
      WHERE u.rol     IN ('agente','supervisor')
        AND u.activo   = true
      GROUP BY u.id, u.id_auth, u.nombre, u.email, u.rol
      ORDER BY ingreso_generado DESC
      LIMIT p_limit
    ) ranked
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_top_asesores(date, date, int) IS
  'Leaderboard de asesores: ingreso generado, clientes y tasa de conversión.';

-- =============================================================================
-- 13. RPC: rpc_exec_top_clientes
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
  -- Cuando es llamada desde service role (API route), auth.uid() = NULL  se permite.
  -- Cuando es llamada desde cliente, se requiere super rol.
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
-- 14. GRANTS (SECURITY DEFINER valida is_super_role internamente)
-- =============================================================================

GRANT SELECT ON vw_exec_asesores_base TO authenticated;

GRANT EXECUTE ON FUNCTION rpc_exec_asesores_list()                    TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_kpis(date, date, uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_tendencia(date, date, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_funnel(date, date, uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_citas_stats(date, date, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_sla_stats(date, date, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_motivos_descarte(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_polizas_por_tipo(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_polizas_vencer(int, uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_top_asesores(date, date, int)      TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_exec_top_clientes(uuid, int)            TO authenticated;

COMMIT;

-- =============================================================================
-- FIN: 20260228_executive_dashboard.sql
-- RESUMEN:
--
--  COLUMNAS NUEVAS en PROSPECTOS (tabla de trabajo semanal del agente):
--    prospectos.motivo_descarte  text  ← razón de descarte
--  (pipeline_value usa planificaciones.prima_anual_promedio, no columna propia)
--
--  candidatos NO recibe columnas nuevas (es el CRM principal, embudo de fases).
--
--  VISTA: vw_exec_asesores_base
--
--  RPCs (todas SECURITY DEFINER, solo admin/supervisor):
--    rpc_exec_asesores_list()              → dropdown Zona 1
--    rpc_exec_kpis(desde,hasta,asesor)     → KPIs Zona 2
--      pipeline_value = prospectos activos × planificaciones.prima_anual_promedio (o $30K default)
--    rpc_exec_tendencia(desde,hasta,asesor)→ gráfica de líneas Zona 2
--    rpc_exec_funnel(desde,hasta,asesor)   → embudo candidatos Zona 3
--    rpc_exec_sla_stats(desde,hasta,asesor)→ SLA candidatos Zona 3
--    rpc_exec_citas_stats(desde,hasta,asesor)→ actividad citas Zona 3
--    rpc_exec_motivos_descarte(desde,hasta,asesor)
--      → TOP 10 motivos descarte PROSPECTOS Zona 3
--    rpc_exec_polizas_por_tipo(asesor)     → dona VI/GMM Zona 3
--    rpc_exec_polizas_vencer(dias,asesor)  → alerta renovaciones Zona 3
--    rpc_exec_top_asesores(desde,hasta,lim)→ leaderboard Zona 4
--    rpc_exec_top_clientes(asesor,lim)     → leaderboard Zona 4
-- =============================================================================
