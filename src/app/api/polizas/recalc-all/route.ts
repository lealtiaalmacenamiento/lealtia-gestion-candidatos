import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { isActiveUser, normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type LimitBody = { limit?: number | string } | null

function parseLimit(u: URL, body: LimitBody): number | null {
  const qs = u.searchParams.get('limit')
  if (qs != null) {
    const n = Number(qs)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  }
  if (body && typeof body === 'object' && 'limit' in body) {
    const n = Number(body.limit)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  }
  return null
}

function matchSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.MARKET_SYNC_SECRET || ''
  if (!secret) return false
  const hdr = req.headers.get('x-cron-secret') || req.headers.get('x-market-sync-secret') || ''
  return hdr === secret
}

async function getSSR() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
}

function canRecalc(role?: string | null) {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'supervisor'
}

export async function POST(req: Request) {
  try {
    // Auth by secret header OR by logged-in super/admin role
    let authorized = matchSecret(req)
    let actor: string | null = null
    if (!authorized) {
      const ssr = await getSSR()
      const { data: auth } = await ssr.auth.getUser()
      if (!auth?.user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
      const { data: usuario } = await ssr.from('usuarios').select('*').eq('email', auth.user.email).maybeSingle()
      if (!isActiveUser(usuario) || !canRecalc(usuario?.rol)) {
        return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
      }
      authorized = true
      actor = auth.user.email
    }

    const url = new URL(req.url)
  const body: LimitBody = await req.json().catch(() => null)
    const limit = parseLimit(url, body)

    const supaAdmin = getServiceClient()
    const { data, error } = await supaAdmin.rpc('recalc_puntos_poliza_all', { p_limit: limit }).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, affected: data, limit: limit ?? null, actor: actor ?? 'secret' })
  } catch (e) {
    const msg = (e instanceof Error) ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) { return POST(req) }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-cron-secret,x-market-sync-secret,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-cron-secret,x-market-sync-secret,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })
}
