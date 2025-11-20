# Fase 5 · Campañas, Segmentos Dinámicos y Tipos de Póliza

> **Objetivo general:** habilitar un módulo de campañas promocionales con segmentación dinámica, reglas configurables y seguimiento de progreso en tiempo real para asesores/promotores, administrado por supervisores desde el módulo de Parámetros.

---

## 1. Estado actual

- [x] Revisión completa del código base y del esquema "develop" (Supabase).
- [x] Conexión directa a la base (psql) configurada y verificada.
- [x] Documento de alcance y plan de implementación preparado (este archivo).
- [x] Migraciones, endpoints y UI completamente implementados.

---

## 2. Preparación de bases de datos (Supabase)

### 2.1 Catálogos y segmentación
- [x] Crear tabla `segments` (uuid PK, nombre, descripción, activo, timestamps).
- [x] Crear tabla `user_segments` (usuario, segmento, asignado_por, fechas) con RLS.
- [x] Migrar datos iniciales según roles actuales (asesores, promotores) → script seeds.
- [x] Exponer funciones SQL para asignar/quitar segmentos (usadas por API admin).

### 2.2 Campañas y progreso
- [x] Crear tabla `campaigns` (slug, nombre, segmento base, vigencia `daterange`, estado enum, notas, created_by, timestamps) con índices.
- [x] Crear tabla `campaign_rules` (campaign_id FK, scope `eligibility|goal`, rule_kind, config JSONB, prioridad).
- [x] Crear tabla `campaign_rewards` (campaign_id FK, título, descripción, acumulable, orden).
- [x] Crear tabla `campaign_segments` (campaign_id FK, label opcional) si se requieren subgrupos adicionales.
- [x] Crear tabla `campaign_progress` (campaign_id, usuario_id, eligible, progress num, status enum, métricas JSON, evaluated_at) con RLS.
- [x] Definir enum `campaign_status` (`draft`, `active`, `paused`, `archived`).
- [x] Definir enum `campaign_progress_status` (`not_eligible`, `eligible`, `completed`).
- [x] Añadir triggers `set_updated_at` donde aplique.
- [x] Policies RLS para `campaigns`, `campaign_rules`, `campaign_rewards`, `campaign_progress` y `segments`.

### 2.3 Catálogo de productos
- [x] Crear tabla `product_types` (uuid PK, code, name, descripción, activo).
- [x] Alter table `producto_parametros` → agregar `product_type_id` (FK) y migrar datos existentes.
- [x] Actualizar funciones/triggers relacionados (`producto_parametros_set_keys`, etc.).

### 2.4 Vistas y métricas soporte
- [x] Crear/actualizar vistas:
  - [x] `vw_polizas_metricas` (pólizas por agente, primas, comisiones, Momentum Vita).
  - [x] `vw_cancelaciones_indices` (LIMRA, IGC, Momentum).
  - [x] `vw_rc_metricas` (RC vigencia, reclutas de calidad, permanencia).
  - [x] Asegurar índices/materialización según rendimiento esperado.

---

## 3. Backend (Next.js API Routes / Server Actions)

### 3.1 Librería de reglas
- [x] Implementar evaluador `evaluateCampaign(campaign, metrics)` en `src/lib/campaigns` con soporte para:
  - `[x]` `ROLE`, `[x]` `SEGMENT`, `[x]` `COUNT_POLICIES`, `[x]` `TOTAL_PREMIUM`, `[x]` `RC_COUNT`, `[x]` `INDEX_THRESHOLD`, `[x]` `TENURE_MONTHS`, `[x]` `CUSTOM_SQL` (opcional controlado).
- [x] Añadir pruebas unitarias (Vitest) para cada regla y combinaciones AND/OR.
- [x] Incorporar cache opcional (Redis/Supabase KV) + invalidación.

### 3.2 Endpoints públicos
- [x] `GET /api/campaigns` → lista campañas activas filtradas por segmentos del usuario.
- [x] `GET /api/campaigns/[slug]` → detalle + evaluación en tiempo real.
- [x] Middleware auth existente (validación JWT/Supabase) aplicado.

### 3.3 Endpoints administración
- [x] `GET/POST /api/admin/segments` (CRUD).
- [x] `POST/DELETE /api/admin/users/:id/segments` (asignar/quitar).
- [x] `POST /api/admin/campaigns` (crear borrador con datos básicos).
- [x] `PATCH /api/admin/campaigns/:id` (editar datos, reglas, premios).
- [x] `POST /api/admin/campaigns/:id/status` (activar/pausar/archivar).
- [x] `DELETE /api/admin/campaigns/:id` si se requiere.
- [x] Registrar acciones en `registro_acciones`.

### 3.4 Seeds y scripts
- [x] `scripts/seed-campaigns.ts` → parsear `campañas.csv`, generar inserts `campaigns`, `campaign_rules`, `campaign_rewards`.
- [x] `scripts/seed-segments.ts` → crear segmentos iniciales + asignaciones base.
- [x] Validar scripts con entorno `develop` (`DATABASE_URL`).

---

## 4. Frontend (App Router)

### 4.1 Módulo Parámetros
- [x] Sección “Segmentos”: tabla, modal crear/editar, desactivar, asignación masiva.
- [x] Sección “Campañas”: listado con filtros (estado, segmento, vigencia, progreso).
  - [x] Wizard creación (Datos generales → Elegibilidad → Requisitos → Premios → Notas → Resumen).
  - [x] Edición inline/duplicar campaña.
  - [x] Contadores de elegibles/completadas (usa `campaign_progress`).
- [x] Sección “Tipos de póliza”: CRUD simple, validaciones de uso (evitar eliminar tipos activos).

### 4.2 Dashboard Agentes/Promotores
- [x] Página `/campanias`: cards con nombre, vigencia, estado (badge), progreso (barra), botón `Ver detalle`.
- [x] Página `/campanias/[slug]`: tabs “Resumen”, “Requisitos” (checklist), “Premios”, “Notas”.
- [x] Mostrar métricas actuales (pólizas emitidas, primas, RC, índices) y faltantes.
- [x] Manejar estados `No elegible`, `Elegible`, `Meta cumplida`.

### 4.3 Componentes reutilizables
- [x] `CampaignCard`, `CampaignProgressBar`, `RequirementList`, `RewardList`, `SegmentSelector`. Ubicados en `src/components/campaigns/`; revisar props para documentar en Storybook y asegurar variantes de estado.
- [x] Formularios con `react-hook-form` + `zod`, UI consistente con utilidades Bootstrap del proyecto. Esquemas compartidos definidos en `src/lib/validation/campaignSchemas.ts`, `segmentSchemas.ts` y `productTypeSchemas.ts`. Documentadas validaciones asíncronas recomendadas para slug único y solapamiento de fechas.
- [x] Internacionalización/formatos numéricos y de fechas. Implementados `formatCurrency` en `format.ts` y módulo completo `i18n.ts` con strings externalizadas, helpers de pluralización (`pluralize`, `pluralForm`, `pluralizers`) y funciones para badges/estados. Tests unitarios incluidos en `test/formatAndI18n.test.ts`.

---

## 5. Seguridad y permisos

- [x] Actualizar definición de roles (renombrar `superusuario` → `supervisor` en BD/app).
- [x] Verificar middleware `src/middleware.ts` cubre nuevas rutas.
- [x] Definir RLS detallada para tablas nuevas (lectura limitada por rol, escritura sólo supervisores).
- [x] Añadir tests e2e para rutas admin con usuarios sin permisos.

---

## 6. Calidad y despliegue

- [x] Actualizar documentación (`README`, `docs/`) con nuevas variables/env.
- [x] Añadir variables a `.env.example` y checklists de setup.
- [x] Incluir `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` antes de merge.
- [x] QA manual: escenarios de campaña (no elegible → elegible → completada).
- [x] Preparar plan de migración y rollback (respaldo de datos previos en `producto_parametros`).

---

## 7. Roadmap sugerido

1. **Semana 1**: migraciones DB + seeds iniciales + catálogo segmentos/product types.
2. **Semana 2**: evaluador + endpoints públicos/admin (sin UI).
3. **Semana 3**: UI administrador (Parámetros) + pruebas unitarias.
4. **Semana 4**: UI agentes/promotores + QA integral + documentación.

> Actualiza los checkboxes conforme avances para mantener visibilidad del progreso.
