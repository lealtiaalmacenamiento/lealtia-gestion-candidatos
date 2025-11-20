-- Actualizar campañas para descomponer datasets complejos en reglas simples
-- Este script reemplaza las definiciones especiales con reglas usando datasets base

-- ============================================================================
-- 1. Actualizar campaña "reto-5000" - Descomponer vida_grupo_inicial
-- ============================================================================

-- Eliminar la regla antigua de vida_grupo_inicial si existe
DELETE FROM campaign_rules 
WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug = 'reto-5000')
  AND config->>'dataset' = 'vida_grupo_inicial';

-- Insertar nueva regla: polizas_prima_minima (ya debe existir)
-- Insertar nueva regla: polizas_recientes (ya debe existir)

-- ============================================================================
-- 2. Actualizar campaña "msi-inicial" - Descomponer msi_inicial
-- ============================================================================

-- Eliminar regla antigua
DELETE FROM campaign_rules 
WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug = 'msi-inicial')
  AND config->>'dataset' = 'msi_inicial';

-- Insertar regla 1: polizas_por_producto
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  c.id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'path', ARRAY['datasets', 'polizas_por_producto', 'cantidad'],
    'field', 'cantidad',
    'value', 1,
    'metric', 'cantidad',
    'source', 'polizas_por_producto',
    'dataset', 'polizas_por_producto',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number'
  ),
  0,
  'Al menos una póliza de VI, GMMI o AP emitida y pagada',
  1,
  'AND'
FROM campaigns c
WHERE c.slug = 'msi-inicial'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_rules cr 
    WHERE cr.campaign_id = c.id 
      AND cr.config->>'dataset' = 'polizas_por_producto'
      AND cr.description LIKE '%VI, GMMI o AP%'
  );

-- Insertar regla 2: polizas_recientes
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  c.id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'path', ARRAY['datasets', 'polizas_recientes', 'cantidad'],
    'field', 'cantidad',
    'value', 1,
    'metric', 'cantidad',
    'source', 'polizas_recientes',
    'dataset', 'polizas_recientes',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number',
    'dias_ventana', 30
  ),
  1,
  'Póliza inicial (emitida recientemente, primera del cliente)',
  1,
  'AND'
FROM campaigns c
WHERE c.slug = 'msi-inicial'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_rules cr 
    WHERE cr.campaign_id = c.id 
      AND cr.config->>'dataset' = 'polizas_recientes'
      AND cr.description LIKE '%inicial%'
  );

-- ============================================================================
-- 3. Actualizar campaña "msi-renovacion-gmm" - Descomponer msi_renovacion_gmmi
-- ============================================================================

DELETE FROM campaign_rules 
WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug = 'msi-renovacion-gmm')
  AND config->>'dataset' = 'msi_renovacion_gmmi';

-- Insertar regla 1: polizas_por_producto (GMMI)
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  c.id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'path', ARRAY['datasets', 'polizas_por_producto', 'cantidad'],
    'field', 'cantidad',
    'value', 1,
    'metric', 'cantidad',
    'source', 'polizas_por_producto',
    'dataset', 'polizas_por_producto',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number'
  ),
  0,
  'Al menos una póliza GMMI (producto específico)',
  1,
  'AND'
FROM campaigns c
WHERE c.slug = 'msi-renovacion-gmm'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_rules cr 
    WHERE cr.campaign_id = c.id 
      AND cr.config->>'dataset' = 'polizas_por_producto'
      AND cr.description LIKE '%GMMI%'
  );

-- Insertar regla 2: polizas vigentes
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  c.id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'path', ARRAY['polizas', 'vigentes'],
    'field', 'polizas_vigentes',
    'value', 1,
    'metric', 'polizas_vigentes',
    'source', 'polizas',
    'dataset', 'polizas',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number'
  ),
  1,
  'Póliza vigente (al corriente en pagos) para renovación',
  1,
  'AND'
FROM campaigns c
WHERE c.slug = 'msi-renovacion-gmm'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_rules cr 
    WHERE cr.campaign_id = c.id 
      AND cr.config->>'dataset' = 'polizas'
      AND cr.config->>'field' = 'polizas_vigentes'
  );

-- ============================================================================
-- 4. Actualizar campaña "tcp-tipo-cambio-preferencial" - Descomponer vida_dolares
-- ============================================================================

DELETE FROM campaign_rules 
WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug = 'tcp-tipo-cambio-preferencial')
  AND config->>'dataset' = 'vida_dolares';

-- Insertar regla 1: polizas_por_producto (VI)
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  c.id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'path', ARRAY['datasets', 'polizas_por_producto', 'cantidad'],
    'field', 'cantidad',
    'value', 1,
    'metric', 'cantidad',
    'source', 'polizas_por_producto',
    'dataset', 'polizas_por_producto',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number'
  ),
  0,
  'Al menos una póliza de Vida Individual',
  1,
  'AND'
FROM campaigns c
WHERE c.slug = 'tcp-tipo-cambio-preferencial'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_rules cr 
    WHERE cr.campaign_id = c.id 
      AND cr.config->>'dataset' = 'polizas_por_producto'
  );

-- Insertar regla 2: prima total mínima
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  c.id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'path', ARRAY['polizas', 'prima_total_mxn'],
    'field', 'prima_total_mxn',
    'value', 100000,
    'metric', 'prima_total_mxn',
    'source', 'polizas',
    'dataset', 'polizas',
    'operator', 'gte',
    'valueRaw', '100000',
    'valueType', 'number'
  ),
  1,
  'Prima equivalente mínima de $100,000 MXN (tipo de cambio $16.99)',
  1,
  'AND'
FROM campaigns c
WHERE c.slug = 'tcp-tipo-cambio-preferencial'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_rules cr 
    WHERE cr.campaign_id = c.id 
      AND cr.config->>'field' = 'prima_total_mxn'
  );

-- ============================================================================
-- 5. Actualizar campaña "regalos-momentum" - Descomponer momentum_prima_minima
-- ============================================================================

DELETE FROM campaign_rules 
WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug = 'regalos-momentum')
  AND config->>'dataset' = 'momentum_prima_minima';

-- Insertar regla 1: polizas_por_producto (Momentum)
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  c.id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'path', ARRAY['datasets', 'polizas_por_producto', 'cantidad'],
    'field', 'cantidad',
    'value', 1,
    'metric', 'cantidad',
    'source', 'polizas_por_producto',
    'dataset', 'polizas_por_producto',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number'
  ),
  0,
  'Al menos una póliza Momentum (producto específico)',
  1,
  'AND'
FROM campaigns c
WHERE c.slug = 'regalos-momentum'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_rules cr 
    WHERE cr.campaign_id = c.id 
      AND cr.config->>'dataset' = 'polizas_por_producto'
  );

-- Insertar regla 2: polizas_prima_minima
INSERT INTO campaign_rules (campaign_id, scope, rule_kind, config, priority, description, logical_group, logical_operator)
SELECT 
  c.id,
  'eligibility',
  'METRIC_CONDITION',
  jsonb_build_object(
    'path', ARRAY['datasets', 'polizas_prima_minima', 'cantidad'],
    'field', 'cantidad',
    'value', 1,
    'metric', 'cantidad',
    'source', 'polizas_prima_minima',
    'dataset', 'polizas_prima_minima',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number',
    'prima_minima_mxn', 50000
  ),
  1,
  'Prima mínima de $50,000 MXN por póliza',
  1,
  'AND'
FROM campaigns c
WHERE c.slug = 'regalos-momentum'
  AND NOT EXISTS (
    SELECT 1 FROM campaign_rules cr 
    WHERE cr.campaign_id = c.id 
      AND cr.config->>'dataset' = 'polizas_prima_minima'
  );

-- ============================================================================
-- 6. Actualizar campaña "nuevo-horizonte" - Reemplazar meta_comisiones
-- ============================================================================

UPDATE campaign_rules 
SET 
  config = jsonb_build_object(
    'path', ARRAY['polizas', 'comision_base_mxn'],
    'field', 'comision_base_mxn',
    'value', 50000,
    'metric', 'comision_base_mxn',
    'source', 'polizas',
    'dataset', 'polizas',
    'operator', 'gte',
    'valueRaw', '50000',
    'valueType', 'number'
  ),
  description = 'Acumular comisiones mínimas para la campaña (ajustar threshold según campaña)'
WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug = 'nuevo-horizonte')
  AND config->>'dataset' = 'meta_comisiones';

-- ============================================================================
-- 7. Actualizar campaña "convenciones-promotores" - Reemplazar meta_comisiones
-- ============================================================================

UPDATE campaign_rules 
SET 
  config = jsonb_build_object(
    'path', ARRAY['polizas', 'comision_base_mxn'],
    'field', 'comision_base_mxn',
    'value', 588500,
    'metric', 'comision_base_mxn',
    'source', 'polizas',
    'dataset', 'polizas',
    'operator', 'gte',
    'valueRaw', '588500',
    'valueType', 'number'
  ),
  description = 'Comisiones mínimas acumuladas para clasificar a convenciones'
WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug = 'convenciones-promotores')
  AND config->>'dataset' = 'meta_comisiones';

-- ============================================================================
-- Verificar resultados
-- ============================================================================

SELECT 
  c.slug,
  c.name,
  cr.scope,
  cr.rule_kind,
  cr.config->>'dataset' as dataset,
  cr.config->>'field' as field,
  cr.description,
  cr.priority
FROM campaigns c
JOIN campaign_rules cr ON c.id = cr.campaign_id
WHERE c.slug IN (
  'reto-5000',
  'msi-inicial', 
  'msi-renovacion-gmm',
  'tcp-tipo-cambio-preferencial',
  'regalos-momentum',
  'nuevo-horizonte',
  'convenciones-promotores'
)
ORDER BY c.slug, cr.priority;
