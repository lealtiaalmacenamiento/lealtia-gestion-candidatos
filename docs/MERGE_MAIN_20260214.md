# Merge develop → main y Migraciones - 14 Feb 2026

## ✅ Git Merge Completado

**Rama:** develop → main
**Commit:** 9144c3f
**Estado:** Pushed to origin/main

### Cambios principales del merge:
- Sistema UDI y proyecciones (docs/UDI_SYSTEM.md)
- Landing page con formulario de reclutamiento
- Códigos de agente para referidos
- API endpoints: `/api/landing/*`, `/api/cron/update-udi`
- Componentes: UDICalculator, landing sections
- Hooks: useUDI
- Scripts de sincronización y verificación de BD

**Archivos modificados:** 59 archivos
**Insertions:** +7,308 líneas
**Deletions:** -1,335 líneas

---

## ✅ Migraciones Aplicadas a Producción

**Base de datos:** MainDATABASE_URL (db.oooyuomshachmmblmpvd.supabase.co)

### Migración 1: UDI Projections
**Archivo:** `20260207_add_udi_projection_column.sql`

- ✅ Agregada columna `is_projection` a `udi_values` (BOOLEAN, DEFAULT false)
- ✅ Agregada columna `is_projection` a `fx_values`
- ✅ Creados índices: `idx_udi_projection`, `idx_udi_fecha_projection`
- ✅ Valores existentes marcados como no-proyecciones

### Migración 2: Agent Codes
**Archivo:** `20260209_create_agent_codes_prod.sql`

- ✅ Tabla `agent_codes` creada
- ✅ Extensión `unaccent` habilitada
- ✅ RLS habilitado con políticas:
  - Agentes ven sus propios códigos
  - Supervisores ven todos
  - Solo admins pueden gestionar
- ✅ **15 códigos generados** automáticamente para agentes existentes
- ✅ Formato de códigos: Iniciales + últimos 4 dígitos CT

### Ejemplos de códigos generados:
```
AE2059   - ALEJANDRA ESTRELLA
APTL2599 - ANA PAULINA TREVIÑO
CEML5837 - CLAUDIA ELIZABETH MARTINEZ LARA
CMOV3494 - CRISTINA MARCELA OLIVO VILLEGAS
ECJ0637  - EDUARDO CASAS JIMENEZ
```

---

## 📂 Scripts Creados

1. **apply-new-migrations-to-prod.js**
   - Aplica migraciones a MainDATABASE_URL
   - Verificación automática post-aplicación

2. **20260209_create_agent_codes_prod.sql**
   - Versión adaptada para producción
   - Usa `fecha_de_creacion` en lugar de `created_at`

---

## ✅ Verificaciones Exitosas

```sql
-- Tabla agent_codes
SELECT COUNT(*) FROM agent_codes;
-- Resultado: 15 códigos

-- Columna is_projection en udi_values
\d udi_values
-- ✅ Columna presente con índices
```

---

## 🎯 Estado Final

- ✅ Merge develop → main completado
- ✅ Cambios pushed a GitHub
- ✅ Migraciones aplicadas a producción
- ✅ 15 códigos de agente generados
- ✅ Sistema UDI listo para proyecciones
- ✅ Landing page y APIs desplegadas
