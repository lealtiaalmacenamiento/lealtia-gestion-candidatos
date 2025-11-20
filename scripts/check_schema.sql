-- Check table structures
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('usuarios', 'clientes', 'polizas')
  AND column_name IN ('id', 'id_auth', 'asesor_id', 'cliente_id')
ORDER BY table_name, column_name;
