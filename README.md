This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy (Vercel + Supabase)

### 1. Requisitos previos
* Cuenta en Vercel
* Proyecto Supabase configurado con tablas: usuarios, candidatos, etc.
* Clave Service Role (no exponer al cliente)
* Gmail con contraseña de aplicación si se usa envío de correos

### 2. Variables de entorno (Settings > Environment Variables)
Añade en Vercel (Production y Preview):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_PROJECT_REF=YOUR_PROJECT_REF
GMAIL_USER=correo@gmail.com
GMAIL_APP_PASS=app-password
MAIL_FROM="Lealtia" <correo@gmail.com>
MAIL_LOGIN_URL=https://tu-dominio.com/login
MAIL_LOGO_URL=https://tu-dominio.com/logo.png
```

No subas `.env.local`. Usa `.env.example` como referencia.

### 3. Importar el repo
1. En Vercel: New Project -> Import Git Repository
2. Selecciona este repositorio
3. Root directory: (raíz del proyecto actual)
4. Build Command: `next build` (por defecto)
5. Output: `.vercel/output` (Next gestiona esto solo)
6. Node.js versión: usar la recomendada por Vercel (>=18)

### 4. Seguridad / Hardening
* CSP dinámica ya configurada en `next.config.ts` (usa tu URL Supabase)
* Nunca pongas Service Role en código cliente (no tiene prefijo NEXT_PUBLIC_)
* Revisa reglas RLS en Supabase para tablas sensibles
* Activa MFA en cuentas administrativas

### 5. Flujos de autenticación
El middleware protege rutas en `(private)`. Asegúrate que las cookies de Supabase se emitan correctamente (dominio final) o forzar logout para limpiar sesión inconsistent.

### 6. Verificación post-deploy
1. Abrir `/login` y autenticar
2. Crear usuario nuevo (verifica correo enviado si configuraste Gmail)
3. CRUD candidatos y validar campo "fecha tentativa de examen"
4. Ver roles: usuario lector no debe ver columna acciones

### 7. Logs y diagnóstico
Usa panel Vercel > Logs. Para debug puntual puedes añadir `console.log` envuelto en `if (process.env.NODE_ENV !== 'production')` si no quieres ruido en prod.

### 8. Rollbacks
Cada deploy crea un immutable build. Si algo falla: Vercel > Deployments > Promote un commit previo.

### 9. Dominio personalizado
Añade dominio en Vercel (Settings > Domains). Actualiza `MAIL_LOGIN_URL` y revisa si tu logo carga vía HTTPS.

### 10. Próximos pasos sugeridos
* Añadir monitoreo (p.ej. LogSnag / Sentry) para errores
* Implementar rate limiting en endpoints críticos (login, usuarios)
* Añadir tests básicos (API + componentes críticos)

---
Para dudas adicionales revisa documentación oficial de Next.js y Supabase.
