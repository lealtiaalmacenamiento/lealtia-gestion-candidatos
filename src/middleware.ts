import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// Middleware simplificado: evita llamadas de red a Supabase que pueden colgar el arranque.
// Evitamos importar logger directamente para no arrastrar dependencias no compatibles con Edge.

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  // Permitir Cron de Vercel y rutas públicas de reportes sin sesión
  const isCronRequest = !!req.headers.get('x-vercel-cron') || (req.headers.get('user-agent')||'').toLowerCase().includes('vercel-cron')
  const projectRef = process.env.SUPABASE_PROJECT_REF
    || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https:\/\//,'').split('.')[0]
    || 'missing_project_ref'
  const access = req.cookies.get('sb-access-token')?.value
  const composite = req.cookies.get(`sb-${projectRef}-auth-token`)?.value
  // Consideramos válida la sesión si existe la cookie compuesta (nuevo flujo) O la cookie access (flujo antiguo)
  const session = (composite || access) ? { token: true } : null
  if (session) {
    // Carga perezosa sólo en runtime server (no edge) para evitar warnings de Node APIs
    if (process.env.NEXT_RUNTIME !== 'edge') {
      import('@/lib/logger').then(m => m.logAccion('middleware_session_cookie', {})).catch(() => {})
    }
  }

  const url = req.nextUrl

  // Rutas públicas
  const publicPaths = new Set([
    '/', '/login', '/api/login', '/api/logout',
    // Endpoints usados por Cron/diagnóstico
    '/api/reports/prospectos-daily-changes',
    '/api/auth_debug', '/api/env-check'
  ])
  const isAsset = url.pathname.startsWith('/_next/') || url.pathname.startsWith('/favicon') || url.pathname.startsWith('/public/')
  const isPublic = publicPaths.has(url.pathname) || isAsset || isCronRequest

  // Si no hay sesión y la ruta no es pública → redirigir a login
  if (!session && !isPublic) {
    const redirectUrl = new URL('/login', req.url)
    return NextResponse.redirect(redirectUrl)
  }

  // Si hay sesión y estás en /login → redirigir a dashboard
  if (session && url.pathname === '/login') {
    const redirectUrl = new URL('/home', req.url)
    return NextResponse.redirect(redirectUrl)
  }

  return res
}

// Configuración para qué rutas aplica
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
}
