-- Actualizar métricas granulares para usuario ID 4 (paopecina3@gmail.com)
-- Este usuario tiene 2 pólizas VI que deben contar para las campañas

-- Polizas por tipo: 2 pólizas VI
INSERT INTO campaigns_custom_metrics (usuario_id, dataset, metric, numeric_value, json_value)
VALUES (4, 'polizas_por_tipo', 'cantidad', 2, '{"product_types": ["VI"]}'::jsonb)
ON CONFLICT (usuario_id, dataset, metric) 
DO UPDATE SET 
  numeric_value = EXCLUDED.numeric_value,
  json_value = EXCLUDED.json_value,
  updated_at = NOW();

-- Polizas prima mínima: 2 pólizas con prima >= 25000 MXN
INSERT INTO campaigns_custom_metrics (usuario_id, dataset, metric, numeric_value, json_value)
VALUES (4, 'polizas_prima_minima', 'cantidad', 2, '{"prima_minima_mxn": 25000}'::jsonb)
ON CONFLICT (usuario_id, dataset, metric) 
DO UPDATE SET 
  numeric_value = EXCLUDED.numeric_value,
  json_value = EXCLUDED.json_value,
  updated_at = NOW();

-- Polizas recientes: 1 póliza emitida hoy
INSERT INTO campaigns_custom_metrics (usuario_id, dataset, metric, numeric_value, json_value)
VALUES (4, 'polizas_recientes', 'cantidad', 1, '{"dias_ventana": 30}'::jsonb)
ON CONFLICT (usuario_id, dataset, metric) 
DO UPDATE SET 
  numeric_value = EXCLUDED.numeric_value,
  json_value = EXCLUDED.json_value,
  updated_at = NOW();

-- Última emisión fue hoy (0 días)
INSERT INTO campaigns_custom_metrics (usuario_id, dataset, metric, numeric_value, json_value)
VALUES (4, 'polizas_recientes', 'ultima_emision_dias', 0, NULL)
ON CONFLICT (usuario_id, dataset, metric) 
DO UPDATE SET 
  numeric_value = EXCLUDED.numeric_value,
  updated_at = NOW();

SELECT 'Métricas actualizadas correctamente para usuario 4' AS resultado;
