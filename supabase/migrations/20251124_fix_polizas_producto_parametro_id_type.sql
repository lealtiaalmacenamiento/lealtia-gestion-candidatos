-- Fix: Corregir tipo de dato de producto_parametro_id en polizas
-- Fecha: 2025-11-24
-- Ambiente: develop (aplicar solo si la columna es bigint en lugar de uuid)

-- Este script corrige el tipo de dato de la columna producto_parametro_id 
-- en la tabla polizas de bigint a uuid

DO $$
DECLARE
  v_current_type text;
BEGIN
  -- Verificar el tipo actual de la columna
  SELECT data_type INTO v_current_type
  FROM information_schema.columns
  WHERE table_name = 'polizas' 
    AND column_name = 'producto_parametro_id';

  -- Log del tipo actual
  RAISE NOTICE 'Tipo actual de producto_parametro_id: %', v_current_type;

  -- Solo aplicar la corrección si el tipo es bigint
  IF v_current_type = 'bigint' THEN
    RAISE NOTICE 'Aplicando corrección: bigint -> uuid';

    -- Quitar foreign key constraint si existe
    ALTER TABLE polizas 
    DROP CONSTRAINT IF EXISTS polizas_producto_parametro_id_fkey;

    -- Cambiar tipo de columna a uuid
    -- NOTA: Esto fallará si hay datos inválidos en la columna
    ALTER TABLE polizas 
    ALTER COLUMN producto_parametro_id TYPE uuid 
    USING CASE 
      WHEN producto_parametro_id IS NULL THEN NULL
      ELSE producto_parametro_id::text::uuid
    END;

    -- Recrear foreign key constraint
    ALTER TABLE polizas
    ADD CONSTRAINT polizas_producto_parametro_id_fkey 
    FOREIGN KEY (producto_parametro_id) 
    REFERENCES producto_parametros(id);

    RAISE NOTICE 'Corrección aplicada exitosamente';
  ELSIF v_current_type = 'uuid' THEN
    RAISE NOTICE 'La columna ya es de tipo uuid, no se requiere corrección';
  ELSE
    RAISE WARNING 'Tipo de dato inesperado: %. Se esperaba bigint o uuid.', v_current_type;
  END IF;
END $$;

-- Verificar el resultado
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'polizas' 
  AND column_name = 'producto_parametro_id';
