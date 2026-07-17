-- Verificar el tipo de dato de la columna producto_parametro_id en la tabla polizas
SELECT 
    table_name,
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name = 'polizas' 
    AND column_name = 'producto_parametro_id';

-- Verificar el tipo de dato de la columna id en la tabla producto_parametros
SELECT 
    table_name,
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name = 'producto_parametros' 
    AND column_name = 'id';

-- Verificar foreign key constraints
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM
    information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name='polizas'
    AND kcu.column_name='producto_parametro_id';
