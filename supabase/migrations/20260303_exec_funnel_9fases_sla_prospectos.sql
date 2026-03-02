-- =============================================================================
-- EXEC DASHBOARD: Embudo 9 fases (como módulo candidatos) + SLA prospectos
--
-- rpc_exec_funnel:
--   * Elimina filtro de periodo — siempre muestra TODOS los candidatos
--   * Usa la misma lógica de 9 fases que getCurrentPhase en candidateFunnelUtils.ts
--   * Devuelve {key, label, count, porcentaje} por fase
--   * Solo filtra por asesor opcionalmente
--
-- rpc_exec_sla_stats:
--   * Fuente cambia de candidatos → prospectos
--   * tiempo_primer_contacto_dias = avg días de created_at a first_visit_at
--   * tiempo_cierre_dias = avg días de created_at a updated_at (prospectos cerrados)
--   * Filtra por asesor y periodo
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. rpc_exec_funnel  — 9 fases, sin filtro de periodo
-- -----------------------------------------------------------------------------
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
    -- ──────────────────────────────────────────────────────────────────────
    -- Paso 1: asignar fase actual a cada candidato
    -- Replica la lógica de getCurrentPhase(candidato) en TypeScript:
    --   · 'agente'             si todas las 7 etapas requeridas están completadas
    --   · Primera fase con campo no nulo Y etapa NO completada (orden PHASE_ORDER)
    -- ──────────────────────────────────────────────────────────────────────
    WITH per_cand AS (
      SELECT
        CASE
          -- AGENTE: todas las etapas requeridas completadas
          WHEN COALESCE((c.etapas_completadas->'periodo_para_registro_y_envio_de_documentos'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'capacitacion_cedula_a1'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'periodo_para_ingresar_folio_oficina_virtual'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'periodo_para_playbook'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'pre_escuela_sesion_unica_de_arranque'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'fecha_limite_para_presentar_curricula_cdp'->>'completed')::bool, false)
            AND COALESCE((c.etapas_completadas->'inicio_escuela_fundamental'->>'completed')::bool, false)
            THEN 'agente'

          -- PROSPECCIÓN: tiene fecha_creacion_pop y no está completada
          WHEN c.fecha_creacion_pop IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_creacion_pop'->>'completed')::bool, false)
            AND NOT COALESCE((c.etapas_completadas->'fecha_creacion_ct'->>'completed')::bool, false)
            THEN 'prospeccion'

          -- REGISTRO Y ENVÍO
          WHEN c.periodo_para_registro_y_envio_de_documentos IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_registro_y_envio_de_documentos'->>'completed')::bool, false)
            THEN 'registro'

          -- CAPACITACIÓN A1
          WHEN c.capacitacion_cedula_a1 IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'capacitacion_cedula_a1'->>'completed')::bool, false)
            THEN 'capacitacion_a1'

          -- EXAMEN
          WHEN c.fecha_tentativa_de_examen IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_tentativa_de_examen'->>'completed')::bool, false)
            THEN 'examen'

          -- FOLIO OFICINA VIRTUAL
          WHEN c.periodo_para_ingresar_folio_oficina_virtual IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_ingresar_folio_oficina_virtual'->>'completed')::bool, false)
            THEN 'folio_ov'

          -- PLAYBOOK
          WHEN c.periodo_para_playbook IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'periodo_para_playbook'->>'completed')::bool, false)
            THEN 'playbook'

          -- PRE-ESCUELA
          WHEN c.pre_escuela_sesion_unica_de_arranque IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'pre_escuela_sesion_unica_de_arranque'->>'completed')::bool, false)
            THEN 'pre_escuela'

          -- CURRÍCULA CDP
          WHEN c.fecha_limite_para_presentar_curricula_cdp IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'fecha_limite_para_presentar_curricula_cdp'->>'completed')::bool, false)
            THEN 'curricula_cdp'

          -- ESCUELA FUNDAMENTAL
          WHEN c.inicio_escuela_fundamental IS NOT NULL
            AND NOT COALESCE((c.etapas_completadas->'inicio_escuela_fundamental'->>'completed')::bool, false)
            THEN 'escuela_fundamental'

          -- Sin fase clara → prospección por defecto
          ELSE 'prospeccion'
        END AS fase
      FROM candidatos c
      LEFT JOIN usuarios u ON lower(u.email) = lower(c.email_agente)
      WHERE c.eliminado = false
        AND (p_asesor_auth_id IS NULL OR u.id_auth = p_asesor_auth_id)
    ),
    -- Paso 2: contar por fase
    counts AS (
      SELECT fase, COUNT(*) AS cnt
      FROM per_cand
      GROUP BY fase
    ),
    -- Paso 3: orden canónico de fases (igual que PHASE_ORDER)
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

GRANT EXECUTE ON FUNCTION rpc_exec_funnel(uuid) TO authenticated;

COMMENT ON FUNCTION rpc_exec_funnel(uuid) IS
  'Embudo de candidatos con 9 fases (igual que módulo candidatos). Sin filtro de periodo — siempre muestra todos los candidatos activos. Filterable por asesor.';


-- -----------------------------------------------------------------------------
-- 2. rpc_exec_sla_stats  — basado en prospectos (no candidatos)
--    tiempo_primer_contacto_dias = avg(first_visit_at - created_at) en días
--    tiempo_cierre_dias          = avg(updated_at - created_at) para cerrados
--    sin_primer_contacto         = prospectos sin first_visit_at
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
      -- Días promedio desde creación del prospecto hasta primer contacto (first_visit_at)
      'tiempo_primer_contacto_dias',
        ROUND(
          AVG(
            CASE WHEN pr.first_visit_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (pr.first_visit_at - pr.created_at)) / 86400.0
            END
          )::numeric, 1
        ),
      -- Días promedio desde creación hasta cierre (ya_es_cliente o descartado)
      'tiempo_cierre_dias',
        ROUND(
          AVG(
            CASE WHEN pr.estado IN ('ya_es_cliente', 'descartado') AND pr.updated_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (pr.updated_at - pr.created_at)) / 86400.0
            END
          )::numeric, 1
        ),
      -- Prospectos sin first_visit_at registrado
      'sin_primer_contacto',
        COUNT(*) FILTER (WHERE pr.first_visit_at IS NULL),
      -- Total muestra
      'muestra_total',
        COUNT(*)
    )
    FROM prospectos pr
    WHERE pr.created_at::date BETWEEN v_desde AND v_hasta
      AND (v_asesor_usuario_id IS NULL OR pr.agente_id = v_asesor_usuario_id)
  );
END;
$$;

COMMENT ON FUNCTION rpc_exec_sla_stats(date, date, uuid) IS
  'SLA de prospectos: días a primer contacto (first_visit_at) y días a cierre. Periodo y asesor configurables.';
