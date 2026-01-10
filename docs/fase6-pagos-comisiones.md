# Fase 6 · Pagos mensuales y comisiones de pólizas

## 1. Objetivo funcional
- Permitir que asesores registren cobros mensuales de cada póliza y conocer la comisión esperada por periodo.
- Generar alertas cuando un pago esté próximo o vencido.
- Mostrar a supervisores el monto de comisión esperado en el mes en curso.

## 2. Modelo de datos
1. **Tabla `poliza_pagos_mensuales`**
   - `id` bigint PK.
   - `poliza_id` (uuid/bigint según esquema actual) FK -> `polizas` (cascade delete).
   - `periodo_mes` (date, uso primer día del mes) para identificar año/mes.
   - `fecha_programada` (date) calculada con periodicidad + día de cobro.
   - `fecha_limite` (date) editable; default = último día del mes.
   - `monto_programado` (numeric) = prima anual / periodicidad.
   - `monto_pagado` (numeric, nullable).
   - `fecha_pago_real` (timestamp tz, nullable).
   - `estado` enum {`pendiente`, `pagado`, `vencido`, `omitido`}.
   - `notas` text, `created_by`, `updated_by`, `created_at`, `updated_at`.
2. **Campos nuevos y existentes en `polizas`**
   - `fecha_limite_pago` (date) **⚠️ AGREGAR ESTE CAMPO** - fecha límite para pago del periodo.
   - `periodicidad_pago` (enum: 'mensual', 'trimestral', 'semestral', 'anual') **✅ MODIFICAR VALORES** - actualmente tiene códigos cortos.
   - `dia_pago` (smallint, CHECK 1-31) **✅ YA EXISTE** - día de mes para cobro recurrente.
   - `meses_check` (jsonb) **✅ YA EXISTE** - uso visual en frontend, no requiere lógica adicional en Fase 6.

**NOTA**: 
- Se usará `prima_mxn` (prima calculada en pesos) para montos programados.
- El sistema actual ya tiene `tipo_pago` y `forma_pago` que complementan la funcionalidad.
3. **Vistas/funciones**
   - `fn_generar_pagos_programados(poliza_id uuid)` -> (periodos) usada por triggers.
   - `vw_agente_comision_mes_actual` con columnas: `agente_id`, `importe_programado`, `importe_pagado`, `importe_pendiente`.

## 3. Migraciones
1. Crear enum `poliza_pago_estado` (pendiente, pagado, vencido, omitido).
2. **Modificar enum `periodicidad_pago` existente**: cambiar de códigos ('A','S','T','M') a valores legibles ('anual','semestral','trimestral','mensual').
3. Agregar campo `fecha_limite_pago` a `polizas`.
4. Crear tabla `poliza_pagos_mensuales` + índices:
   - `UNIQUE(poliza_id, periodo_mes)`.
   - Índice por `estado` y `fecha_limite` para alertas.
   - Índice por `poliza_id` para joins frecuentes.
5. Funciones:
   - `fn_generar_pagos_programados` (SQL/PLpgSQL) calcula periodos desde `fecha_emision` hasta fin de vigencia o 12 meses.
   - Trigger `trg_polizas_generar_pagos` (AFTER INSERT/UPDATE) que regenera periodos si cambian `prima_mxn`, `periodicidad_pago`, `fecha_emision` o `fecha_limite_pago`.
   - ⚠️ **IMPORTANTE**: El trigger solo elimina/regenera periodos con `estado = 'pendiente'` para no perder registros de pagos ya realizados.
5. Vista `vw_agente_comision_mes_actual` (usa tabla agentes/polizas + reglas de comisión existentes).

## 4. Backend / API
| Método | Ruta | Detalle |
| --- | --- | --- |
| GET | `/api/polizas/{id}/pagos` | Devuelve periodos ordenados con estados, montos y alertas calculadas (flag `isOverdue`, `isDueSoon`). |
| POST | `/api/polizas/{id}/pagos/{periodo}` | Marca un periodo como pagado o actualiza datos. Payload: `{ monto_pagado?, fecha_pago?, notas? }`. Valida default = `monto_programado`. |
| POST | `/api/polizas/{id}/pagos/generar` | Recalcula programados sin duplicar pagos ya registrados. Uso interno tras editar póliza. |
| GET | `/api/pagos/alertas?scope=asesor|supervisor` | Lista periodos `vencido` o `pendiente` con `fecha_limite <= hoy + 7`. |
| GET | `/api/agentes/{id}/comision-mes` | Resumen mes actual desde la vista `vw_agente_comision_mes_actual`. |

**Reglas**
- Al marcar pago: validar que periodo no esté cerrado; registrar usuario y timestamp.
- Calcular comisión del periodo = `monto_programado * (base_factor / 100)` donde `base_factor` proviene de `poliza_puntos_cache` (porcentaje real de comisión por póliza).
- El `monto_programado` se calcula como: `prima_mxn / divisor_periodicidad` (mensual=12, trimestral=4, semestral=2, anual=1).
- API debe emitir evento/auditoría para historial.

## 5. Jobs / alertas

### Automatización de pagos vencidos
**⚠️ Optimizado para Supabase Plan Free** (pg_cron no disponible)

**Opción recomendada: Edge Function + GitHub Actions**
- Edge Function `/actualizar-pagos-vencidos` que:
  1. Marca `estado = 'vencido'` en periodos con `estado = 'pendiente'` AND `fecha_limite < current_date`.
  2. Retorna cantidad de registros actualizados.
- GitHub Actions workflow ejecuta la función diariamente (2 AM CST).

### Notificaciones (in-app únicamente)
**Eventos que generan alertas:**
1. **Pago vencido**: `fecha_limite` pasó y `estado = 'pendiente'` → Notificación in-app al asesor y supervisor.
2. **Pago próximo**: `fecha_limite` dentro de 7 días y `estado = 'pendiente'` → Recordatorio in-app al asesor.
3. **Pago registrado**: Confirmación in-app al asesor cuando marca un pago como pagado.

**Implementación**:
- Crear tabla `notificaciones` si no existe, con campos: `id`, `usuario_id`, `tipo`, `titulo`, `mensaje`, `leida`, `metadata` (jsonb), `created_at`.
- Usar Supabase Realtime para notificaciones en tiempo real (suscripción a tabla `notificaciones` filtrada por `usuario_id`).
- Badge/contador en navbar mostrando notificaciones no leídas.
- Panel lateral o dropdown para listar y marcar como leídas.

### Cache
- Endpoint `/api/pagos/alertas` debe cachearse con revalidate cada hora usando Next.js ISR.
- Dashboard de comisiones puede usar Supabase materialized views con refresh manual o programado.

## 6. Front-end
### Clientes / Pólizas (asesor)
1. **Formulario:**
   - Agregar campos “Fecha límite de pago”, “Periodicidad”, “Día de pago”.
   - Validar consistencia y mostrar preview de mensualidad.
2. **Sección nueva “Pagos programados”**
   - Tabla por meses (solo los generados). Columnas: `Mes`, `Monto programado`, `Estado`, `Acciones`.
   - Checkbox o botón “Marcar pagado” abre modal:
     - Inputs: `Monto pagado` (default = mensualidad), `Fecha de pago`, `Notas`.
3. **Alertas visuales**
   - Badge rojo = vencido, ámbar = próximo, verde = pagado.
   - Banner en detalle de cliente cuando existan pagos vencidos.
4. **Dashboard asesor**
   - Widget “Pagos pendientes” con conteo y enlaces directos a pólizas.

### Vista Supervisores
- En cada acordeón de agente, badge “Comisión mes actual: $X (pagado Y / pendiente Z)”.
- Tooltip o modal con desglose por póliza.
- Sección “Alertas del equipo” listando pagos vencidos.

## 7. Dashboard de Comisiones por Mes de Conexión

### 7.1. Objetivo
Mostrar 2 tablas en dashboard de supervisores/admin:
1. **Comisiones de agentes CON mes de conexión** (candidatos convertidos en agentes)
2. **Comisiones de agentes SIN mes de conexión** (agentes sin registro en candidatos)

**Columnas**: Mes, Agente, Comisión (+ Mes Conexión y EFC en tabla 1)

### 7.2. Vistas auxiliares

```sql
-- Vista: Agentes con mes de conexión
CREATE OR REPLACE VIEW vw_agentes_con_mes_conexion AS
SELECT 
  u.id as usuario_id,
  u.id_auth,
  u.email,
  u.nombre as agente_nombre,
  c.mes_conexion,
  c.candidato,
  c.efc
FROM usuarios u
INNER JOIN candidatos c ON LOWER(c.email_agente) = LOWER(u.email)
WHERE u.rol = 'agente' 
  AND u.activo = true
  AND c.eliminado = false
  AND c.mes_conexion IS NOT NULL;

-- Vista: Agentes sin mes de conexión
CREATE OR REPLACE VIEW vw_agentes_sin_mes_conexion AS
SELECT 
  u.id as usuario_id,
  u.id_auth,
  u.email,
  u.nombre as agente_nombre
FROM usuarios u
WHERE u.rol = 'agente' 
  AND u.activo = true
  AND NOT EXISTS (
    SELECT 1 
    FROM candidatos c 
    WHERE LOWER(c.email_agente) = LOWER(u.email)
      AND c.eliminado = false
      AND c.mes_conexion IS NOT NULL
  );

-- Vista: Comisiones por agente y mes
CREATE OR REPLACE VIEW vw_comisiones_agente_mes AS
SELECT 
  cl.asesor_id,
  u.nombre as agente_nombre,
  u.email as agente_email,
  DATE_TRUNC('month', p.fecha_emision) as mes_emision,
  TO_CHAR(p.fecha_emision, 'YYYY-MM') as periodo,
  COUNT(DISTINCT p.id) as total_polizas,
  SUM(p.prima_mxn) as prima_total,
  -- Usar base_factor del cache (porcentaje real de comisión por póliza)
  SUM(p.prima_mxn * COALESCE(ppc.base_factor, 0) / 100) as comision_estimada,
  SUM(
    CASE 
      WHEN p.estatus = 'EN_VIGOR' 
      THEN p.prima_mxn * COALESCE(ppc.base_factor, 0) / 100 
      ELSE 0 
    END
  ) as comision_vigente
FROM polizas p
INNER JOIN clientes cl ON p.cliente_id = cl.id
INNER JOIN usuarios u ON cl.asesor_id = u.id_auth
LEFT JOIN poliza_puntos_cache ppc ON p.id = ppc.poliza_id  -- ⚠️ JOIN con cache para obtener base_factor
WHERE p.anulada_at IS NULL
  AND u.rol = 'agente'
  AND u.activo = true
GROUP BY cl.asesor_id, u.nombre, u.email, DATE_TRUNC('month', p.fecha_emision);
```

### 7.3. Vistas principales para dashboard

```sql
-- Dashboard: Comisiones CON mes de conexión
CREATE OR REPLACE VIEW vw_dashboard_comisiones_con_conexion AS
SELECT 
  acm.periodo,
  acm.mes_emision,
  agc.agente_nombre,
  agc.mes_conexion,
  agc.efc,
  acm.total_polizas,
  acm.prima_total,
  acm.comision_estimada,
  acm.comision_vigente,
  agc.usuario_id,
  agc.email
FROM vw_comisiones_agente_mes acm
INNER JOIN vw_agentes_con_mes_conexion agc 
  ON acm.asesor_id = agc.id_auth
ORDER BY acm.periodo DESC, agc.agente_nombre;

-- Dashboard: Comisiones SIN mes de conexión
CREATE OR REPLACE VIEW vw_dashboard_comisiones_sin_conexion AS
SELECT 
  acm.periodo,
  acm.mes_emision,
  asc.agente_nombre,
  acm.total_polizas,
  acm.prima_total,
  acm.comision_estimada,
  acm.comision_vigente,
  asc.usuario_id,
  asc.email
FROM vw_comisiones_agente_mes acm
INNER JOIN vw_agentes_sin_mes_conexion asc 
  ON acm.asesor_id = asc.id_auth
ORDER BY acm.periodo DESC, asc.agente_nombre;
```

### 7.4. API Endpoints para dashboard

| Método | Ruta | Detalle |
| --- | --- | --- |
| GET | `/api/comisiones/con-conexion?periodo=&efc=&agente=` | Lista comisiones de agentes con mes de conexión. Filtros: periodo (YYYY-MM), efc, agente (búsqueda parcial). |
| GET | `/api/comisiones/sin-conexion?periodo=&agente=` | Lista comisiones de agentes sin mes de conexión. Filtros: periodo, agente. |
| GET | `/api/comisiones/resumen?usuario_id=` | Resumen de comisiones de un agente específico (para perfil individual). |

### 7.5. UI Components

**Página principal**: `/dashboard/comisiones`

```typescript
// Estructura del componente
- Filtros compartidos (periodo, búsqueda agente)
- Tabs o secciones separadas:
  1. "Agentes con mes de conexión" 
     - DataTable con columnas: Periodo, Agente, Mes Conexión, EFC, Pólizas, Comisión
     - Filtro adicional por EFC
  2. "Agentes sin mes de conexión"
     - DataTable con columnas: Periodo, Agente, Pólizas, Comisión
- Exportar a Excel/CSV
- Gráficas: Top 10 agentes del mes, evolución trimestral
```

**Badges en vista supervisores**:
- En acordeón de cada agente: "Comisión mes actual: $X (Y pólizas)"
- Tooltip con desglose: pólizas vigentes vs. anuladas

## 8. Automatización de pagos vencidos

⚠️ **IMPORTANTE**: pg_cron NO está disponible en Supabase Plan Free. Usar Edge Function + GitHub Actions.

### ✅ Opción recomendada: Edge Function + GitHub Actions

#### Paso 1: Crear Edge Function

#### Paso 2: Función SQL auxiliar (opcional, para llamar desde Edge Function)

```sql
CREATE OR REPLACE FUNCTION fn_actualizar_pagos_vencidos()
RETURNS TABLE(updated_count bigint) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row_count bigint;
BEGIN
  UPDATE poliza_pagos_mensuales
  SET estado = 'vencido', updated_at = NOW()
  WHERE estado = 'pendiente' 
    AND fecha_limite < CURRENT_DATE;
  
  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN QUERY SELECT row_count;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_actualizar_pagos_vencidos() TO service_role;
```

#### Paso 3: Edge Function

```typescript
// supabase/functions/actualizar-pagos-vencidos/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Validar secret para seguridad
  const authHeader = req.headers.get('authorization')
  const secret = Deno.env.get('CRON_SECRET')
  
  if (!authHeader || authHeader !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Opción 1: Llamar función SQL
    const { data, error } = await supabase.rpc('fn_actualizar_pagos_vencidos')
    
    if (error) throw error
    
    const updatedCount = data?.[0]?.updated_count || 0

    return new Response(JSON.stringify({ 
      success: true, 
      updated: updatedCount,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error actualizando pagos:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

```yaml
# .github/workflows/actualizar-pagos.yml
name: Actualizar pagos vencidos
on:
  schedule:
    - cron: '0 8 * * *'  # Diario a las 8 AM UTC (2 AM CST)
  workflow_dispatch:  # Permitir ejecución manual

jobs:
  actualizar-pagos:
    runs-on: ubuntu-latest
    steps:
      - name: Llamar Edge Function
        run: |
          response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            ${{ secrets.SUPABASE_URL }}/functions/v1/actualizar-pagos-vencidos)
          
          http_code=$(echo "$response" | tail -n1)
          body=$(echo "$response" | head -n-1)
          
          echo "HTTP Status: $http_code"
          echo "Response: $body"
          
          if [ "$http_code" != "200" ]; then
            echo "Error: Failed to update payments"
            exit 1
          fi
```

#### Paso 4: Configurar secrets en GitHub

1. Ve a Settings > Secrets and variables > Actions
2. Agrega:
   - `SUPABASE_URL`: https://wqutrjnxvcgmyyiyjmsd.supabase.co
   - `CRON_SECRET`: Generar token seguro (ej: `openssl rand -base64 32`)
3. Agregar `CRON_SECRET` también a `.env.local` y variables de entorno de Supabase

### Alternativa: Llamar desde API interna

Si prefieres no usar GitHub Actions, puedes crear endpoint en Next.js:

```typescript
// src/app/api/cron/actualizar-pagos/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  // Validar cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.REPORTES_CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const { data, error } = await supabase.rpc('fn_actualizar_pagos_vencidos')
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ 
    success: true, 
    updated: data?.[0]?.updated_count || 0 
  })
}
```

Luego usar servicio externo como [cron-job.org](https://cron-job.org) o [EasyCron](https://www.easycron.com/) (free tier) para llamar al endpoint.

## 9. QA y checklist
1. **Migraciones**: correr en dev + seed casos con distintas periodicidades.
2. **API tests**: unitarios para generación de periodos, registro de pagos, alertas.
3. **UI tests**: flujo marcar pago, validación de default, indicadores de estado.
4. **Cron**: simular fecha futura para validar cambio `pendiente -> vencido`.
5. **Supervisores**: snapshot del badge con datos mock.
6. **Accesibilidad**: etiquetas de color acompañadas de texto.
7. **Docs**: actualizar README de scripts y cron jobs.
8. **Dashboard comisiones**:
   - Validar vistas con datos reales en Dev
   - Testing de filtros (periodo, agente, EFC)
   - Exportación a Excel/CSV funcional
   - RLS policies: supervisores ven todo, agentes solo sus datos
   - Verificar porcentaje de comisión según reglas de negocio
   - Gráficas y KPIs de comisiones del mes
9. **Performance**: índices en `candidatos.mes_conexion`, `usuarios.id_auth`, `clientes.asesor_id`
10. **Automatización**: elegir e implementar una de las 3 opciones para pagos vencidos
