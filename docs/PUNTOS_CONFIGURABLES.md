# Configuración de Puntos por Tipo de Producto

## Descripción

Sistema configurable que permite a supervisores y administradores modificar los umbrales de prima para asignar puntos y clasificaciones a las pólizas, sin necesidad de cambiar código.

## ¿Qué cambió?

### Antes (Hardcodeado)

Los umbrales estaban hardcodeados en la función `recalc_puntos_poliza`:

**GMM (Gastos Médicos Mayores):**
- Prima < $7,500 → 0 puntos (CERO)
- Prima ≥ $7,500 → 0.5 puntos (MEDIO)

**VI (Vida Individual):**
- Prima < $15,000 → 0 puntos (CERO)
- Prima $15,000 - $50,000 → 1 punto (SIMPLE)
- Prima $50,000 - $150,000 → 2 puntos (DOBLE)
- Prima ≥ $150,000 → 3 puntos (TRIPLE)

### Ahora (Configurable)

Los umbrales se almacenan en la tabla `puntos_thresholds` y pueden ser modificados desde el módulo de **Parámetros** en la interfaz web.

## Arquitectura

### Base de Datos

**Nueva tabla: `puntos_thresholds`**
```sql
CREATE TABLE puntos_thresholds (
  id uuid PRIMARY KEY,
  tipo_producto tipo_producto NOT NULL,  -- 'GMM' o 'VI'
  umbral_min numeric(14,2) NOT NULL,     -- Prima mínima
  umbral_max numeric(14,2) NULL,         -- Prima máxima (NULL = sin límite)
  puntos numeric(10,2) NOT NULL,         -- Puntos asignados
  clasificacion tipo_clasificacion_puntos NOT NULL,  -- CERO, SIMPLE, MEDIO, DOBLE, TRIPLE
  descripcion text NULL,
  orden int NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz,
  updated_at timestamptz
);
```

**Función modificada: `recalc_puntos_poliza`**

Ahora busca en `puntos_thresholds` en lugar de usar valores hardcodeados:

```sql
SELECT *
FROM puntos_thresholds
WHERE tipo_producto = v_tipo
  AND activo = true
  AND v_prima_mxn >= umbral_min
  AND (umbral_max IS NULL OR v_prima_mxn < umbral_max)
ORDER BY orden
LIMIT 1;
```

### Backend

**Nuevo endpoint: `/api/parametros/puntos-thresholds`**

- `GET` - Obtener todos los umbrales
- `POST` - Crear nuevo umbral
- `PATCH` - Actualizar umbral existente
- `DELETE` - Eliminar umbral

### Frontend

**Nuevo componente: `PuntosThresholdsSection`**

Ubicación: `src/app/(private)/parametros/PuntosThresholdsSection.tsx`

Integrado en el módulo de Parámetros, muestra dos tablas separadas (GMM y VI) con funcionalidad completa CRUD.

## Uso

### Ver y modificar umbrales

1. Ir a **Parámetros** desde el menú principal
2. Scroll hasta la sección **"Configuración de Puntos por Producto"**
3. Ver umbrales actuales agrupados por tipo (GMM / VI)
4. Editar valores haciendo clic en el botón "Editar"
5. Los cambios se aplican inmediatamente a nuevos cálculos

### Agregar nuevo umbral

1. Click en botón **"Añadir Umbral"**
2. Seleccionar tipo de producto (GMM / VI)
3. Definir:
   - **Orden**: Define prioridad en caso de rangos superpuestos
   - **Prima Mínima**: Límite inferior (MXN)
   - **Prima Máxima**: Límite superior (dejar vacío = sin límite)
   - **Puntos**: Cantidad de puntos a asignar
   - **Clasificación**: CERO, SIMPLE, MEDIO, DOBLE, TRIPLE
   - **Descripción**: Texto explicativo
   - **Activo**: Si el umbral está activo
4. Click en **"Crear"**

### Recalcular pólizas existentes

Después de cambiar umbrales, las pólizas existentes mantienen su clasificación anterior hasta que:

1. Se actualice la póliza (cualquier campo)
2. Se ejecute un recálculo manual

Para recalcular todas las pólizas:

```sql
-- Ejecutar en psql o herramienta SQL
DO $$
DECLARE
  pol_record RECORD;
BEGIN
  FOR pol_record IN 
    SELECT id FROM polizas WHERE estatus = 'EN_VIGOR'
  LOOP
    PERFORM recalc_puntos_poliza(pol_record.id);
  END LOOP;
END $$;
```

## Campos importantes

### `orden`
Define la prioridad de aplicación cuando hay rangos superpuestos. Menor número = mayor prioridad.

### `umbral_max = NULL`
Significa "sin límite superior". Útil para el último rango (ej: "≥ $150,000").

### `activo`
Permite deshabilitar umbrales sin eliminarlos. Los umbrales inactivos no se usan en cálculos.

## Reglas de negocio

1. **Un solo umbral por póliza**: La consulta usa `LIMIT 1` ordenado por `orden`, asegurando que solo se aplique un umbral.

2. **Valores en MXN**: Todas las primas se normalizan a MXN antes de comparar con umbrales (usando tasas FX/UDI actuales).

3. **Fallback a CERO**: Si no se encuentra umbral aplicable, se asigna 0 puntos y clasificación CERO.

4. **RLS**: Solo usuarios con rol `admin` o `supervisor` pueden modificar umbrales.

## Archivos creados/modificados

### Migraciones SQL
- `supabase/migrations/20260122_add_puntos_thresholds.sql`
- `supabase/migrations/20260122_update_recalc_puntos_poliza.sql`

### Backend
- `src/app/api/parametros/puntos-thresholds/route.ts`

### Frontend
- `src/app/(private)/parametros/PuntosThresholdsSection.tsx`
- `src/app/(private)/parametros/ParametrosClient.tsx` (modificado)

### Tipos
- `src/types/index.ts` (agregado `PuntosThreshold`, `ClasificacionPuntos`)

### Scripts
- `scripts/verify-puntos-thresholds.sql`

## Ejemplos de configuración

### GMM Estándar
```
Orden 1: $0 - $7,500 → 0 puntos (CERO)
Orden 2: $7,500 - ∞ → 0.5 puntos (MEDIO)
```

### VI Progresivo
```
Orden 1: $0 - $15,000 → 0 puntos (CERO)
Orden 2: $15,000 - $50,000 → 1 punto (SIMPLE)
Orden 3: $50,000 - $150,000 → 2 puntos (DOBLE)
Orden 4: $150,000 - ∞ → 3 puntos (TRIPLE)
```

### VI Agresivo (incentivar primas altas)
```
Orden 1: $0 - $25,000 → 0 puntos (CERO)
Orden 2: $25,000 - $75,000 → 1 punto (SIMPLE)
Orden 3: $75,000 - $200,000 → 3 puntos (TRIPLE)
Orden 4: $200,000 - ∞ → 5 puntos (CUSTOM)
```

## Testing

1. Verificar umbrales iniciales:
```bash
psql -h <host> -U postgres -d postgres -f scripts/verify-puntos-thresholds.sql
```

2. Probar en interfaz:
   - Crear póliza con prima justo debajo de umbral
   - Crear póliza con prima justo arriba de umbral
   - Verificar que se asignen puntos/clasificación correctos

3. Probar modificación:
   - Cambiar umbral GMM de $7,500 a $10,000
   - Recalcular póliza con prima $8,000
   - Verificar que cambió de MEDIO a CERO

## Seguridad

- **RLS habilitado**: Solo admin/supervisor pueden modificar
- **Validaciones frontend**: Evitan valores inválidos
- **Políticas SELECT abiertas**: Cualquier usuario autenticado puede ver umbrales

## Soporte

Para preguntas o problemas:
- Revisar logs de servidor Next.js
- Verificar permisos de usuario (debe ser admin/supervisor)
- Consultar tabla `puntos_thresholds` directamente en BD
