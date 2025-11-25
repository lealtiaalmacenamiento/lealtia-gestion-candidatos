-- =====================================================
-- Materializar vw_cancelaciones_indices para resolver timeout
-- =====================================================
-- Esta migración convierte la vista vw_cancelaciones_indices en una vista
-- materializada para mejorar el rendimiento de consultas y evitar timeouts.
-- 
-- Problema: La vista original hace un cross-join de asesores × períodos mensuales
-- con múltiples agregaciones complejas, causando timeouts en consultas por usuario.
--
-- Solución: Materializar la vista y crear índices en usuario_id y periodo_mes.
-- =====================================================

-- Eliminar vista normal si existe
DROP VIEW IF EXISTS public.vw_cancelaciones_indices;

-- Crear vista materializada
CREATE MATERIALIZED VIEW public.vw_cancelaciones_indices AS
WITH datos AS (
  SELECT
    p.id,
    c.asesor_id,
    p.fecha_emision,
    p.anulada_at
  FROM public.polizas p
  JOIN public.clientes c ON c.id = p.cliente_id
),
rangos AS (
  SELECT
    generate_series(
      COALESCE(date_trunc('month', (SELECT MIN(fecha_emision) FROM datos)), date_trunc('month', CURRENT_DATE)),
      COALESCE(date_trunc('month', (SELECT MAX(COALESCE(anulada_at::date, fecha_emision)) FROM datos)), date_trunc('month', CURRENT_DATE)),
      interval '1 month'
    )::date AS periodo
),
periodos AS (
  SELECT d.asesor_id, r.periodo, (r.periodo + interval '1 month')::date AS periodo_fin
  FROM rangos r
  JOIN (SELECT DISTINCT asesor_id FROM datos) d ON true
)
SELECT
  pr.asesor_id,
  u.id AS usuario_id,
  u.email AS usuario_email,
  u.nombre AS usuario_nombre,
  pr.periodo AS periodo_mes,
  EXTRACT(year FROM pr.periodo)::int AS anio,
  EXTRACT(month FROM pr.periodo)::int AS mes,
  COUNT(d.*) FILTER (
    WHERE d.fecha_emision >= pr.periodo
      AND d.fecha_emision < pr.periodo_fin
  ) AS polizas_emitidas,
  COUNT(d.*) FILTER (
    WHERE d.anulada_at IS NOT NULL
      AND d.anulada_at >= pr.periodo
      AND d.anulada_at < pr.periodo_fin
  ) AS polizas_canceladas,
  COUNT(d.*) FILTER (
    WHERE d.fecha_emision < pr.periodo_fin
      AND (d.anulada_at IS NULL OR d.anulada_at >= pr.periodo_fin)
  ) AS polizas_vigentes_al_cierre,
  COUNT(d.*) FILTER (
    WHERE d.anulada_at IS NOT NULL
      AND d.anulada_at >= pr.periodo - interval '12 months'
      AND d.anulada_at < pr.periodo_fin
      AND d.fecha_emision >= pr.periodo - interval '12 months'
  ) AS cancelaciones_12m,
  COUNT(d.*) FILTER (
    WHERE d.fecha_emision >= pr.periodo - interval '12 months'
      AND d.fecha_emision < pr.periodo_fin
  ) AS emisiones_12m,
  CASE
    WHEN COUNT(d.*) FILTER (
           WHERE d.fecha_emision >= pr.periodo - interval '12 months'
             AND d.fecha_emision < pr.periodo_fin
         ) > 0
    THEN ROUND(
           1 - (
             COUNT(d.*) FILTER (
               WHERE d.anulada_at IS NOT NULL
                 AND d.anulada_at >= pr.periodo - interval '12 months'
                 AND d.anulada_at < pr.periodo_fin
                 AND d.fecha_emision >= pr.periodo - interval '12 months'
             )::numeric
             /
             COUNT(d.*) FILTER (
               WHERE d.fecha_emision >= pr.periodo - interval '12 months'
                 AND d.fecha_emision < pr.periodo_fin
             )
           ),
           4
         )
    ELSE NULL
  END AS indice_limra,
  CASE
    WHEN COUNT(d.*) FILTER (
           WHERE d.fecha_emision < pr.periodo_fin
             AND (d.anulada_at IS NULL OR d.anulada_at >= pr.periodo_fin)
         ) > 0
    THEN ROUND(
           1 - (
             COUNT(d.*) FILTER (
               WHERE d.anulada_at IS NOT NULL
                 AND d.anulada_at >= pr.periodo
                 AND d.anulada_at < pr.periodo_fin
             )::numeric
             /
             COUNT(d.*) FILTER (
               WHERE d.fecha_emision < pr.periodo_fin
                 AND (d.anulada_at IS NULL OR d.anulada_at >= pr.periodo_fin)
             )
           ),
           4
         )
    ELSE NULL
  END AS indice_igc,
  (
    COUNT(d.*) FILTER (
      WHERE d.fecha_emision >= pr.periodo
        AND d.fecha_emision < pr.periodo_fin
    )
    -
    COUNT(d.*) FILTER (
      WHERE d.anulada_at IS NOT NULL
        AND d.anulada_at >= pr.periodo
        AND d.anulada_at < pr.periodo_fin
    )
  ) AS momentum_neto
FROM periodos pr
LEFT JOIN datos d ON d.asesor_id IS NOT DISTINCT FROM pr.asesor_id
  AND (
    d.fecha_emision < pr.periodo_fin
    OR (d.anulada_at IS NOT NULL AND d.anulada_at >= pr.periodo - interval '12 months')
  )
LEFT JOIN public.usuarios u ON u.id_auth = pr.asesor_id
GROUP BY pr.asesor_id, u.id, u.email, u.nombre, pr.periodo
ORDER BY pr.periodo, pr.asesor_id;

COMMENT ON MATERIALIZED VIEW public.vw_cancelaciones_indices IS 'Métricas mensuales de pólizas emitidas, cancelaciones y persistencia (LIMRA / IGC) por asesor. Materializada para mejor rendimiento.';

-- Crear índices para mejorar consultas
CREATE INDEX idx_vw_cancelaciones_usuario_id ON public.vw_cancelaciones_indices(usuario_id);
CREATE INDEX idx_vw_cancelaciones_periodo ON public.vw_cancelaciones_indices(periodo_mes DESC);
CREATE INDEX idx_vw_cancelaciones_usuario_periodo ON public.vw_cancelaciones_indices(usuario_id, periodo_mes DESC);
CREATE INDEX idx_vw_cancelaciones_asesor_id ON public.vw_cancelaciones_indices(asesor_id);

-- Función para refrescar la vista materializada
-- SET statement_timeout = 0 permite que la operación tome el tiempo necesario
CREATE OR REPLACE FUNCTION refresh_vw_cancelaciones_indices()
RETURNS void
LANGUAGE plpgsql
SET statement_timeout = 0
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_cancelaciones_indices;
    RAISE NOTICE 'Vista materializada vw_cancelaciones_indices refrescada (CONCURRENTLY)';
  EXCEPTION
    WHEN OTHERS THEN
      -- Si falla CONCURRENTLY (requiere índice único), intentar sin CONCURRENTLY
      REFRESH MATERIALIZED VIEW public.vw_cancelaciones_indices;
      RAISE NOTICE 'Vista materializada vw_cancelaciones_indices refrescada (sin CONCURRENTLY)';
  END;
END;
$$;

COMMENT ON FUNCTION refresh_vw_cancelaciones_indices IS 'Refresca la vista materializada vw_cancelaciones_indices. Usar con pg_cron cada 5-10 minutos.';

-- Nota: Para programar refresco automático con pg_cron:
-- IMPORTANTE: El comando del cron job debe incluir SET statement_timeout = 0
-- para evitar timeouts en bases de datos con timeout configurado (ej. 2min en producción)
-- 
-- SELECT cron.schedule(
--   'refresh-cancelaciones-indices',
--   '*/10 * * * *',  -- cada 10 minutos
--   $$SET statement_timeout = 0; SELECT refresh_vw_cancelaciones_indices();$$
-- );

-- Refrescar inmediatamente después de crear
REFRESH MATERIALIZED VIEW public.vw_cancelaciones_indices;
