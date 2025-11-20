-- Debug: Check what the function returns
SELECT 
  u.id,
  u.email,
  calculate_campaign_datasets_for_user(u.id) as calculated_datasets
FROM usuarios u
WHERE u.email = 'paopecina3@gmail.com';

-- Check actual policies
SELECT 
  COUNT(*) as total_polizas,
  COUNT(*) FILTER (WHERE p.prima_mxn >= 25000) as polizas_25k,
  COUNT(*) FILTER (WHERE p.prima_mxn >= 50000) as polizas_50k,
  MIN(p.prima_mxn) as min_prima,
  MAX(p.prima_mxn) as max_prima,
  MAX(p.fecha_emision) as ultima_emision,
  (CURRENT_DATE - MAX(p.fecha_emision)) as dias_desde_ultima
FROM polizas p
JOIN clientes c ON c.id = p.cliente_id
JOIN usuarios u ON c.asesor_id = u.id_auth
WHERE u.email = 'paopecina3@gmail.com'
  AND p.estatus != 'ANULADA';
