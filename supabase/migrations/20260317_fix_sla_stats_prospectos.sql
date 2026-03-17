-- Restaura rpc_exec_sla_stats sobre la tabla prospectos (clientes potenciales),
-- corrigiendo dos problemas del 20260303_exec_conversion_fixes.sql:
--   1. Función consultaba candidatos (agentes) en lugar de prospectos (clientes)
--   2. Referenciaba estado 'ya_es_cliente' que no existe — estados válidos:
--      pendiente | seguimiento | con_cita | descartado

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
  v_today_cdmx        date    := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
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
    SELECT id INTO v_asesor_usuario_id
    FROM usuarios
    WHERE id_auth = p_asesor_auth_id
    LIMIT 1;
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
      -- Días promedio desde creación hasta cierre (con_cita = exitoso, descartado = negativo)
      'tiempo_cierre_dias',
        ROUND(
          AVG(
            CASE WHEN pr.estado IN ('con_cita', 'descartado') AND pr.updated_at IS NOT NULL
              THEN EXTRACT(EPOCH FROM (pr.updated_at - pr.created_at)) / 86400.0
            END
          )::numeric, 1
        ),
      -- Prospectos sin primer contacto registrado
      'sin_primer_contacto',
        COUNT(*) FILTER (WHERE pr.first_visit_at IS NULL),
      -- Total de prospectos en la muestra
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
