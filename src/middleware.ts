import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE_BASE, SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS, SESSION_MAX_AGE_SECONDS, parseSessionIssued } from '@/lib/sessionExpiration'
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
  const sessionIssuedValue = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null
  const sessionIssuedAt = parseSessionIssued(sessionIssuedValue)
  if (session) {
    // Carga perezosa sólo en runtime server (no edge) para evitar warnings de Node APIs
    if (process.env.NEXT_RUNTIME !== 'edge') {
      import('@/lib/logger').then(m => m.logAccion('middleware_session_cookie', {})).catch(() => {})
    }
    const now = Date.now()
    const expired = !sessionIssuedAt || now - sessionIssuedAt > SESSION_MAX_AGE_MS
    if (expired) {
      const redirectUrl = new URL('/login', req.url)
      const redirect = NextResponse.redirect(redirectUrl)
      expireSessionCookies(redirect, req, projectRef)
      return redirect
    }
    res.cookies.set(SESSION_COOKIE_NAME, String(now), {
      ...SESSION_COOKIE_BASE,
      maxAge: SESSION_MAX_AGE_SECONDS
    })
  }
  if (!session && sessionIssuedAt != null) {
    expireSessionCookies(res, req, projectRef)
  }

  const url = req.nextUrl
  const isApi = url.pathname.startsWith('/api/')

  // Rutas públicas
  const publicPaths = new Set([
    '/', '/login', '/api/login', '/api/logout',
    // Endpoints usados por Cron/diagnóstico
    '/api/reports/prospectos-daily-changes',
    '/api/market/sync',
    '/api/auth_debug', '/api/env-check'
  ])
  // Si viene el secreto de cron (header o query), tratarlo como solicitud de cron
  const hasCronSecret = !!req.headers.get('x-cron-secret') || !!url.searchParams.get('secret')
  const isAsset = url.pathname.startsWith('/_next/') || url.pathname.startsWith('/favicon') || url.pathname.startsWith('/public/')
  const isPublic = publicPaths.has(url.pathname) || isAsset || isCronRequest || hasCronSecret

  // Para asegurar autorización del Cron aunque el header no llegue, reescribimos agregando el secret como query interno
  if ((url.pathname === '/api/market/sync' || url.pathname === '/api/reports/prospectos-daily-changes') && (isCronRequest || hasCronSecret)) {
    const alreadyHas = url.searchParams.get('secret')
    if (!alreadyHas) {
      // Elegir la env var correcta según endpoint
      const cronSecret = url.pathname === '/api/reports/prospectos-daily-changes'
        ? (process.env.REPORTES_CRON_SECRET || process.env.CRON_SECRET)
        : (process.env.CRON_SECRET || process.env.MARKET_SYNC_SECRET)
      if (cronSecret) {
        const rewritten = new URL(url.toString())
        rewritten.searchParams.set('secret', cronSecret)
        return NextResponse.rewrite(rewritten)
      }
    }
  }

  // Si no hay sesión y la ruta no es pública → redirigir a login
  if (!session && !isPublic) {
    if (isApi) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    const redirectUrl = new URL('/login', req.url)
    return NextResponse.redirect(redirectUrl)
  }

  // Si hay sesión y estás en /login → redirigir a dashboard
  if (session && url.pathname === '/login') {
    const redirectUrl = new URL('/home', req.url)
    const redirect = NextResponse.redirect(redirectUrl)
    redirect.cookies.set(SESSION_COOKIE_NAME, String(Date.now()), {
      ...SESSION_COOKIE_BASE,
      maxAge: SESSION_MAX_AGE_SECONDS
    })
    return redirect
  }

  return res
}

function expireSessionCookies(response: NextResponse, req: NextRequest, projectRef: string) {
  const prefix = `sb-${projectRef}-auth-token`
  const expired = { path: '/', expires: new Date(0) } as const
  const names = new Set<string>(['sb-access-token', 'sb-refresh-token', SESSION_COOKIE_NAME])
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name === prefix || cookie.name.startsWith(prefix + '.')) {
      names.add(cookie.name)
    }
    if (cookie.name.startsWith(prefix + '-')) {
      names.add(cookie.name)
    }
  }
  for (const name of names) {
    response.cookies.set(name, '', expired)
  }
}

// Configuración para qué rutas aplica
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
}
