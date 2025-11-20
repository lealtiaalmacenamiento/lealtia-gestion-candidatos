# Plan de Migración y Rollback - Fase 5

## Resumen

Este documento describe el proceso de migración de datos y el plan de rollback para la Fase 5 (Campaigns & Segments). La migración principal introduce 8 nuevas tablas sin alterar datos existentes de `producto_parametros` u otras tablas legacy.

---

## Impacto de la migración

### Tablas nuevas (creadas)
- `segments` - Segmentos de usuario
- `user_segments` - Relación usuarios ↔ segmentos
- `product_types` - Catálogo de tipos de producto
- `campaigns` - Definición de campañas
- `campaign_segments` - Relación campañas ↔ segmentos
- `campaign_product_types` - Relación campañas ↔ tipos de producto
- `campaign_custom_metrics` - Métricas personalizadas por campaña
- `campaign_evaluation_cache` - Caché de evaluación de elegibilidad

### Tablas modificadas
- **Ninguna** - Esta migración no altera tablas existentes

### Datos en riesgo
- **Bajo riesgo**: No se modifican datos de producción
- **Dependencias**: Las tablas nuevas referencian `usuarios.id` vía FK, pero no alteran la tabla `usuarios`

---

## Pre-migración: Checklist

- [ ] **Backup completo de BD**: 
  ```bash
  # En Supabase Dashboard:
  # Settings > Database > Backups > Create backup
  ```
  
- [ ] **Verificar versión actual de schema**:
  ```sql
  SELECT * FROM supabase_migrations.schema_migrations 
  ORDER BY version DESC LIMIT 5;
  ```

- [ ] **Verificar espacio disponible**: Las 8 tablas nuevas son livianas, pero verificar espacio en disco

- [ ] **Notificar stakeholders**: Advertir ventana de mantenimiento si se espera downtime (no debería haberlo)

- [ ] **Tag de pre-migración en Git**:
  ```bash
  git tag pre-phase5-migration
  git push origin pre-phase5-migration
  ```

---

## Ejecución de migración

### Paso 1: Aplicar migraciones SQL

Las migraciones se aplican automáticamente en Supabase al hacer push a la rama conectada. Si necesitas aplicarlas manualmente:

```bash
# Desde Supabase Dashboard > SQL Editor
# Ejecutar en orden:
# 1. supabase/migrations/20251112_phase5_campaigns_schema.sql
# 2. supabase/migrations/20251113_phase5_roles_normalization.sql
# 3. supabase/migrations/20251114_phase5_campaigns_rls.sql
```

**Duración estimada**: 30-60 segundos

### Paso 2: Verificar integridad

```sql
-- Verificar que todas las tablas existen
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'segments', 'user_segments', 'product_types', 
  'campaigns', 'campaign_segments', 'campaign_product_types',
  'campaign_custom_metrics', 'campaign_evaluation_cache'
);

-- Verificar RLS está habilitado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename LIKE 'campaign%' OR tablename LIKE '%segment%';

-- Verificar función is_super_role existe
SELECT proname FROM pg_proc WHERE proname = 'is_super_role';
```

### Paso 3: Ejecutar seeds iniciales

```bash
# Seed de segmentos básicos
npm run seed:segments

# Seed de tipos de producto
npm run seed:product-types

# Seed de campañas de ejemplo (opcional, sólo en dev)
npm run seed:campaigns
```

### Paso 4: Smoke tests

```bash
# Verificar APIs responden
curl https://your-app.vercel.app/api/campaigns
curl https://your-app.vercel.app/api/admin/segments
curl https://your-app.vercel.app/api/admin/campaigns

# Ejecutar suite de tests
npm test
```

---

## Post-migración: Validación

- [ ] **Verificar RLS policies activas**:
  ```sql
  SELECT schemaname, tablename, policyname 
  FROM pg_policies 
  WHERE tablename LIKE '%campaign%' OR tablename LIKE '%segment%';
  ```

- [ ] **Verificar permisos de roles**:
  ```sql
  SELECT * FROM usuarios WHERE rol IN ('admin', 'supervisor') LIMIT 5;
  ```

- [ ] **Verificar índices creados**:
  ```sql
  SELECT indexname, tablename FROM pg_indexes 
  WHERE tablename IN ('campaigns', 'segments', 'user_segments');
  ```

- [ ] **Monitorear logs de aplicación** en Vercel durante 24 horas

---

## Rollback: Plan A (Preferido)

### Opción 1: Revertir migraciones SQL

Si detectas problemas **inmediatamente** después de la migración:

```sql
-- 1. Desactivar RLS (opcional, para debugging)
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE segments DISABLE ROW LEVEL SECURITY;
-- ... (repetir para todas las tablas)

-- 2. Eliminar tablas en orden inverso (respetando FKs)
DROP TABLE IF EXISTS campaign_evaluation_cache CASCADE;
DROP TABLE IF EXISTS campaign_custom_metrics CASCADE;
DROP TABLE IF EXISTS campaign_product_types CASCADE;
DROP TABLE IF EXISTS campaign_segments CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS product_types CASCADE;
DROP TABLE IF EXISTS user_segments CASCADE;
DROP TABLE IF EXISTS segments CASCADE;

-- 3. Eliminar función helper
DROP FUNCTION IF EXISTS is_super_role(text);

-- 4. Eliminar tipos ENUM
DROP TYPE IF EXISTS campaign_status;
```

**Duración estimada**: 1-2 minutos

### Opción 2: Restaurar desde backup

Si la Opción 1 falla o hay corrupción de datos:

```bash
# En Supabase Dashboard:
# Settings > Database > Backups > Restore
# Seleccionar backup pre-migración
```

**Duración estimada**: 5-15 minutos (incluye downtime)

---

## Rollback: Plan B (Restauración completa)

Si los planes A fallan, proceder con restauración total:

### Paso 1: Clonar proyecto Supabase
```bash
# Crear nuevo proyecto Supabase
# Restaurar desde backup más reciente
# Actualizar DNS/variables de entorno
```

### Paso 2: Revertir código en Vercel
```bash
git revert <commit-hash-of-phase5>
git push origin main
# O usar Vercel Dashboard > Deployments > Rollback
```

### Paso 3: Comunicar incidente
- Notificar stakeholders
- Documentar causa raíz
- Planificar remediación

---

## Respaldo de datos legacy

Aunque esta migración **no altera** `producto_parametros`, se recomienda crear snapshot:

```sql
-- Crear tabla de respaldo (una vez, antes de migración)
CREATE TABLE producto_parametros_backup_phase5 AS 
SELECT * FROM producto_parametros;

-- Verificar respaldo
SELECT COUNT(*) FROM producto_parametros_backup_phase5;
```

**Nota**: Este backup es preventivo. Las tablas de Phase 5 no tocan `producto_parametros`.

---

## Monitoreo post-migración

### KPIs a vigilar (primeras 48 horas)

- **Errores 500 en `/api/campaigns`**: Debe ser 0
- **Errores 500 en `/api/admin/*`**: Debe ser 0
- **Tiempo de respuesta de `/api/campaigns`**: < 500ms
- **Tasa de error de RLS**: 0% (no deben haber "permission denied")
- **Uso de CPU/memoria en Supabase**: Monitorear picos

### Alertas a configurar

- Slack/email si tasa de error > 1% en endpoints de campaigns
- Alerta si tiempo de respuesta > 2s en `/api/campaigns`
- Alerta si hay más de 10 errores RLS en 5 minutos

---

## Contactos de emergencia

- **DBA/DevOps**: [tu-email@example.com]
- **Product Owner**: [owner@example.com]
- **Supabase Support**: support@supabase.io

---

## Lecciones aprendidas (post-mortem template)

Completar después de la migración:

- **¿Qué salió bien?**
- **¿Qué salió mal?**
- **¿Qué mejorar para la próxima migración?**
- **Tiempo total de migración**: [X minutos]
- **Downtime real**: [0 minutos esperado]
