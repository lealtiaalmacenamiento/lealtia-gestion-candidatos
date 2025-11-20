# Estrategias de Invalidación de Cache para Campaign Progress

## Resumen

Implementamos tres estrategias para mantener actualizado el cache de `campaign_progress`:

| Estrategia | Cuándo usar | Ventajas | Desventajas |
|------------|-------------|----------|-------------|
| **Database Triggers** | Recomendado | Tiempo real, preciso | Más carga en DB |
| **Supabase Cron** | Desarrollo | Simple, confiable | Requiere plan Pro |
| **Vercel Cron** | Producción | Sin costo extra | Menos preciso |

---

## Opción 1: Database Triggers (⭐ Recomendado)

### Archivo
`supabase/migrations/20251120_invalidate_campaign_cache_triggers.sql`

### Funcionamiento
- Invalida cache **inmediatamente** cuando cambian datos relevantes
- Triggers en tablas: `candidatos`, `polizas`, `clientes`

### Eventos que invalidan cache
1. **Candidatos**: Cambio en `mes_conexion` o datos del candidato
2. **Pólizas**: INSERT, UPDATE, DELETE
3. **Clientes**: INSERT, UPDATE, DELETE  
4. **Prospectos**: INSERT, UPDATE, DELETE (afecta RC metrics)
5. **Planificaciones**: INSERT, UPDATE, DELETE
6. **Campaigns Custom Metrics**: INSERT, UPDATE, DELETE
7. **User Segments**: INSERT, UPDATE, DELETE (afecta elegibilidad por segmentos)

### Ventajas
- ✅ **Casi tiempo real**: Usuario ve cambios en ~1 minuto
- ✅ **Preciso**: Solo invalida usuarios afectados
- ✅ **Automático**: Sin configuración adicional
- ✅ **Completo**: Cubre todas las fuentes de datos

### Desventajas
- ⚠️ **Vistas materializadas**: Las vistas `vw_polizas_metricas`, `vw_cancelaciones_indices` y `vw_rc_metricas` se refrescan cada 5-10 minutos, así que aunque el trigger invalide el cache inmediatamente, los datos en la evaluación pueden tardar hasta 10 min en reflejarse
- ⚠️ Más carga en escrituras (mínima pero medible)
- ⚠️ Puede causar muchas re-evaluaciones si hay cambios frecuentes

### Instalación
```bash
# Aplicar migración
node scripts/run_sql.js supabase/migrations/20251120_invalidate_campaign_cache_triggers.sql
```

### Testing
```sql
-- Probar trigger de candidatos
UPDATE candidatos 
SET mes_conexion = '2025-12' 
WHERE email_agente = 'test@example.com';

-- Verificar que se eliminó el cache
SELECT * FROM campaign_progress 
WHERE usuario_id = (SELECT id FROM usuarios WHERE email = 'test@example.com');
-- Debería retornar 0 filas
```

---

## Opción 2: Supabase Cron Job

### Archivo
`supabase/migrations/20251120_campaign_cache_cron_job.sql`

### Funcionamiento
- Elimina registros **más antiguos que 5 minutos** cada 10 minutos
- Usa extensión `pg_cron` de PostgreSQL

### Requisitos
- Plan Supabase Pro o superior
- Extensión `pg_cron` habilitada

### Ventajas
- ✅ Simple de configurar
- ✅ Bajo overhead (solo cada 10 min)
- ✅ No depende de Vercel

### Desventajas
- ⚠️ Requiere plan Pro ($25/mes)
- ⚠️ No es inmediato (hasta 10 min de delay)

### Instalación
```sql
-- 1. Habilitar pg_cron (requiere superuser)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Aplicar migración
\i supabase/migrations/20251120_campaign_cache_cron_job.sql

-- 3. Programar job
SELECT cron.schedule(
  'clean-campaign-cache',
  '*/10 * * * *',
  $$SELECT clean_stale_campaign_cache();$$
);

-- 4. Verificar jobs
SELECT * FROM cron.job;
```

### Monitoreo
```sql
-- Ver historial de ejecuciones
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'clean-campaign-cache')
ORDER BY start_time DESC 
LIMIT 10;
```

---

## Opción 3: Vercel Cron Job (✅ Implementado)

### Archivos
- `src/app/api/cron/clean-campaign-cache/route.ts`
- `vercel.json` (actualizado)

### Funcionamiento
- Vercel ejecuta endpoint cada 10 minutos
- Elimina registros más antiguos que 5 minutos

### Configuración

#### 1. Variable de entorno (opcional pero recomendado)
```bash
# .env.local
CRON_SECRET=tu-token-secreto-aqui
```

#### 2. Vercel.json
```json
{
  "crons": [
    { 
      "path": "/api/cron/clean-campaign-cache", 
      "schedule": "*/10 * * * *"  // Cada 10 minutos
    }
  ]
}
```

### Ventajas
- ✅ **Gratis**: Incluido en plan Vercel Pro
- ✅ **Simple**: Solo un endpoint API
- ✅ **Flexible**: Puedes llamarlo manualmente

### Desventajas
- ⚠️ No es tiempo real (hasta 10 min)
- ⚠️ Solo en producción (no funciona en `localhost`)

### Testing Local
```bash
# Llamada manual
curl http://localhost:3000/api/cron/clean-campaign-cache?token=CRON_SECRET

# Con parámetro personalizado
curl http://localhost:3000/api/cron/clean-campaign-cache?maxAge=3
```

### Monitoreo en Vercel
1. Dashboard → Proyecto → Settings → Cron Jobs
2. Ver ejecuciones y logs

---

## Limitación Importante: Vistas Materializadas

Las métricas de campañas usan **vistas materializadas**:
- `vw_polizas_metricas` → se refresca cada 5-10 min
- `vw_cancelaciones_indices` → se refresca cada 5-10 min  
- `vw_rc_metricas` → se refresca cada 5-10 min

**Esto significa:**
1. Trigger invalida cache **inmediatamente** ✅
2. Usuario hace nueva request → re-evalúa campaña
3. Pero los datos en las vistas pueden ser **obsoletos** (hasta 10 min) ⚠️

**Ejemplo real:**
```
T=0:00  → Usuario crea póliza nueva
T=0:01  → Trigger invalida cache ✅
T=0:02  → Usuario refresca página
         → Sistema re-evalúa campaña
         → vw_polizas_metricas aún tiene datos viejos ❌
         → Usuario aún no es elegible
T=5:00  → Vista materializada se refresca
T=5:01  → Usuario refresca página
         → Ahora sí ve la póliza nueva ✅
```

### Solución a las Vistas Materializadas

**Opción A**: Reducir frecuencia de refresh de vistas (requiere cambio en migrations)
```sql
-- Refrescar cada 1 minuto en lugar de 5-10
-- Requiere más recursos de DB
```

**Opción B**: Usar queries directas en lugar de vistas materializadas
- Más lento pero siempre actualizado
- Requiere refactor significativo

**Opción C**: Aceptar delay de 5-10 min (Recomendado)
- Balance entre performance y precisión
- Combinar con TTL de 5 minutos

## Recomendación Final

### Para Producción (Configuración Híbrida)
**Database Triggers** para invalidación inmediata:
- Usuario actualiza `mes_conexion` → cache invalidado en <1s
- Se crean/modifican pólizas/clientes/prospectos → cache invalidado en <1s
- Cambios en segmentos → cache invalidado en <1s

**TTL de 5 minutos** para sincronizar con vistas materializadas:
- Aunque el trigger invalide el cache, los datos de vistas pueden tardar
- El TTL asegura que después de 5 min siempre se re-evalúa

**Vercel Cron** como red de seguridad:
- Elimina registros huérfanos o antiguos
- Corre cada 10 minutos como limpieza final

### Configuración Híbrida (Mejor)
```sql
-- 1. Aplicar triggers
\i supabase/migrations/20251120_invalidate_campaign_cache_triggers.sql

-- 2. Vercel Cron ya está configurado en vercel.json
-- Se desplegará automáticamente
```

### Para Desarrollo
- Usar solo Vercel Cron (más simple)
- Llamar manualmente `/api/cron/clean-campaign-cache` cuando sea necesario

---

## Alternativa: TTL más corto

Si no quieres usar crons/triggers, puedes reducir el TTL:

```typescript
// src/app/api/campaigns/helpers.ts
export const DEFAULT_CACHE_TTL = 60  // Cambiar de 300 a 60 segundos
```

**Pros**: Simple, sin configuración adicional
**Cons**: Más carga en DB (re-evalúa cada minuto)
