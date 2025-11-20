-- Actualizar regla de campaña Reto 5000 para usar datasets granulares
-- Reemplaza vida_grupo_inicial.polizas_validas con polizas_por_tipo.cantidad

UPDATE campaign_rules 
SET 
  config = jsonb_build_object(
    'path', ARRAY['datasets', 'polizas_por_tipo', 'cantidad'],
    'field', 'cantidad',
    'value', 1,
    'metric', 'cantidad',
    'source', 'polizas_por_tipo',
    'dataset', 'polizas_por_tipo',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number',
    'product_types', ARRAY['VI']
  ),
  description = 'Usuario debe tener al menos 1 póliza VI (Vida Individual)'
WHERE campaign_id = '60460458-7d05-4193-88a9-e2248345bfeb' 
  AND rule_kind = 'METRIC_CONDITION'
  AND config->>'dataset' = 'vida_grupo_inicial'
  AND config->>'field' = 'polizas_validas';
  
SELECT 'Regla actualizada correctamente' AS resultado, id, priority, description 
FROM campaign_rules 
WHERE campaign_id = '60460458-7d05-4193-88a9-e2248345bfeb' 
  AND config->>'dataset' = 'polizas_por_tipo';
