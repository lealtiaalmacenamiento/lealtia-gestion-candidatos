# Sistema de Proyección de UDI

Sistema completo para obtener valores históricos de UDI desde Banxico y generar proyecciones a 65 años.

## Arquitectura

```
scripts/
  ├── ingest_banxico.ts    # Ingesta datos reales de API Banxico
  └── project_udi.ts        # Genera proyecciones a 65 años

src/
  ├── lib/udi.ts            # Funciones helper para UDI
  ├── hooks/useUDI.ts       # React hooks para componentes
  └── components/
      └── UDICalculator.tsx # Componente calculadora de ejemplo

supabase/migrations/
  └── 20260207_add_udi_projection_column.sql  # Schema con columna is_projection
```

## Configuración Inicial

### 1. Variables de Entorno

Agregar en `.env.local`:

```bash
# API de Banxico
BANXICO_TOKEN=tu-token-de-banxico

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key

# Opcional: para cron jobs
CRON_SECRET=tu-secreto-para-cron
```

### 2. Aplicar Migración SQL

```bash
# Ejecutar la migración en Supabase
psql -h tu-db.supabase.co -U postgres -d postgres -f supabase/migrations/20260207_add_udi_projection_column.sql
```

O desde el dashboard de Supabase: SQL Editor → Pegar contenido de la migración → Run.

## Uso

### Comandos NPM

```bash
# 1. Ingestar datos reales de Banxico (últimos 365 días por defecto)
npm run udi:ingest

# 2. Generar proyecciones a 65 años
npm run udi:project

# 3. Hacer ambas cosas (actualización completa)
npm run udi:update
```

### Uso en Código

#### Funciones Helper

```typescript
import { 
  getUDIValue, 
  calcularValorFuturoUDI,
  convertirPesosAUDI 
} from '@/lib/udi'

// Obtener valor de UDI para una fecha
const result = await getUDIValue('2026-02-07')
console.log(result.valor) // 8.123456
console.log(result.is_projection) // false

// Calcular valor futuro
const futuro = await calcularValorFuturoUDI(
  10000,           // $10,000 MXN hoy
  '2026-02-07',    // Fecha actual
  '2091-02-07'     // 65 años en el futuro
)
console.log(futuro.montoFuturo) // $64,816.78 MXN (aprox)
console.log(futuro.esProyeccion) // true

// Convertir pesos a UDIs
const udis = await convertirPesosAUDI(10000, '2026-02-07')
console.log(udis) // 1230.45 UDIs (aprox)
```

#### React Hooks

```typescript
import { useUDIValue, useValorFuturoUDI } from '@/hooks/useUDI'

function MiComponente() {
  // Obtener valor de UDI
  const { data, loading } = useUDIValue('2026-02-07')
  
  // Calcular valor futuro
  const { resultado } = useValorFuturoUDI(
    10000,
    '2026-02-07',
    '2091-02-07'
  )
  
  if (loading) return <div>Cargando...</div>
  
  return (
    <div>
      <p>UDI actual: {data?.valor}</p>
      <p>Valor futuro: ${resultado?.montoFuturo}</p>
    </div>
  )
}
```

#### Componente Calculadora

```typescript
import UDICalculator from '@/components/UDICalculator'

export default function MiPagina() {
  return (
    <div>
      <h1>Calculadora de UDI</h1>
      <UDICalculator />
    </div>
  )
}
```

### Consultas SQL Directas

```sql
-- Obtener último valor real (no proyectado)
SELECT fecha, valor
FROM udi_values
WHERE is_projection = false
ORDER BY fecha DESC
LIMIT 1;

-- Obtener valor proyectado para una fecha específica
SELECT fecha, valor, is_projection
FROM udi_values
WHERE fecha = '2091-02-07';

-- Obtener proyecciones de los próximos 10 años
SELECT fecha, valor
FROM udi_values
WHERE is_projection = true
  AND fecha <= CURRENT_DATE + INTERVAL '10 years'
ORDER BY fecha;

-- Comparar valor actual vs 65 años después
WITH valores AS (
  SELECT 
    (SELECT valor FROM udi_values WHERE is_projection = false ORDER BY fecha DESC LIMIT 1) as actual,
    (SELECT valor FROM udi_values WHERE fecha = CURRENT_DATE + INTERVAL '65 years' LIMIT 1) as futuro
)
SELECT 
  actual,
  futuro,
  ((futuro / actual) - 1) * 100 as incremento_porcentual
FROM valores;
```

## Automatización

### Cron Job en Vercel

Agregar en `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron/update-udi",
    "schedule": "0 2 * * *"
  }]
}
```

Esto ejecutará la actualización diariamente a las 2:00 AM UTC.

### Cron Job Manual (Linux/Mac)

```bash
# Editar crontab
crontab -e

# Agregar línea (ejecutar diario a las 2:00 AM)
0 2 * * * cd /ruta/al/proyecto && npm run udi:update >> /tmp/udi-update.log 2>&1
```

## Metodología de Proyección

Las proyecciones de UDI se basan en:

1. **Meta de inflación de Banxico**: 3% anual
2. **Crecimiento compuesto diario**: `(1 + 0.03)^(1/365) - 1`
3. **Proyección lineal**: Se aplica la tasa diaria sobre el último valor real

### Fórmula

```
UDI_futuro = UDI_actual × (1 + tasa_diaria)^días
```

Donde:
- `tasa_diaria = (1.03)^(1/365) - 1 ≈ 0.0000808`
- `días` = diferencia en días entre fecha actual y futura

### Precisión

- **Corto plazo (0-5 años)**: Alta precisión si la inflación se mantiene cerca del 3%
- **Mediano plazo (5-20 años)**: Buena aproximación bajo estabilidad económica
- **Largo plazo (20-65 años)**: Proyección conservadora basada en meta oficial

## Mantenimiento

### Regenerar Proyecciones

Si cambia la meta de inflación o se necesita ajustar la proyección:

1. Editar `ANNUAL_INFLATION_RATE` en [scripts/project_udi.ts](scripts/project_udi.ts)
2. Ejecutar: `npm run udi:project`

### Verificar Integridad

```sql
-- Verificar que no haya gaps en fechas
SELECT 
  fecha,
  LEAD(fecha) OVER (ORDER BY fecha) as siguiente_fecha,
  LEAD(fecha) OVER (ORDER BY fecha) - fecha as dias_diferencia
FROM udi_values
WHERE is_projection = false
HAVING dias_diferencia > 1;

-- Contar registros reales vs proyectados
SELECT 
  is_projection,
  COUNT(*) as total,
  MIN(fecha) as fecha_min,
  MAX(fecha) as fecha_max
FROM udi_values
GROUP BY is_projection;
```

## Troubleshooting

### Error: "No se pudo obtener el último valor de UDI"

**Causa**: No hay datos reales en la tabla.

**Solución**: Ejecutar `npm run udi:ingest` primero.

### Error de autenticación en Banxico

**Causa**: Token inválido o expirado.

**Solución**: 
1. Verificar `BANXICO_TOKEN` en `.env.local`
2. Renovar token en https://www.banxico.org.mx/SieAPIRest/

### Proyecciones no se actualizan

**Causa**: Migración SQL no aplicada.

**Solución**: 
1. Verificar columna: `SELECT is_projection FROM udi_values LIMIT 1;`
2. Si falla, aplicar migración SQL

## Referencias

- [API de Banxico (SIE)](https://www.banxico.org.mx/SieAPIRest/)
- [Serie UDI: SP68257](https://www.banxico.org.mx/SieInternet/consultarDirectorioInternetAction.do?sector=8&accion=consultarCuadro&idCuadro=CP151&locale=es)
- [Meta de inflación Banxico](https://www.banxico.org.mx/politica-monetaria-e-inflacion/index.html)
