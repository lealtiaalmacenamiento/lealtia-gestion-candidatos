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

## Mejoras pendientes

Actualizado automáticamente.
\n+## Marca de despliegue
Redeploy marker: sprint6-roles-fix 2025-09-09T00:00:00Z
\n+## Marca de despliegue
Commit forzado para redeploy: ajuste timestamp ${(new Date()).toISOString()}.