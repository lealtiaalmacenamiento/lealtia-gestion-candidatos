-- =====================================================
-- Vista materializada optimizada de cancelaciones
-- Reducción estimada: 90% del tamaño (de 657MB a ~65MB)
-- =====================================================
-- Cambios principales:
-- 1. Solo últimos 24 meses (vs todo el histórico)
-- 2. Solo usuarios activos
-- 3. Columnas esenciales (sin email/nombre redundantes)
-- 4. Índices parciales en datos recientes
-- =====================================================

-- Eliminar vista anterior si existe
DROP MATERIALIZED VIEW IF EXISTS public.vw_cancelaciones_indices CASCADE;

-- Crear vista materializada optimizada
CREATE MATERIALIZED VIEW public.vw_cancelaciones_indices AS
WITH datos AS (
  SELECT
    p.id,
    c.asesor_id,
    p.fecha_emision,
    p.anulada_at
  FROM public.polizas p
  JOIN public.clientes c ON c.id = p.cliente_id
  -- Optimización: Solo pólizas de últimos 36 meses (para calcular 24 meses + ventana de 12)
  WHERE p.fecha_emision >= date_trunc('month', CURRENT_DATE - INTERVAL '36 months')
     OR (p.anulada_at IS NOT NULL 
         AND p.anulada_at >= date_trunc('month', CURRENT_DATE - INTERVAL '36 months'))
),
rangos AS (
  SELECT
    -- Optimización: Solo últimos 24 meses
    generate_series(
      date_trunc('month', CURRENT_DATE - INTERVAL '24 months'),
      date_trunc('month', CURRENT_DATE),
      interval '1 month'
    )::date AS periodo
),
periodos AS (
  SELECT d.asesor_id, r.periodo, (r.periodo + interval '1 month')::date AS periodo_fin
  FROM rangos r
  CROSS JOIN (
    -- Optimización: Solo usuarios activos
    SELECT DISTINCT c.asesor_id 
    FROM datos d
    JOIN public.clientes c ON c.asesor_id = d.asesor_id
    JOIN public.usuarios u ON u.id_auth = c.asesor_id
    WHERE u.activo = true
  ) d
)
SELECT
  pr.asesor_id,
  u.id AS usuario_id,
  -- Columnas redundantes eliminadas: usuario_email, usuario_nombre
  pr.periodo AS periodo_mes,
  -- Columnas redundantes eliminadas: anio, mes (se calculan del periodo_mes)
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
WHERE u.activo = true  -- Solo usuarios activos
GROUP BY pr.asesor_id, u.id, pr.periodo
ORDER BY pr.periodo DESC, pr.asesor_id;

COMMENT ON MATERIALIZED VIEW public.vw_cancelaciones_indices IS 
  'Métricas de cancelaciones optimizada: últimos 24 meses, solo usuarios activos. Tamaño ~10% del original.';

-- Índices optimizados (solo en datos recientes)
CREATE INDEX idx_vw_cancelaciones_usuario_id ON public.vw_cancelaciones_indices(usuario_id);
CREATE INDEX idx_vw_cancelaciones_periodo ON public.vw_cancelaciones_indices(periodo_mes DESC)
  WHERE periodo_mes >= date_trunc('month', CURRENT_DATE - INTERVAL '12 months');
CREATE INDEX idx_vw_cancelaciones_usuario_periodo ON public.vw_cancelaciones_indices(usuario_id, periodo_mes DESC)
  WHERE periodo_mes >= date_trunc('month', CURRENT_DATE - INTERVAL '12 months');

-- Función de refresco optimizada
CREATE OR REPLACE FUNCTION refresh_vw_cancelaciones_indices()
RETURNS void
LANGUAGE plpgsql
SET statement_timeout = 0
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_cancelaciones_indices;
  RAISE NOTICE 'Vista optimizada refrescada (CONCURRENTLY)';
EXCEPTION
  WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.vw_cancelaciones_indices;
    RAISE NOTICE 'Vista optimizada refrescada (sin CONCURRENTLY)';
END;
$$;

COMMENT ON FUNCTION refresh_vw_cancelaciones_indices IS 
  'Refresca vista materializada optimizada de cancelaciones.';

-- Refrescar la vista inmediatamente
REFRESH MATERIALIZED VIEW public.vw_cancelaciones_indices;

-- Mostrar estadísticas de tamaño
SELECT 
  pg_size_pretty(pg_total_relation_size('public.vw_cancelaciones_indices')) AS tamaño_total,
  COUNT(*) AS total_filas
FROM public.vw_cancelaciones_indices;
