-- Actualizar regla de campaña Reto 5000 para usar polizas_por_producto con IDs de productos

UPDATE campaign_rules 
SET 
  config = jsonb_build_object(
    'path', ARRAY['datasets', 'polizas_por_producto', 'cantidad'],
    'field', 'cantidad',
    'value', 1,
    'metric', 'cantidad',
    'source', 'polizas_por_producto',
    'dataset', 'polizas_por_producto',
    'operator', 'gte',
    'valueRaw', '1',
    'valueType', 'number',
    'producto_ids', ARRAY['4a2d3fd5-7332-46aa-90f6-a7d3979a1719', 'c389e603-be14-4d53-aa7d-ada5c958be7c']
  ),
  description = 'Usuario debe tener al menos 1 póliza de los productos VI seleccionados'
WHERE campaign_id = '60460458-7d05-4193-88a9-e2248345bfeb' 
  AND rule_kind = 'METRIC_CONDITION'
  AND config->>'dataset' = 'polizas_por_tipo';
  
SELECT 'Regla actualizada a polizas_por_producto' AS resultado, id, priority, description 
FROM campaign_rules 
WHERE campaign_id = '60460458-7d05-4193-88a9-e2248345bfeb' 
  AND config->>'dataset' = 'polizas_por_producto';
