# Plan de Migración a Main - Fase 5

**Fecha de preparación:** 20 de noviembre, 2025  
**Branch origen:** `develop`  
**Branch destino:** `main`  
**Responsable:** Equipo de desarrollo

---

## 📋 Resumen Ejecutivo

Esta migración incluye la implementación completa del sistema de **Campañas Promocionales** con:
- Sistema de segmentación dinámica de usuarios
- Motor de evaluación de reglas configurables
- Gestión de tipos de productos
- Mejoras en gestión de candidatos y badges de conexión
- Sistema de invalidación automática de cache

**Impacto:** Alto - Introduce nuevas tablas, endpoints y módulos de UI  
**Riesgo:** Medio - Requiere migraciones de base de datos y configuración de cron jobs

---

## 🎯 Funcionalidades Implementadas

### 1. Sistema de Campañas Promocionales

#### Base de Datos
✅ **Nuevas Tablas:**
- `segments` - Catálogo de segmentos de usuarios
- `user_segments` - Asignación de usuarios a segmentos
- `campaigns` - Definición de campañas con vigencia y configuración
- `campaign_rules` - Reglas de elegibilidad y objetivos (JSONB)
- `campaign_rewards` - Premios y recompensas de campañas
- `campaign_segments` - Vinculación de campañas con segmentos
- `campaign_progress` - Progreso y evaluación de usuarios en tiempo real
- `product_types` - Catálogo de tipos de productos

✅ **Vistas Materializadas:**
- `vw_polizas_metricas` - Métricas agregadas de pólizas por usuario
- `vw_cancelaciones_indices` - Índices LIMRA, IGC y Momentum
- `vw_rc_metricas` - Métricas de RC (Reclutas de Calidad)

✅ **Enums:**
- `campaign_status` → `draft`, `active`, `paused`, `archived`
- `campaign_progress_status` → `not_eligible`, `eligible`, `completed`

✅ **RLS Policies:** Configuradas para todos los recursos sensibles

#### Backend (API Routes)

✅ **Motor de Evaluación de Reglas:**
- `src/lib/campaigns.ts` - Evaluador completo con 8 tipos de reglas:
  - `ROLE` - Filtrado por rol de usuario
  - `SEGMENT` - Filtrado por segmentos asignados
  - `COUNT_POLICIES` - Conteo de pólizas
  - `TOTAL_PREMIUM` - Suma de primas
  - `RC_COUNT` - Métricas de Reclutas de Calidad
  - `INDEX_THRESHOLD` - Umbrales de índices (LIMRA, IGC)
  - `TENURE_MONTHS` - Antigüedad en meses
  - `METRIC_CONDITION` - Condiciones personalizadas sobre datasets
  - `CUSTOM_SQL` - Reglas SQL personalizadas (controlado)

✅ **Endpoints Públicos:**
- `GET /api/campaigns` - Lista campañas activas para el usuario
- `GET /api/campaigns/[slug]` - Detalle y evaluación en tiempo real
- Sistema de cache con TTL configurable (300s)

✅ **Endpoints de Administración:**
- `GET/POST /api/admin/segments` - CRUD de segmentos
- `POST/DELETE /api/admin/users/:id/segments` - Asignación de segmentos
- `POST /api/admin/campaigns` - Creación de campañas
- `PATCH /api/admin/campaigns/:id` - Edición completa
- `POST /api/admin/campaigns/:id/status` - Control de estado
- `GET /api/admin/campaigns/participants` - Lista de participantes con filtros

✅ **Scripts de Seeds:**
- `scripts/seed-campaigns.ts` - Carga de campañas desde CSV
- `scripts/seed-segments.ts` - Segmentos iniciales
- `scripts/evaluate-campaign.ts` - Testing de evaluación

#### Frontend (Next.js App Router)

✅ **Módulo de Parámetros (Admin):**
- `/parametros` - Gestión de segmentos
  - Tabla con búsqueda y filtros
  - Modal de creación/edición
  - Asignación masiva de usuarios
  - Indicadores de uso

- `/parametros` - Gestión de campañas
  - Listado con filtros (estado, segmento, vigencia)
  - Wizard de creación paso a paso:
    1. Datos generales (nombre, slug, vigencia)
    2. Elegibilidad (requisitos previos)
    3. Objetivos (metas a cumplir)
    4. Premios y recompensas
    5. Notas y documentación
  - Contadores interactivos (elegibles, completados)
  - Modal de participantes con filtros
  - Edición inline y duplicación

- `/parametros` - Gestión de tipos de póliza
  - CRUD completo
  - Validación de uso antes de eliminar

✅ **Dashboard de Usuarios:**
- `/campanias` - Vista de cards con campañas activas
  - Filtrado por estado y segmento
  - Badges de estado visual
  - Barras de progreso
  - Contador de requisitos cumplidos

- `/campanias/[slug]` - Detalle de campaña
  - Tab "Resumen" con métricas clave
  - Tab "Requisitos" con checklist interactiva
  - Tab "Premios" con lista de recompensas
  - Tab "Notas" con información adicional
  - Estados: No elegible / Elegible / Meta cumplida

✅ **Componentes Reutilizables:**
- `CampaignCard` - Tarjeta visual de campaña
- `CampaignProgressBar` - Barra de progreso con estados
- `CampaignWizard` - Wizard multi-paso
- `ParticipantsModal` - Modal con lista de participantes
- `SegmentSelector` - Selector de segmentos con búsqueda
- Todos con TypeScript estricto y validación con Zod

---

### 2. Mejoras en Gestión de Candidatos

✅ **Badge de Conexión:**
- Migración de fuente de datos: `agentes_meta.fecha_conexion_text` → `candidatos.mes_conexion`
- Backend actualizado en `/api/agentes/route.ts`:
  - Vista de agente (self) - líneas 20-90
  - Vista de supervisor - líneas 100-220
- Frontend simplificado en `/gestion/page.tsx`:
  - Campo "Conexión" removido (ya no editable)
  - Badge "Conexión" mantenido como read-only
  - Botón cambiado: "Guardar conexión y objetivo" → "Guardar objetivo"

✅ **Evaluación de Campañas:**
- Fix en `src/lib/campaigns.ts` líneas 1995-2006:
  - Eliminado fallback de `mes` cuando `mes_conexion` está vacío
  - Ahora solo usa `candidatos.mes_conexion` como fuente única
  - Previene falsos positivos en elegibilidad

✅ **Corrección de Encodings UTF-8:**
- Scripts creados en `scripts/` para corregir problemas de encoding en textos de campañas:
  - `fix-encoding-final.sql` - Corrección directa con texto UTF-8 correcto
  - `fix-encoding-double-question.sql` - Corrige patrones específicos (doble encoding)
  - `fix-encoding-complete.sql` - Maneja múltiples patrones (ISO-8859-1, etc.)
  - `fix-encoding-final-all.sql` - Versión simplificada para todos los patrones
  - `force-utf8-reto5000.sql` - Forzar UTF-8 correcto via bytea
  - `fix-double-encoding.sql` - Corrige bytes UTF-8 interpretados como Latin1
  - `fix-campaign-encoding.sql` - Específico para descripciones de reglas de campaña
  - `fix-specific-rules-encoding.sql` - Fix por ID de regla específica
  - `fix-all-encoding.sql` - Limpieza masiva de caracteres mal codificados
- **Problema resuelto:** Caracteres como "í", "ó", "ñ" ahora se muestran correctamente
- **Afecta:** Tablas `campaigns`, `campaign_rules`, `campaign_rewards` con campos de texto

---

### 4. Scripts de Gestión de Campañas

✅ **Seeding y Carga de Datos:**
- `scripts/seed-campaigns.ts` - Script principal para crear campañas desde JSON/CSV
  - Soporta `--file`, `--dry-run`, `--insert-only`
  - Normaliza datos: status, fechas, segmentos, reglas, premios
  - Deduplicación automática de segmentos
  - Validación de tipos y estructuras
- `scripts/seed-segments.ts` - Crea segmentos base y asigna usuarios según roles
  - Segmentos: "Desarrolladores comerciales", etc.
- `scripts/seed-custom-metrics.ts` - Poblar métricas personalizadas en `campaigns_custom_metrics`
- `scripts/data/campaigns_2025.json` - Definiciones de campañas productivas (Reto 5000, MSI, etc.)
- `scripts/data/campaign_custom_metrics_sample.json` - Datos de ejemplo para métricas

✅ **Migración y Actualización:**
- `scripts/migrate-developers-segment.ts` - Migra usuarios `is_desarrollador` a segmento formal
  - Lee de `DevDATABASE_URL`
  - Crea/activa segmento "Desarrolladores comerciales"
  - Sincroniza asignaciones automáticamente
- `scripts/update-campaigns-decompose-datasets.sql` - Descompone datasets complejos en reglas simples
  - Reto 5000: `vida_grupo_inicial` → reglas de `polizas_prima_minima` + `polizas_recientes`
  - MSI Inicial: `msi_inicial` → reglas de `polizas_por_producto`
- `scripts/migrate-vida-grupo-to-granular-datasets.ts` - Migra datasets antiguos a estructura granular
- `scripts/update-campaign-to-producto-ids.sql` - Actualiza reglas de producto usando `product_types.id`
- `scripts/update-to-producto-ids.sql` - Versión genérica de actualización a IDs de producto

✅ **Sincronización y Fixes:**
- `scripts/sync-reto5000-with-json.sql` - Sincroniza campaña Reto 5000 con definición JSON
  - Elimina reglas actuales
  - Inserta reglas correctas: TENURE_MONTHS, METRIC_CONDITION (mes_conexion, prima_minima, polizas_recientes)
- `scripts/check-and-fix-reto5000-rules.sql` - Verifica y corrige reglas específicas de Reto 5000
- `scripts/update-reto5000-rules.sql` - Actualización específica de reglas Reto 5000
- `scripts/fix-paopecina-metrics.sql` - Fix temporal para métricas de usuario de prueba

✅ **Evaluación y Testing:**
- `scripts/evaluate-campaign.ts` - Evalúa elegibilidad de campaña para un usuario
  - CLI: `--user <id>` `--slug <slug>` `--ttl <seconds>`
  - Usa cache con TTL configurable
  - Output: eligible, progress, status, metrics, ruleResults
- `scripts/report-campaigns.ts` - Genera reporte legible de todas las campañas
  - Lee definiciones de campañas
  - Extrae y formatea reglas en lenguaje natural
  - Útil para documentación y auditoría
- `scripts/test-cron-endpoint.ps1` - PowerShell script para testing de cron endpoint
- `scripts/test_calculate_datasets.sql` - Prueba función `calculate_campaign_datasets_for_user`

✅ **Debugging y Mantenimiento:**
- `scripts/debug_campaign_evaluation.sql` - Query SQL para debug de evaluación de campañas
- `scripts/debug_participants.sql` - Consulta participantes de campañas
- `scripts/check_user.sql` - Verifica estado de usuario específico (usado en testing de triggers)
- `scripts/clear_campaign_cache.sql` - Limpia cache de `campaign_progress` para usuario
- `scripts/check_schema.sql` - Verifica estructura de tablas de campañas
- `scripts/create_campaign_datasets_function.sql` - Crea función para calcular datasets dinámicos
- `scripts/drop_calculate_function.sql` - Elimina función de cálculo (si es necesario recrear)
- `scripts/update-user-metrics.sql` - Actualiza métricas de usuario manualmente

✅ **Utilidades Generales:**
- `scripts/run_sql.js` - Ejecutor de scripts SQL con soporte para múltiples entornos
- `scripts/replace-superusuario.ps1` - Reemplaza referencias a "superusuario" por "supervisor"
- `scripts/trigger-vercel-develop.ps1` / `trigger-vercel-main.ps1` - Deploy hooks de Vercel

**Nota:** Todos los scripts de TypeScript requieren `ts-node --esm` y `tsconfig-paths` configurado.

---

### 3. Sistema de Invalidación de Cache

✅ **Database Triggers (Tiempo Real):**
- Archivo: `supabase/migrations/20251120_invalidate_campaign_cache_triggers.sql`
- 7 triggers activos que invalidan cache automáticamente:
  - `trg_invalidate_cache_candidatos` - Al cambiar `mes_conexion` u otros datos
  - `trg_invalidate_cache_polizas` - Al crear/modificar/eliminar pólizas
  - `trg_invalidate_cache_clientes` - Al crear/modificar/eliminar clientes
  - `trg_invalidate_cache_prospectos` - Al cambiar prospectos (RC metrics)
  - `trg_invalidate_cache_planificaciones` - Al cambiar planificaciones
  - `trg_invalidate_cache_custom_metrics` - Al cambiar métricas personalizadas
  - `trg_invalidate_cache_user_segments` - Al cambiar asignación de segmentos
- **Resultado:** Cache invalidado en <1 segundo tras cambios relevantes

✅ **Vercel Cron Job (Respaldo):**
- Archivo: `src/app/api/cron/clean-campaign-cache/route.ts`
- Configurado en `vercel.json`: corre cada 10 minutos
- Elimina registros de cache más antiguos que 5 minutos
- Soporta autenticación con `CRON_SECRET`
- Script de testing: `scripts/test-cron-endpoint.ps1`

✅ **Documentación:**
- `docs/CAMPAIGN_CACHE_INVALIDATION.md` - Guía completa de estrategias
- Explica limitaciones de vistas materializadas (refresh cada 5-10 min)
- Incluye ejemplos de testing y monitoreo

---

### 4. Limpieza de Código Legacy

✅ **Parámetros:**
- Removida sección "AGENDA INTERNA · DESARROLLADORES" (130+ líneas)
- Desarrolladores ahora se gestionan exclusivamente vía Segmentos
- Campo `is_desarrollador` sincronizado automáticamente

✅ **Clientes y Pólizas:**
- Removido campo editable "Conexión" 
- Removida lógica de guardado de `fecha_conexion_text`
- Simplificados estados y variables relacionadas

---

## 🗂️ Archivos Creados/Modificados

### Nuevos Archivos

#### Migraciones de Base de Datos (14 archivos)
```
supabase/migrations/20251111_phase5_campaigns_segments.sql
  └─ Core: segments, user_segments, product_types, campaigns, campaign_rules,
     campaign_rewards, campaign_segments, campaign_progress
  └─ RLS policies y comentarios
  └─ Enums: campaign_status, campaign_progress_status

supabase/migrations/20251112_phase5_metrics_indexes.sql
  └─ Índices para optimizar queries de métricas
  └─ idx_clientes_asesor, idx_usuarios_id_auth
  └─ idx_polizas_fecha_emision, idx_polizas_anulada_at

supabase/migrations/20251112_phase5_metrics_views.sql
  └─ Vistas materializadas:
     - vw_polizas_metricas (agregados por asesor)
     - vw_cancelaciones_indices (LIMRA/IGC mensuales)
     - vw_rc_metricas (prospectos y permanencia)

supabase/migrations/20251112_phase5_product_type_refactor.sql
  └─ Refactoriza recalc_puntos_poliza() para usar product_types
  └─ Elimina dependencia en enum tipo_producto

supabase/migrations/20251112_phase5_segment_utilities.sql
  └─ Funciones: assign_user_segment(), assign_user_segment_by_name()
  └─ Funciones: remove_user_segment(), remove_user_segment_by_name()
  └─ RLS ajustada para segments, user_segments, campaign_progress

supabase/migrations/20251113_add_mes_conexion_to_candidatos.sql
  └─ Agrega columna mes_conexion a candidatos (formato YYYY-MM)
  └─ Backfill desde fecha_creacion_ct y fecha_creacion_pop

supabase/migrations/20251113_phase5_roles_normalization.sql
  └─ Normaliza roles: superusuario → supervisor, lector → viewer
  └─ Actualiza constraint usuarios_rol_check

supabase/migrations/20251113_phase5_segment_permissions_fix.sql
  └─ Ajusta assign_user_segment() para soportar service_role
  └─ Permite que backend actúe en nombre de supervisores

supabase/migrations/20251117_create_campaigns_custom_metrics.sql
  └─ Tabla campaigns_custom_metrics (datasets dinámicos)
  └─ Índices: usuario_dataset_metric_key, usuario_idx

supabase/migrations/20251118_campaign_progress_summary_view.sql
  └─ Vista: campaign_progress_summary (contadores agregados)
  └─ Campos: total, eligible_total, completed_total, status_counts

supabase/migrations/20251119_add_logical_groups_to_campaign_rules.sql
  └─ Columnas: logical_group, logical_operator (AND/OR)
  └─ Permite expresiones complejas: (A AND B) OR (C AND D)

supabase/migrations/20251120_campaign_cache_cron_job.sql
  └─ Función: clean_stale_campaign_cache() (elimina > 5 min)
  └─ Configuración pg_cron (requiere Supabase Pro)

supabase/migrations/20251120_campaign_datasets_function.sql
  └─ Función: calculate_campaign_datasets_for_user()
  └─ Calcula: polizas_prima_minima, polizas_recientes, polizas_por_producto

supabase/migrations/20251120_invalidate_campaign_cache_triggers.sql
  └─ 7 triggers automáticos para invalidar cache
  └─ Cobertura: candidatos, polizas, clientes, prospectos, planificaciones,
     custom_metrics, user_segments
```

#### Backend
```
src/lib/campaigns.ts
src/lib/campaignDatasetRegistry.ts
src/lib/segments.ts
src/lib/productTypes.ts
src/app/api/campaigns/route.ts
src/app/api/campaigns/[slug]/route.ts
src/app/api/campaigns/helpers.ts
src/app/api/admin/campaigns/route.ts
src/app/api/admin/campaigns/[id]/route.ts
src/app/api/admin/campaigns/[id]/status/route.ts
src/app/api/admin/campaigns/participants/route.ts
src/app/api/admin/segments/route.ts
src/app/api/admin/product-types/route.ts
src/app/api/cron/clean-campaign-cache/route.ts
```

#### Frontend
```
src/app/(private)/campanias/page.tsx
src/app/(private)/campanias/[slug]/page.tsx
src/app/(private)/campanias/CampaignWizard.tsx
src/app/(private)/campanias/AdminCampaignsView.tsx
src/components/campaigns/CampaignCard.tsx
src/components/campaigns/CampaignProgressBar.tsx
src/components/campaigns/ParticipantsModal.tsx
src/components/campaigns/SegmentSelector.tsx
```

#### Scripts
```
scripts/seed-campaigns.ts
scripts/seed-segments.ts
scripts/seed-custom-metrics.ts
scripts/evaluate-campaign.ts
scripts/report-campaigns.ts
scripts/test-cron-endpoint.ps1
```

#### Tests
```
test/campaignRoutes.test.ts
test/evaluateCampaign.test.ts
test/seedCampaigns.test.ts
test/campaignAdminHelpers.test.ts
```

#### Documentación
```
docs/CAMPAIGN_CACHE_INVALIDATION.md
FASE5.md (actualizado)
```

### Archivos Modificados

```
src/app/api/agentes/route.ts - Badge de conexión desde candidatos
src/app/(private)/gestion/page.tsx - Simplificación de Conexión
src/app/(private)/parametros/ParametrosClient.tsx - Removido developer management
src/lib/campaigns.ts - Fix en mes_conexion fallback
vercel.json - Agregado cron job
package.json - Dependencias actualizadas si aplica
```

---

## 🔍 Testing Realizado

### Tests Unitarios
✅ `test/evaluateCampaign.test.ts` - 15+ casos de evaluación de reglas  
✅ `test/campaignRoutes.test.ts` - Tests de API endpoints  
✅ `test/seedCampaigns.test.ts` - Validación de seeds  
✅ `test/campaignAdminHelpers.test.ts` - Helpers de administración

### Tests de Integración
✅ Creación de campaña end-to-end  
✅ Evaluación de progreso con datos reales  
✅ Asignación de segmentos y verificación de elegibilidad  
✅ Triggers de invalidación de cache (testeado con UPDATE)

### Tests Manuales
✅ Wizard de campañas con todos los pasos  
✅ Modal de participantes con filtros  
✅ Dashboard de usuario con múltiples campañas  
✅ Cambio de `mes_conexion` invalida cache correctamente

---

## ⚙️ Configuración Requerida

### Variables de Entorno

Agregar a `.env.local` (opcional para desarrollo):
```bash
# Cron Job Security (recomendado en producción)
CRON_SECRET=tu-token-secreto-aqui

# Cache TTL (opcional, default: 300 segundos)
CAMPAIGN_CACHE_TTL=300
```

### Vercel

El cron job está configurado en `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/clean-campaign-cache",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

Se activará automáticamente al hacer deploy. No requiere configuración adicional.

### Supabase

Las migraciones ya están aplicadas en `develop`. Para `main`:

**IMPORTANTE**: Configurar la variable `MainDATABASE_URL` en `.env.local` antes de ejecutar migraciones en producción.

```bash
# Aplicar todas las migraciones de fase 5 usando MainDATABASE_URL
node scripts/run_sql.js supabase/migrations/20251120_invalidate_campaign_cache_triggers.sql

# Verificar triggers
SELECT tgname, tgrelid::regclass 
FROM pg_trigger 
WHERE tgname LIKE 'trg_invalidate_cache%';
```

---

## 📝 Checklist Pre-Merge

### Código
- [x] Todas las pruebas unitarias pasan
- [x] No hay errores de TypeScript
- [x] No hay errores de ESLint
- [x] Code review completado
- [x] Documentación actualizada

### Base de Datos
- [x] Migraciones probadas en develop
- [x] Scripts de seeds ejecutados exitosamente
- [x] RLS policies verificadas
- [x] Índices creados para performance
- [x] Triggers de cache testeados

### Funcionalidad
- [x] Wizard de campañas funcional
- [x] Evaluación de reglas correcta
- [x] Cache invalidation working
- [x] Dashboard de usuario responsive
- [x] Permisos y roles funcionando

### Performance
- [x] Queries optimizadas con explain analyze
- [x] Vistas materializadas con refresh programado
- [x] Cache configurado (TTL: 5 min)
- [x] Índices en campos frecuentemente consultados

---

## 🚀 Plan de Despliegue

### Paso 1: Preparación (Pre-deploy)
```bash
# 1. Crear backup de producción
# (ejecutar desde dashboard de Supabase o CLI)

# 2. Verificar que develop está actualizado
git checkout develop
git pull origin develop

# 3. Ejecutar tests localmente
npm run test
npm run typecheck
npm run lint
```

### Paso 2: Merge a Main
```bash
# 1. Crear PR de develop → main
git checkout main
git pull origin main
git merge develop

# 2. Resolver conflictos si existen
# 3. Push a main
git push origin main
```

### Paso 3: Deploy de Migraciones
```bash
# En producción (Supabase CLI o dashboard)
# IMPORTANTE: Usar MainDATABASE_URL configurada en .env.local

# 1. Aplicar migrations en orden:
supabase db push

# O manualmente:
node scripts/run_sql.js supabase/migrations/20251120_invalidate_campaign_cache_triggers.sql

# 2. Verificar triggers creados
# 3. Ejecutar seeds iniciales (solo primera vez)
npm run seed:segments
npm run seed:campaigns
```

**CRÍTICO - Migración de Datos de Campañas**: 
Las campañas y requisitos configurados en `DevDATABASE_URL` deben ser copiados a `MainDATABASE_URL` ya que serán las campañas productivas. Esto incluye:

- Tabla `campaigns` (todas las campañas configuradas)
- Tabla `campaign_requirements` (todos los requisitos asociados)
- Tabla `segments` (segmentos de usuarios si fueron creados)
- Tabla `campaigns_custom_metrics` (métricas personalizadas si existen)

```bash
# Exportar datos de desarrollo
pg_dump -h [dev_host] -U [user] -d [dev_db] \
  -t campaigns -t campaign_requirements -t segments -t campaigns_custom_metrics \
  --data-only --column-inserts > campaign_data_export.sql

# Importar a producción usando MainDATABASE_URL
psql [connection_string_from_MainDATABASE_URL] < campaign_data_export.sql
```

Alternativamente, usar un script Node.js para copiar datos:
```bash
node scripts/copy-campaigns-to-main.js
```

### Paso 4: Deploy de Aplicación
```bash
# Vercel hará deploy automático desde main
# O manualmente:
vercel --prod
```

### Paso 5: Verificación Post-Deploy
```bash
# 1. Verificar que el cron job está activo
# Vercel Dashboard → Project → Settings → Cron Jobs

# 2. Verificar endpoints
curl https://tu-dominio.com/api/campaigns

# 3. Verificar triggers
# Hacer cambio en candidato y verificar cache invalidado

# 4. Monitorear logs por 24 horas
# Vercel Dashboard → Logs
# Supabase Dashboard → Logs
```

---

## ⚠️ Consideraciones Importantes

### Vistas Materializadas
Las vistas `vw_polizas_metricas`, `vw_cancelaciones_indices` y `vw_rc_metricas` se refrescan cada 5-10 minutos. Esto significa:
- El cache se invalida **inmediatamente** (triggers)
- Los datos en las vistas pueden tardar **hasta 10 minutos** en actualizarse
- Los usuarios verán cambios con un delay máximo de 10 minutos

### Cache TTL
El TTL por defecto es 5 minutos. Si necesitas mayor precisión:
```typescript
// src/app/api/campaigns/helpers.ts
export const DEFAULT_CACHE_TTL = 60 // Cambiar a 1 minuto
```

### Cron Job
El cron de Vercel solo funciona en producción. Para desarrollo:
```powershell
# Llamar endpoint manualmente
.\scripts\test-cron-endpoint.ps1
```

---

## 🐛 Rollback Plan

Si algo falla en producción:

### Rollback de Código
```bash
# 1. Revertir a commit anterior
git revert <commit-hash>
git push origin main

# 2. Vercel hará redeploy automático
```

### Rollback de Base de Datos
```sql
-- 1. Desactivar triggers
DROP TRIGGER IF EXISTS trg_invalidate_cache_candidatos ON candidatos;
DROP TRIGGER IF EXISTS trg_invalidate_cache_polizas ON polizas;
-- ... (repetir para todos los triggers)

-- 2. Si es necesario, eliminar tablas nuevas
-- (solo si no hay datos importantes)
DROP TABLE IF EXISTS campaign_progress CASCADE;
DROP TABLE IF EXISTS campaign_segments CASCADE;
DROP TABLE IF EXISTS campaign_rewards CASCADE;
DROP TABLE IF EXISTS campaign_rules CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS user_segments CASCADE;
DROP TABLE IF EXISTS segments CASCADE;

-- 3. Restaurar desde backup si es crítico
```

---

## 📊 Métricas de Éxito

Después del deploy, monitorear:

### Performance
- Tiempo de respuesta `/api/campaigns`: < 500ms (p95)
- Tiempo de respuesta `/api/campaigns/[slug]`: < 800ms (p95)
- Queries de evaluación: < 200ms
- Cache hit rate: > 70%

### Funcionalidad
- Triggers se ejecutan exitosamente: 100%
- Evaluaciones correctas: 100%
- Cron jobs ejecutados: sin errores

### Errores
- Error rate en endpoints: < 1%
- Failed triggers: 0
- Failed cron executions: 0

---

## 📞 Contactos

**Equipo de desarrollo:** [Tu equipo]  
**DBA:** [Responsable de DB]  
**DevOps:** [Responsable de infraestructura]

---

## 📚 Referencias

- [FASE5.md](./FASE5.md) - Especificación completa
- [CAMPAIGN_CACHE_INVALIDATION.md](./docs/CAMPAIGN_CACHE_INVALIDATION.md) - Estrategias de cache
- [README.md](./README.md) - Documentación general del proyecto

---

**Preparado por:** Copilot AI  
**Fecha:** 20 de noviembre, 2025  
**Versión:** 1.0
