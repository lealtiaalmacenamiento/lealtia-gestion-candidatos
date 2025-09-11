import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getSupa() {
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

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  let authUserId: string | null = null
  if (!usuario?.email) {
    const supaProbe = await getSupa()
    const { data: auth } = await supaProbe.auth.getUser()
    if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    authUserId = auth.user.id
  } else {
    const anyU = usuario as unknown as { id_auth?: string | null }
    authUserId = anyU?.id_auth ?? null
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const clienteId = (url.searchParams.get('cliente_id') || '').trim()
  const role = (usuario?.rol || '').toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin'].includes(role)

  if (isSuper) {
    try {
      const admin = getServiceClient()
      let sel = admin
        .from('polizas')
        .select('id, cliente_id, numero_poliza, estatus, forma_pago, prima_input, prima_moneda, sa_input, sa_moneda, fecha_alta_sistema')
        .order('fecha_alta_sistema', { ascending: false })
        .limit(100)
      if (q) sel = sel.or(`numero_poliza.ilike.%${q}%,estatus.ilike.%${q}%`)
      if (clienteId) sel = sel.eq('cliente_id', clienteId)
  const { data, error } = await sel
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ items: data || [] })
    } catch {
      // fallback a SSR si falta service role
    }
  }

  const supa = await getSupa()
  let sel = supa
    .from('polizas')
    .select('id, cliente_id, numero_poliza, estatus, forma_pago, prima_input, prima_moneda, sa_input, sa_moneda, clientes!inner(asesor_id)')
    .order('fecha_alta_sistema', { ascending: false })
    .limit(100)
  if (q) sel = sel.or(`numero_poliza.ilike.%${q}%,estatus.ilike.%${q}%`)
  if (clienteId) sel = sel.eq('cliente_id', clienteId)
  // Filtrar por asesor_id si disponible (alineado con RLS)
  type MaybeAuth = { id_auth?: string | null }
  const u = usuario as unknown as MaybeAuth
  if (u?.id_auth) sel = sel.eq('clientes.asesor_id', u.id_auth)
  else if (authUserId) sel = sel.eq('clientes.asesor_id', authUserId)

  const { data, error } = await sel
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // quitar campo join anidado
  type PolizaRow = { id: string; cliente_id: string; numero_poliza: string; estatus: string; forma_pago: string; prima_input: number; prima_moneda: string; sa_input: number | null; sa_moneda: string | null }
  const items = (data || []).map((r) => ({ id: (r as PolizaRow).id, cliente_id: (r as PolizaRow).cliente_id, numero_poliza: (r as PolizaRow).numero_poliza, estatus: (r as PolizaRow).estatus, forma_pago: (r as PolizaRow).forma_pago, prima_input: (r as PolizaRow).prima_input, prima_moneda: (r as PolizaRow).prima_moneda, sa_input: (r as PolizaRow).sa_input, sa_moneda: (r as PolizaRow).sa_moneda }))
  return NextResponse.json({ items })
}
