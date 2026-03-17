-- Corrige rpc_exec_top_asesores:
--   1. Conv % ahora sobre prospectos (clientes potenciales), no candidatos (agentes en formación)
--      Conversión = prospectos del periodo que llegaron a con_cita o ya_es_cliente
--   2. Ingreso ahora es el cobrado real del periodo (sum monto_pagado estado=pagado, fecha_pago_real en rango)
--      en lugar de la suma de prima_mxn de pólizas EN_VIGOR (que era snapshot sin filtro de fecha)

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

          -- Clientes y pólizas activas (snapshot actual, sin filtro de fecha)
          'clientes_total',     COUNT(DISTINCT cl.id),
          'polizas_activas',    COUNT(DISTINCT pol.id)
                                  FILTER (WHERE pol.estatus = 'EN_VIGOR' AND pol.anulada_at IS NULL),

          -- Ingreso cobrado real en el periodo (pagos marcados como pagado con fecha en rango)
          'ingreso_generado',   COALESCE(
                                  SUM(pp.monto_pagado)
                                    FILTER (
                                      WHERE pp.estado = 'pagado'
                                        AND (pp.fecha_pago_real AT TIME ZONE 'America/Mexico_City')::date
                                              BETWEEN v_desde AND v_hasta
                                    ),
                                  0
                                ),

          -- Prospectos nuevos del periodo (clientes potenciales, no candidatos/agentes)
          'candidatos_nuevos',  (
            SELECT COUNT(*)
            FROM prospectos pr
            WHERE pr.agente_id = u.id
              AND pr.created_at::date BETWEEN v_desde AND v_hasta
          ),

          -- Conversión: prospectos del periodo que cerraron (con_cita o ya_es_cliente)
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

        -- Columna auxiliar para ORDER BY
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
