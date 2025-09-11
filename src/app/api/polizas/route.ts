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
        .select('id, cliente_id, numero_poliza, estatus, forma_pago, prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision, fecha_alta_sistema, producto_parametros:producto_parametro_id(nombre_comercial, tipo_producto)')
        .order('fecha_alta_sistema', { ascending: false })
        .limit(100)
      if (q) sel = sel.or(`numero_poliza.ilike.%${q}%,estatus.ilike.%${q}%`)
      if (clienteId) sel = sel.eq('cliente_id', clienteId)
  const { data, error } = await sel
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // map join + computed fields
  type Row = { id: string; cliente_id: string; numero_poliza: string; estatus: string; forma_pago: string; prima_input: number; prima_moneda: string; sa_input: number | null; sa_moneda: string | null; fecha_emision?: string | null; producto_parametros?: { nombre_comercial?: string | null; tipo_producto?: string | null } | null }
  const items = ((data || []) as Row[]).map((r) => {
    const producto_nombre = r.producto_parametros?.nombre_comercial ?? null
    const tipo_producto = r.producto_parametros?.tipo_producto ?? null
    const fecha_emision: string | null = r.fecha_emision ?? null
    let renovacion: string | null = null
    if (fecha_emision) {
      try {
        const d = new Date(fecha_emision)
        d.setFullYear(d.getFullYear() + 1)
        renovacion = d.toISOString().slice(0,10)
      } catch {}
    }
    return {
      id: r.id,
      cliente_id: r.cliente_id,
      numero_poliza: r.numero_poliza,
      estatus: r.estatus,
      forma_pago: r.forma_pago,
      prima_input: r.prima_input,
      prima_moneda: r.prima_moneda,
      sa_input: r.sa_input,
      sa_moneda: r.sa_moneda,
      fecha_emision,
      renovacion,
      producto_nombre,
      tipo_producto
    }
  })
  return NextResponse.json({ items })
    } catch {
      // fallback a SSR si falta service role
    }
  }

  const supa = await getSupa()
  let sel = supa
    .from('polizas')
  .select('id, cliente_id, numero_poliza, estatus, forma_pago, prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision, producto_parametros:producto_parametro_id(nombre_comercial, tipo_producto), clientes!inner(asesor_id)')
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
  type Row = { id: string; cliente_id: string; numero_poliza: string; estatus: string; forma_pago: string; prima_input: number; prima_moneda: string; sa_input: number | null; sa_moneda: string | null; fecha_emision?: string | null; producto_parametros?: { nombre_comercial?: string | null; tipo_producto?: string | null } | null }
  const items = ((data || []) as Row[]).map((r) => {
    const producto_nombre = r.producto_parametros?.nombre_comercial ?? null
    const tipo_producto = r.producto_parametros?.tipo_producto ?? null
    const fecha_emision: string | null = r.fecha_emision ?? null
    let renovacion: string | null = null
    if (fecha_emision) {
      try {
        const d = new Date(fecha_emision)
        d.setFullYear(d.getFullYear() + 1)
        renovacion = d.toISOString().slice(0,10)
      } catch {}
    }
    return {
      id: r.id,
      cliente_id: r.cliente_id,
      numero_poliza: r.numero_poliza,
      estatus: r.estatus,
      forma_pago: r.forma_pago,
      prima_input: r.prima_input,
      prima_moneda: r.prima_moneda,
      sa_input: r.sa_input,
      sa_moneda: r.sa_moneda,
      fecha_emision,
      renovacion,
      producto_nombre,
      tipo_producto
    }
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  // Crear nueva póliza (solo superusuario vía service role). Los no-super reciben 403.
  const usuario = await getUsuarioSesion()
  const role = (usuario?.rol || '').toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin'].includes(role)

  const body = await req.json().catch(() => null) as {
    cliente_id?: string
    producto_parametro_id?: string | null
    numero_poliza?: string
    fecha_emision?: string
    forma_pago?: string
    prima_input?: number
    prima_moneda?: string
    estatus?: string | null
    sa_input?: number | null
    sa_moneda?: string | null
  } | null
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })

  // Validaciones mínimas segun schema
  const cliente_id = (body.cliente_id || '').trim()
  const numero_poliza = (body.numero_poliza || '').trim()
  const fecha_emision = (body.fecha_emision || '').trim() // YYYY-MM-DD
  const forma_pago = (body.forma_pago || '').trim()
  const prima_input = typeof body.prima_input === 'number' ? body.prima_input : Number.NaN
  const prima_moneda = (body.prima_moneda || '').trim()
  if (!cliente_id || !numero_poliza || !fecha_emision || !forma_pago || !prima_moneda || !isFinite(prima_input)) {
    return NextResponse.json({ error: 'Faltan campos requeridos: cliente_id, numero_poliza, fecha_emision, forma_pago, prima_input, prima_moneda' }, { status: 400 })
  }

  if (!isSuper) {
    return NextResponse.json({ error: 'Solo superusuario puede crear pólizas' }, { status: 403 })
  }

  const insertPayload: Record<string, unknown> = {
    cliente_id,
    producto_parametro_id: body.producto_parametro_id || null,
    numero_poliza,
    fecha_emision,
    forma_pago,
    prima_input,
    prima_moneda,
  }
  if (body.estatus) insertPayload.estatus = body.estatus
  if (body.sa_input !== undefined) insertPayload.sa_input = body.sa_input
  if (body.sa_moneda !== undefined) insertPayload.sa_moneda = body.sa_moneda

  try {
    const admin = getServiceClient()
    const { data, error } = await admin.from('polizas').insert(insertPayload).select('*').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
