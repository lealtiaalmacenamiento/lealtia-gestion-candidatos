-- Verificar estructura de las 6 tablas que necesitan RLS

-- campaigns_custom_metrics
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campaigns_custom_metrics'
ORDER BY ordinal_position;

-- usuarios
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios'
ORDER BY ordinal_position;

-- tokens_integracion
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tokens_integracion'
ORDER BY ordinal_position;

-- agente_meta
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agente_meta'
ORDER BY ordinal_position;

-- prospectos
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'prospectos'
ORDER BY ordinal_position;

-- logs_integracion
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'logs_integracion'
ORDER BY ordinal_position;
