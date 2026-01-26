# Gestión Candidatos

Aplicación Next.js (App Router) desplegable en Vercel con Supabase como backend.

## Requisitos
- Node 18+
- Cuenta Supabase (project ref y claves)
- Variables de entorno configuradas

## Variables de Entorno
Usa `.env.example` como base:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ANON_KEY
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY
SUPABASE_KEY=SERVICE_ROLE_KEY

# Mailer (GoDaddy/Titan Mail SMTP)
MAILER_HOST=smtpout.secureserver.net
MAILER_PORT=465
MAILER_SECURE=true
MAILER_USER=contacto@lealtia.com.mx
MAILER_PASS=your_smtp_password
MAIL_FROM="Lealtia <contacto@lealtia.com.mx>"
MAIL_LOGIN_URL=https://yourdomain.com/login
```

En Vercel configúralas en Project Settings > Environment Variables (Production + Preview + Development si aplica).

## Desarrollo local

1. Copia `.env.example` a `.env.local` y completa valores.
2. Instala dependencias: `npm install`
3. Arranca: `npm run dev`

## Build producción
`npm run build` genera la build. (No usar `output: export`).

## Despliegue en Vercel
1. Sube cambios a `main` (o crea rama y PR).
2. Vercel detecta Next.js automáticamente. No establecer Output Directory manual.
3. Asegura variables de entorno antes del primer deploy exitoso.

## Notas Supabase
Durante build sin variables, el código usa proxys placeholder para evitar fallos. En runtime deben existir o se lanzará error al primer acceso.

## Endpoints debug
`/api/efc/debug/[id]` es sólo diagnóstico. Elimínalo antes de producción final si no se requiere.

## Fase 3: Productos parametrizados

- Columnas visibles en la tabla: Producto, Tipo, Moneda, Duración (años), Suma Asegurada (SA), AÑO 1–10, AÑO 11+.
- Formato de condición SA/Edad:
	- Por monto: ">= 500,000", "< 1,500,000", ">= 500,000 y <= 1,500,000".
	- Por edad: "> 45 años", "<= 65 años", "> 45 años y <= 65 años".
	- El campo de entrada acepta ejemplos como: ">= 500,000" | "< 1,500,000" | "<=45 años" | ">65 años".
- Reglas de permisos (centralizado en `src/lib/roles.ts` y aplicado en API `producto_parametros`):
	- Lectura: admin, supervisor, viewer, agente.
	- Alta/Edición: admin, supervisor.
	- Borrado: admin, supervisor.

## Fase 5: Campaigns & Segments

Sistema modular de campañas y segmentación de usuarios para gestión dinámica de objetivos y métricas personalizadas.

### Características principales
- **Segmentos**: Definir grupos de usuarios por criterios (equipos, regiones, productos).
- **Campañas**: Asociar múltiples segmentos con fechas de vigencia y estados (`draft`, `active`, `completed`, `cancelled`).
- **Product Types**: Catálogo de tipos de productos (`vida`, `autos`, `diversos`, etc.) con configuración de cuota mensual.
- **Métricas personalizadas**: Datasets y columnas dinámicas por campaña con fórmulas de agregación.
- **Evaluador**: Motor que determina elegibilidad de usuario en campaña según segmentos y fechas.

### APIs principales
- `GET /api/campaigns` - Lista campañas activas con elegibilidad del usuario
- `GET /api/campaigns/[slug]` - Detalle de campaña individual
- `GET /api/admin/segments` - CRUD de segmentos (requiere rol supervisor/admin)
- `GET /api/admin/campaigns` - CRUD de campañas (requiere rol supervisor/admin)
- `GET /api/admin/product-types` - CRUD de tipos de producto (requiere rol supervisor/admin)

### Permisos
- **Lectura pública**: `/api/campaigns` (usuarios autenticados)
- **Administración**: `/api/admin/*` (sólo admin y supervisor)
- **RLS**: Políticas documentadas en `docs/SECURITY_RLS.md`

### Documentación adicional
- Especificación completa: `FASE5.md`
- Guía de formato e i18n: `docs/FORMAT_I18N_GUIDE.md`
- Políticas de seguridad: `docs/SECURITY_RLS.md`

## Scripts de calidad

Antes de hacer merge a `main`, ejecuta:
```bash
npm run typecheck  # Verifica tipos TypeScript
npm run lint       # Verifica estilo de código
npm run test       # Ejecuta suite de tests (64 tests)
npm run build      # Compila para producción
```