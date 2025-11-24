# Fix: Error al dar de alta póliza - "invalid input syntax for type bigint"

## Problema
Al intentar dar de alta una póliza en el ambiente develop, se recibe el siguiente error:

```
invalid input syntax for type bigint: "eb70746d-19a5-4b27-b4af-67ed052c9e83"
```

## Causa
El error indica que PostgreSQL está intentando insertar un UUID (eb70746d-19a5-4b27-b4af-67ed052c9e83) en una columna que espera un tipo `bigint`. Esto sugiere un problema de tipo de dato en la columna `producto_parametro_id` de la tabla `polizas`.

### Diagnóstico
1. **Schema esperado**: Según las migraciones (`20250914_fase3_squash.sql`), la columna `producto_parametro_id` debería ser de tipo `uuid`:
   ```sql
   producto_parametro_id uuid NULL REFERENCES producto_parametros(id)
   ```

2. **Posibles causas**:
   - La migración no se aplicó correctamente en el ambiente develop
   - Existe una versión anterior de la tabla con un tipo de dato diferente
   - Hay un problema de sincronización entre el código y el schema de BD

## Solución

### Paso 1: Verificar el tipo de dato en develop
Ejecutar el script de diagnóstico:

```bash
# Usando el script de utilidad
node scripts/run_sql.js scripts/check-polizas-schema.sql
```

### Paso 2: Aplicar fix en el código
Se ha actualizado el endpoint `POST /api/polizas` para forzar la conversión a string del `producto_parametro_id`:

**Archivo**: `src/app/api/polizas/route.ts` línea ~272

**Cambio**:
```typescript
// Antes
producto_parametro_id: producto_parametro_id || null,

// Después  
producto_parametro_id: producto_parametro_id ? String(producto_parametro_id) : null,
```

### Paso 3: Verificar/Corregir el schema de BD (si es necesario)
Si el diagnóstico muestra que la columna es de tipo `bigint` en lugar de `uuid`, ejecutar la siguiente migración correctiva:

```sql
-- Verificar tipo actual
SELECT data_type FROM information_schema.columns 
WHERE table_name = 'polizas' AND column_name = 'producto_parametro_id';

-- Si el resultado es 'bigint' en lugar de 'uuid', ejecutar:
BEGIN;

-- Quitar foreign key constraint si existe
ALTER TABLE polizas 
DROP CONSTRAINT IF EXISTS polizas_producto_parametro_id_fkey;

-- Cambiar tipo de columna a uuid
ALTER TABLE polizas 
ALTER COLUMN producto_parametro_id TYPE uuid USING producto_parametro_id::text::uuid;

-- Recrear foreign key constraint
ALTER TABLE polizas
ADD CONSTRAINT polizas_producto_parametro_id_fkey 
FOREIGN KEY (producto_parametro_id) 
REFERENCES producto_parametros(id);

COMMIT;
```

### Paso 4: Reintentar el alta de póliza
Una vez aplicada la corrección, volver a intentar dar de alta la póliza desde la interfaz.

## Testing
Para verificar que el fix funciona:

1. Ir a la página de Gestión de Clientes
2. Seleccionar un cliente existente
3. Intentar agregar una nueva póliza con todos los campos requeridos:
   - Producto parametrizado (seleccionar de la lista)
   - Número de póliza
   - Fecha de emisión
   - Periodicidad (A/S/T/M)
   - Método de pago
   - Prima anual

4. Verificar que se crea exitosamente sin errores

## Notas adicionales
- Este error también podría ocurrir si hay un mismatch entre las migraciones aplicadas en develop vs producción
- Se recomienda verificar el estado de las migraciones con:
  ```sql
  SELECT * FROM supabase_migrations.schema_migrations 
  ORDER BY version DESC LIMIT 10;
  ```
- La columna `producto_parametro_id` en la tabla `polizas` debe ser siempre de tipo `uuid` para mantener consistencia con la tabla `producto_parametros`
