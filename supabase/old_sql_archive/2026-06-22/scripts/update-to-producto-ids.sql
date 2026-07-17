-- Actualizar métricas del usuario 4 para usar producto_parametro_ids en lugar de product_types

-- Eliminar la métrica antigua de polizas_por_tipo
DELETE FROM campaigns_custom_metrics 
WHERE usuario_id = 4 AND dataset = 'polizas_por_tipo';

-- Insertar nueva métrica usando el nuevo dataset polizas_por_producto con IDs reales
INSERT INTO campaigns_custom_metrics (usuario_id, dataset, metric, numeric_value, json_value)
VALUES (4, 'polizas_por_producto', 'cantidad', 2, 
  '{"producto_ids": ["4a2d3fd5-7332-46aa-90f6-a7d3979a1719", "c389e603-be14-4d53-aa7d-ada5c958be7c"]}'::jsonb)
ON CONFLICT (usuario_id, dataset, metric) 
DO UPDATE SET 
  numeric_value = EXCLUDED.numeric_value,
  json_value = EXCLUDED.json_value,
  updated_at = NOW();

SELECT 'Métricas actualizadas a polizas_por_producto' AS resultado;
