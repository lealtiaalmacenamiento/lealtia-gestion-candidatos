-- Reset polizas and seed exactly 3 per asesor with prima 1000 MXN each
-- Preserves grouping: uses existing clientes grouped by asesor_id and
-- prefers each asesor's most frequent producto_parametro_id; falls back to any available
-- producto_parametros entry if none found.

-- Safety: run inside a single transaction
BEGIN;

-- 1) Clear existing policies (and dependent caches) to start fresh
TRUNCATE TABLE public.polizas CASCADE;

-- 2) Collect asesores and candidate clients per asesor
WITH asesores AS (
  SELECT DISTINCT c.asesor_id
  FROM public.clientes c
  WHERE c.asesor_id IS NOT NULL
), clientes_por_asesor AS (
  SELECT c.asesor_id, c.id AS cliente_id,
         ROW_NUMBER() OVER (PARTITION BY c.asesor_id ORDER BY c.creado_at NULLS LAST, c.id) AS rn
  FROM public.clientes c
  WHERE c.asesor_id IS NOT NULL
), pp_prefer AS (
  -- Prefer the most common producto_parametro_id used previously under each asesor; fallback to any producto_parametros
  SELECT a.asesor_id,
         COALESCE(
           (
             SELECT CAST(MIN(CAST(p.producto_parametro_id AS text)) AS uuid)
             FROM public.polizas p
             JOIN public.clientes cx ON cx.id = p.cliente_id
             WHERE cx.asesor_id = a.asesor_id AND p.producto_parametro_id IS NOT NULL
           ),
           (
             SELECT CAST(MIN(CAST(id AS text)) AS uuid) FROM public.producto_parametros
           )
         ) AS producto_parametro_id
  FROM asesores a
), targets AS (
  -- Choose up to 3 clients per asesor; if fewer exist, reuse the first
  SELECT a.asesor_id,
         COALESCE(c1.cliente_id, c_any.id) AS cli1,
         COALESCE(c2.cliente_id, COALESCE(c1.cliente_id, c_any.id)) AS cli2,
         COALESCE(c3.cliente_id, COALESCE(c1.cliente_id, c_any.id)) AS cli3,
         pp.producto_parametro_id
  FROM asesores a
  LEFT JOIN clientes_por_asesor c1 ON c1.asesor_id = a.asesor_id AND c1.rn = 1
  LEFT JOIN clientes_por_asesor c2 ON c2.asesor_id = a.asesor_id AND c2.rn = 2
  LEFT JOIN clientes_por_asesor c3 ON c3.asesor_id = a.asesor_id AND c3.rn = 3
  LEFT JOIN LATERAL (
    SELECT CAST(MIN(CAST(c.id AS text)) AS uuid) AS id FROM public.clientes c WHERE c.asesor_id = a.asesor_id
  ) c_any ON TRUE
  LEFT JOIN pp_prefer pp ON pp.asesor_id = a.asesor_id
)
INSERT INTO public.polizas (
  id, cliente_id, numero_poliza, estatus, fecha_emision, fecha_alta_sistema, forma_pago,
  prima_input, prima_moneda, prima_mxn, sa_input, sa_moneda, sa_mxn, clasificacion_actual,
  puntos_actuales, anulada_at, creado_por, creado_at, updated_at, fecha_renovacion, tipo_pago,
  dia_pago, meses_check, periodicidad_pago, producto_parametro_id
)
SELECT gen_random_uuid(), t.cli1,
       'DEMO-' || SUBSTR(t.asesor_id::text, 1, 8) || '-1',
       'EN_VIGOR', CURRENT_DATE, NOW(), 'MODO_DIRECTO',
       1000, 'MXN', 1000, NULL, NULL, NULL, 'CERO',
       0, NULL, NULL, NOW(), NOW(), NULL, NULL,
       NULL, '{}'::jsonb, NULL, t.producto_parametro_id
FROM targets t
UNION ALL
SELECT gen_random_uuid(), t.cli2,
       'DEMO-' || SUBSTR(t.asesor_id::text, 1, 8) || '-2',
       'EN_VIGOR', CURRENT_DATE, NOW(), 'MODO_DIRECTO',
       1000, 'MXN', 1000, NULL, NULL, NULL, 'CERO',
       0, NULL, NULL, NOW(), NOW(), NULL, NULL,
       NULL, '{}'::jsonb, NULL, t.producto_parametro_id
FROM targets t
UNION ALL
SELECT gen_random_uuid(), t.cli3,
       'DEMO-' || SUBSTR(t.asesor_id::text, 1, 8) || '-3',
       'EN_VIGOR', CURRENT_DATE, NOW(), 'MODO_DIRECTO',
       1000, 'MXN', 1000, NULL, NULL, NULL, 'CERO',
       0, NULL, NULL, NOW(), NOW(), NULL, NULL,
       NULL, '{}'::jsonb, NULL, t.producto_parametro_id
FROM targets t;

-- Recalculate puntos/commission cache for all new policies (triggers will also do this)
-- Optional: uncomment if bulk recalculation is desired
-- SELECT recalc_puntos_poliza_all(NULL);

COMMIT;
