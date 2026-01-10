# Análisis Fase 6: Comparación con estructura actual

**Fecha**: 2025-12-27
**Estado**: Pendiente de implementación

## Resumen Ejecutivo

✅ **Compatible**: La especificación de Fase 6 es compatible con la estructura actual
⚠️ **Ajustes necesarios**: Se requieren algunas modificaciones al documento

---

## 1. Análisis de Tabla `polizas`

### Estado actual (DB Dev)
```sql
-- Campos existentes relacionados con pagos:
- periodicidad_pago (enum: 'A', 'S', 'T', 'M') -- ✅ YA EXISTE
- dia_pago (smallint, CHECK 1-31)            -- ✅ YA EXISTE  
- tipo_pago (text)                           -- ✅ YA EXISTE
- meses_check (jsonb, default '{}')          -- ✅ YA EXISTE
- fecha_renovacion (date)                    -- ✅ YA EXISTE
- forma_pago (enum: MODO_DIRECTO, CARGO_AUTOMATICO)
- prima_input (numeric 14,2)                 -- Se usa en vez de prima_anual
- prima_mxn (numeric 14,2)                   -- Calculado automáticamente
- fecha_emision (date NOT NULL)
```

### Especificación Fase 6
```markdown
2. **Campos nuevos en `polizas`**
   - `fecha_limite_pago` (date) visible en editor.
   - `periodicidad_pago` enum (mensual, trimestral, semestral, anual, personalizada).
   - `dia_pago_recurrente` (smallint) para alinear checkboxes.
```

### ✅ CAMBIOS NECESARIOS EN ESPECIFICACIÓN:

1. **`periodicidad_pago`**: ✅ YA EXISTE pero con valores diferentes
   - **Actual**: `'A', 'S', 'T', 'M'` (Anual, Semestral, Trimestral, Mensual)
   - **Spec dice**: "mensual, trimestral, semestral, anual, personalizada"
   - **ACCIÓN**: Actualizar doc para usar valores actuales: `'M', 'T', 'S', 'A'`
   - **PENDIENTE**: ¿Agregar valor `'P'` para "personalizada"?

2. **`dia_pago_recurrente`**: ✅ YA EXISTE como `dia_pago`
   - **ACCIÓN**: Actualizar doc para usar nombre correcto: `dia_pago`

3. **`fecha_limite_pago`**: ❌ NO EXISTE
   - **ACCIÓN**: AGREGAR este campo en migration

4. **Prima anual**: ⚠️ Diferencia semántica
   - **Actual**: `prima_input` (lo que ingresa usuario) + `prima_mxn` (calculado)
   - **Cache**: `poliza_puntos_cache.prima_anual_snapshot` (para cálculo de puntos)
   - **Spec dice**: "prima_anual" directamente
   - **ACCIÓN**: Usar `prima_mxn` o `prima_anual_snapshot` según contexto

---

## 2. Tabla `poliza_pagos_mensuales` (NUEVA)

### ✅ Especificación correcta
La tabla propuesta NO existe actualmente. Se requiere:

```sql
CREATE TABLE poliza_pagos_mensuales (
  id bigserial PRIMARY KEY,
  poliza_id uuid NOT NULL REFERENCES polizas(id) ON DELETE CASCADE,
  periodo_mes date NOT NULL,  -- primer día del mes
  fecha_programada date NOT NULL,
  fecha_limite date NOT NULL,
  monto_programado numeric(14,2) NOT NULL,
  monto_pagado numeric(14,2),
  fecha_pago_real timestamptz,
  estado poliza_pago_estado NOT NULL DEFAULT 'pendiente',
  notas text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(poliza_id, periodo_mes)
);

CREATE TYPE poliza_pago_estado AS ENUM ('pendiente', 'pagado', 'vencido', 'omitido');

CREATE INDEX idx_poliza_pagos_estado ON poliza_pagos_mensuales(estado);
CREATE INDEX idx_poliza_pagos_fecha_limite ON poliza_pagos_mensuales(fecha_limite);
CREATE INDEX idx_poliza_pagos_poliza_id ON poliza_pagos_mensuales(poliza_id);
```

---

## 3. Vistas de Dashboard de Comisiones

### Estado actual
- ❌ NO existen las vistas propuestas
- ✅ Relaciones necesarias SÍ existen:
  - `candidatos.mes_conexion` (text, nullable) -- ✅ EXISTE
  - `candidatos.email_agente` (text, con índice) -- ✅ EXISTE
  - `usuarios.id_auth` (uuid FK auth.users) -- ✅ EXISTE
  - `clientes.asesor_id` (uuid FK auth.users) -- ✅ EXISTE
  - `polizas.prima_mxn` + `poliza_puntos_cache.prima_anual_snapshot` -- ✅ EXISTE

### ⚠️ PROBLEMA DETECTADO: Porcentaje de comisión

**Actual en DB:**
- `poliza_puntos_cache.base_factor` - porcentaje para cálculo de puntos
- `planificaciones.porcentaje_comision` - estimación del agente por semana

**Especificación dice:**
```sql
SUM(p.prima_mxn * 0.10) as comision_estimada  -- 10% hardcoded
```

**Problema**: El 10% está hardcodeado, pero según el código actual:
```typescript
// src/app/api/agentes/route.ts línea 52
const pct = r?.poliza_puntos_cache?.base_factor
if (r?.estatus === 'EN_VIGOR' && typeof pct === 'number' && typeof prima === 'number') {
  comisiones_mxn_total += Number(((prima * pct) / 100).toFixed(2))
}
```

✅ **SOLUCIÓN**: La vista debe usar `base_factor` de `poliza_puntos_cache`:

```sql
-- Corrección sugerida para vw_comisiones_agente_mes:
CREATE OR REPLACE VIEW vw_comisiones_agente_mes AS
SELECT 
  cl.asesor_id,
  u.nombre as agente_nombre,
  u.email as agente_email,
  DATE_TRUNC('month', p.fecha_emision) as mes_emision,
  TO_CHAR(p.fecha_emision, 'YYYY-MM') as periodo,
  COUNT(DISTINCT p.id) as total_polizas,
  SUM(p.prima_mxn) as prima_total,
  -- Usar base_factor del cache (porcentaje real de comisión)
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
LEFT JOIN poliza_puntos_cache ppc ON p.id = ppc.poliza_id  -- ⚠️ AÑADIR JOIN
WHERE p.anulada_at IS NULL
  AND u.rol = 'agente'
  AND u.activo = true
GROUP BY cl.asesor_id, u.nombre, u.email, DATE_TRUNC('month', p.fecha_emision);
```

---

## 4. Enum `periodicidad_pago` - Mapeo

### Valores actuales en DB
```
'M' = Mensual
'T' = Trimestral  
'S' = Semestral
'A' = Anual
```

### Cálculo de monto programado por periodo

```typescript
// Función auxiliar sugerida para backend
function calcularMontoProgramado(
  primaMxn: number, 
  periodicidad: 'M' | 'T' | 'S' | 'A'
): number {
  const divisores = {
    'M': 12,  // Mensual: prima / 12
    'T': 4,   // Trimestral: prima / 4
    'S': 2,   // Semestral: prima / 2
    'A': 1    // Anual: prima completa
  }
  return primaMxn / divisores[periodicidad]
}
```

---

## 5. Triggers y Funciones

### Especificación propone:
```sql
fn_generar_pagos_programados(poliza_id uuid)
trg_poliza_after_upsert
```

### ⚠️ CONFLICTO CON TRIGGERS EXISTENTES

**Triggers actuales en `polizas`:**
```sql
trg_polizas_after_insert_recalc
trg_polizas_after_update_recalc (ON UPDATE OF prima_input, prima_moneda, ...)
trg_polizas_normalize_amounts (BEFORE INSERT/UPDATE)
trg_polizas_set_updated_at
trg_invalidate_cache_polizas
```

✅ **RECOMENDACIÓN**: 
- Crear nuevo trigger `trg_polizas_generar_pagos` que se ejecute **AFTER** los triggers existentes
- Debe activarse en `INSERT` y `UPDATE OF periodicidad_pago, fecha_limite_pago, prima_mxn, fecha_emision`

```sql
CREATE OR REPLACE FUNCTION fn_generar_pagos_programados()
RETURNS TRIGGER AS $$
BEGIN
  -- Eliminar pagos NO pagados de esta póliza (regenerar)
  DELETE FROM poliza_pagos_mensuales 
  WHERE poliza_id = NEW.id 
    AND estado = 'pendiente';
  
  -- Generar periodos según periodicidad
  -- (implementación detallada pendiente)
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_polizas_generar_pagos
  AFTER INSERT OR UPDATE OF periodicidad_pago, fecha_limite_pago, prima_mxn, fecha_emision
  ON polizas
  FOR EACH ROW
  EXECUTE FUNCTION fn_generar_pagos_programados();
```

---

## 6. Vista `vw_agente_comision_mes_actual`

### Especificación dice:
```
vw_agente_comision_mes_actual con columnas: 
  agente_id, importe_programado, importe_pagado, importe_pendiente
```

### ⚠️ PROBLEMA: Ambigüedad en "agente_id"

**Opciones**:
1. `usuarios.id` (bigint) - ID interno de usuarios
2. `usuarios.id_auth` (uuid) - ID de auth.users (FK a clientes.asesor_id)

✅ **DECISIÓN**: Usar `id_auth` para consistencia con `clientes.asesor_id`

```sql
CREATE OR REPLACE VIEW vw_agente_comision_mes_actual AS
SELECT 
  u.id_auth as agente_id,
  u.id as usuario_id,
  u.nombre as agente_nombre,
  u.email as agente_email,
  COALESCE(SUM(ppm.monto_programado), 0) as importe_programado,
  COALESCE(SUM(ppm.monto_pagado), 0) as importe_pagado,
  COALESCE(
    SUM(CASE WHEN ppm.estado = 'pendiente' THEN ppm.monto_programado ELSE 0 END), 
    0
  ) as importe_pendiente,
  COUNT(DISTINCT p.id) FILTER (WHERE p.estatus = 'EN_VIGOR') as polizas_vigentes
FROM usuarios u
LEFT JOIN clientes cl ON cl.asesor_id = u.id_auth
LEFT JOIN polizas p ON p.cliente_id = cl.id AND p.anulada_at IS NULL
LEFT JOIN poliza_pagos_mensuales ppm ON ppm.poliza_id = p.id 
  AND DATE_TRUNC('month', ppm.periodo_mes) = DATE_TRUNC('month', CURRENT_DATE)
WHERE u.rol = 'agente' 
  AND u.activo = true
GROUP BY u.id_auth, u.id, u.nombre, u.email;
```

---

## 7. Automatización (pg_cron)

### ✅ Verificación de disponibilidad

**Supabase** soporta `pg_cron` pero requiere:
1. Extensión habilitada por superuser (soporte de Supabase)
2. O usar **Database Webhooks** (alternativa nativa de Supabase)

### Opción recomendada: Supabase Database Webhooks

En lugar de pg_cron, usar **Database Webhooks** + **Edge Function**:

```sql
-- Crear hook que llame a Edge Function diariamente
CREATE EXTENSION IF NOT EXISTS pg_net;

-- O mejor: usar Supabase UI para configurar webhook
-- Dashboard > Database > Webhooks
-- Evento: cron diario 2:00 AM
-- URL: https://wqutrjnxvcgmyyiyjmsd.functions.supabase.co/actualizar-pagos-vencidos
```

---

## 8. Campos faltantes vs existentes

### Resumen de campos en `polizas`

| Campo especificado | Estado | Campo real | Acción |
|---|---|---|---|
| `fecha_limite_pago` | ❌ Falta | - | ✅ Agregar |
| `periodicidad_pago` | ✅ Existe | `periodicidad_pago` | ✅ OK (ajustar valores) |
| `dia_pago_recurrente` | ✅ Existe | `dia_pago` | ✅ OK (renombrar en doc) |
| `prima_anual` | ⚠️ Diferente | `prima_input`, `prima_mxn` | ✅ Usar `prima_mxn` |
| - | ✅ Existe (extra) | `tipo_pago` | - |
| - | ✅ Existe (extra) | `meses_check` | ¿Uso en fase 6? |

### Campo `meses_check` (jsonb)
Existe actualmente pero no está documentado en Fase 6. 
**¿Uso previsto?** Posiblemente para tracking de meses pagados. Consultar con usuario.

---

## 9. API Endpoints - Validación

### Endpoints especificados ✅ OK:
- `GET /api/polizas/{id}/pagos`
- `POST /api/polizas/{id}/pagos/{periodo}`
- `POST /api/polizas/{id}/pagos/generar`
- `GET /api/pagos/alertas`
- `GET /api/agentes/{id}/comision-mes`
- `GET /api/comisiones/con-conexion`
- `GET /api/comisiones/sin-conexion`
- `GET /api/comisiones/resumen`

### ⚠️ CONFLICTO POTENCIAL:
Ruta `/api/agentes/{id}/comision-mes` vs `/api/comisiones/resumen?usuario_id=`

**RECOMENDACIÓN**: Unificar en:
- `GET /api/comisiones/resumen?agente_id={uuid}` (usa id_auth)
- `GET /api/comisiones/resumen?usuario_id={bigint}` (usa usuarios.id)

O simplificar a:
- `GET /api/agentes/{id_auth}/comisiones` (RESTful)

---

## 10. RLS Policies faltantes

### ⚠️ Pendiente definir policies para:

```sql
-- poliza_pagos_mensuales
ALTER TABLE poliza_pagos_mensuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY sel_poliza_pagos_mensuales
  ON poliza_pagos_mensuales FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM polizas p
      INNER JOIN clientes c ON p.cliente_id = c.id
      WHERE p.id = poliza_pagos_mensuales.poliza_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );

CREATE POLICY upd_poliza_pagos_mensuales
  ON poliza_pagos_mensuales FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM polizas p
      INNER JOIN clientes c ON p.cliente_id = c.id
      WHERE p.id = poliza_pagos_mensuales.poliza_id
        AND (c.asesor_id = auth.uid() OR is_super_role())
    )
  );

-- Vistas: por defecto heredan policies de tablas base
-- pero verificar si necesitan grants explícitos
GRANT SELECT ON vw_agentes_con_mes_conexion TO authenticated;
GRANT SELECT ON vw_agentes_sin_mes_conexion TO authenticated;
GRANT SELECT ON vw_comisiones_agente_mes TO authenticated;
GRANT SELECT ON vw_dashboard_comisiones_con_conexion TO authenticated;
GRANT SELECT ON vw_dashboard_comisiones_sin_conexion TO authenticated;
GRANT SELECT ON vw_agente_comision_mes_actual TO authenticated;
```

---

## 11. Índices adicionales recomendados

```sql
-- Para búsquedas frecuentes en dashboard de comisiones
CREATE INDEX IF NOT EXISTS idx_candidatos_mes_conexion 
  ON candidatos(mes_conexion) WHERE mes_conexion IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poliza_puntos_cache_poliza_base 
  ON poliza_puntos_cache(poliza_id, base_factor);

-- Para joins en vistas de comisiones
CREATE INDEX IF NOT EXISTS idx_clientes_asesor_activo 
  ON clientes(asesor_id, activo) WHERE asesor_id IS NOT NULL;
```

---

## 12. Checklist de Implementación

### Fase 1: Migraciones DB
- [ ] Crear enum `poliza_pago_estado`
- [ ] Agregar campo `fecha_limite_pago` a `polizas`
- [ ] Crear tabla `poliza_pagos_mensuales`
- [ ] Crear índices en `poliza_pagos_mensuales`
- [ ] Crear función `fn_generar_pagos_programados()`
- [ ] Crear trigger `trg_polizas_generar_pagos`
- [ ] Crear vistas auxiliares (agentes con/sin mes conexión)
- [ ] Crear vista `vw_comisiones_agente_mes` (CORREGIDA con base_factor)
- [ ] Crear vistas dashboard (con/sin conexión)
- [ ] Crear vista `vw_agente_comision_mes_actual`
- [ ] Agregar RLS policies
- [ ] Agregar índices recomendados
- [ ] Crear función `fn_actualizar_pagos_vencidos()`

### Fase 2: Backend API
- [ ] `GET /api/polizas/:id/pagos`
- [ ] `POST /api/polizas/:id/pagos/:periodo`
- [ ] `POST /api/polizas/:id/pagos/generar`
- [ ] `GET /api/pagos/alertas`
- [ ] `GET /api/comisiones/con-conexion`
- [ ] `GET /api/comisiones/sin-conexion`
- [ ] `GET /api/agentes/:id/comisiones` (unificado)

### Fase 3: Frontend
- [ ] Formulario pólizas: agregar campos periodicidad/fecha límite/día pago
- [ ] Componente: Tabla de pagos programados
- [ ] Modal: Marcar pago
- [ ] Badges de estado (vencido/próximo/pagado)
- [ ] Widget dashboard asesor: Pagos pendientes
- [ ] Vista supervisores: Badge comisión mes actual
- [ ] Página `/dashboard/comisiones` (2 tablas)
- [ ] Filtros: periodo, agente, EFC
- [ ] Exportación Excel/CSV

### Fase 4: Automatización
- [ ] Decidir: pg_cron vs Edge Function vs GitHub Actions
- [ ] Implementar job de pagos vencidos
- [ ] Testing en entorno dev (simular fechas)
- [ ] Configurar notificaciones (email/in-app)

### Fase 5: Testing & Docs
- [ ] Tests unitarios: Generación de periodos
- [ ] Tests unitarios: Registro de pagos
- [ ] Tests E2E: Flujo completo asesor
- [ ] Tests E2E: Vista supervisores
- [ ] Validar cálculos de comisiones con datos reales
- [ ] Actualizar README.md
- [ ] Documentar cron jobs y Edge Functions

---

## 13. Decisiones Pendientes

1. **¿Agregar valor 'P' (personalizada) al enum `periodicidad_pago`?**
   - Actual: Solo tiene M, T, S, A
   - Spec menciona "personalizada"
   
2. **¿Qué hacer con el campo `meses_check` (jsonb)?**
   - Existe pero no está documentado en Fase 6
   - ¿Se usa para algo relacionado con pagos?

3. **¿Porcentaje de comisión es fijo o variable por póliza?**
   - Actualmente usa `base_factor` de puntos cache
   - ¿Cambiar a tabla independiente de comisiones?

4. **¿Notificaciones vía email o in-app o ambas?**
   - Especificar servicio de email (ya existe integración Gmail en .env)

5. **¿Automatización con qué opción?**
   - pg_cron (requiere soporte Supabase)
   - Edge Function + GitHub Actions (más control)
   - Database Webhooks (nativo Supabase)

---

## 14. Cambios sugeridos al documento `fase6-pagos-comisiones.md`

### Sección 2 - Modelo de datos

**ANTES:**
```markdown
2. **Campos nuevos en `polizas`**
   - `fecha_limite_pago` (date) visible en editor.
   - `periodicidad_pago` enum (mensual, trimestral, semestral, anual, personalizada).
   - `dia_pago_recurrente` (smallint) para alinear checkboxes.
```

**DESPUÉS:**
```markdown
2. **Campos nuevos en `polizas`**
   - `fecha_limite_pago` (date) visible en editor. ⚠️ AGREGAR ESTE CAMPO
   - `periodicidad_pago` (enum existente: 'M', 'T', 'S', 'A') ✅ YA EXISTE
   - `dia_pago` (smallint, CHECK 1-31) ✅ YA EXISTE

**NOTA**: 
- `periodicidad_pago` usa códigos: M=Mensual, T=Trimestral, S=Semestral, A=Anual
- `prima_anual` se refiere a `prima_mxn` (calculado) o `poliza_puntos_cache.prima_anual_snapshot`
```

### Sección 7.2 - Vistas auxiliares

**CAMBIO EN `vw_comisiones_agente_mes`:**

```sql
-- Usar base_factor del cache en vez de porcentaje hardcodeado
CREATE OR REPLACE VIEW vw_comisiones_agente_mes AS
SELECT 
  cl.asesor_id,
  u.nombre as agente_nombre,
  u.email as agente_email,
  DATE_TRUNC('month', p.fecha_emision) as mes_emision,
  TO_CHAR(p.fecha_emision, 'YYYY-MM') as periodo,
  COUNT(DISTINCT p.id) as total_polizas,
  SUM(p.prima_mxn) as prima_total,
  -- CAMBIO: Usar base_factor del cache (porcentaje real por póliza)
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
LEFT JOIN poliza_puntos_cache ppc ON p.id = ppc.poliza_id  -- ⚠️ AGREGAR ESTE JOIN
WHERE p.anulada_at IS NULL
  AND u.rol = 'agente'
  AND u.activo = true
GROUP BY cl.asesor_id, u.nombre, u.email, DATE_TRUNC('month', p.fecha_emision);
```

---

## 15. Conclusión

### ✅ Viable implementar Fase 6 con ajustes menores

**Compatibilidad**: 90%
**Ajustes requeridos**: Principalmente documentación y uso de `base_factor` para comisiones

**Próximos pasos**:
1. Resolver decisiones pendientes (sección 13)
2. Actualizar documento con correcciones (sección 14)
3. Crear migration inicial con todos los cambios
4. Implementar y testear en Dev
5. Desplegar a producción tras QA completo
