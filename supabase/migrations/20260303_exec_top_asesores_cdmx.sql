-- Fix CDMX defaults for rpc_exec_top_asesores
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
  v_today_cdmx date := (NOW() AT TIME ZONE 'America/Mexico_City')::date;
  v_desde date := COALESCE(p_desde, date_trunc('year', v_today_cdmx::timestamp)::date);
  v_hasta date := COALESCE(p_hasta, v_today_cdmx);
BEGIN
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
  'Leaderboard de asesores: ingreso generado, clientes y tasa de conversión. Timezone CDMX.';
