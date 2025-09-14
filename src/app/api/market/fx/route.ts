import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { isActiveUser, normalizeRole } from '@/lib/roles'

const supabase = getServiceClient()

function canWriteMarket(role?: string | null) {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'supervisor' || r === 'superusuario' || r === 'super_usuario'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  let q = supabase.from('fx_values').select('*').order('fecha', { ascending: true })
  if (from) q = q.gte('fecha', from)
  if (to) q = q.lte('fecha', to)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supa = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
  const { data: { user } } = await supa.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: usuario } = await supa.from('usuarios').select('*').eq('email', user.email).maybeSingle()
  if (!isActiveUser(usuario) || !canWriteMarket(usuario?.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }
  const body = await req.json() as { fecha: string, valor: number, source?: string, stale?: boolean }
  if (!body?.fecha || typeof body.valor !== 'number') {
    return NextResponse.json({ error: 'Payload inválido (fecha, valor)' }, { status: 400 })
  }
  const payload = {
    fecha: body.fecha,
    valor: body.valor,
    source: body.source ?? 'manual',
    fetched_at: new Date().toISOString(),
    stale: !!body.stale,
  }
  const { data, error } = await supabase.from('fx_values').upsert(payload, { onConflict: 'fecha' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
