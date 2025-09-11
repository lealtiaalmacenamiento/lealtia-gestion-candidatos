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
  let usuario = await getUsuarioSesion()
  let authUserId: string | null = null
  if (!usuario?.email) {
    // Fallback a cookie session y luego buscar fila en usuarios para rol
    const supaProbe = await getSupa()
    const { data: auth } = await supaProbe.auth.getUser()
    if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    authUserId = auth.user.id
    try {
      const { data: uRow } = await supaProbe.from('usuarios').select('*').eq('id_auth', auth.user.id).maybeSingle()
      if (uRow) {
        usuario = { ...uRow, rol: (uRow.rol || '').toString() }
      }
    } catch {
      // ignorar, seguirá flujo como no-super
    }
  } else {
    const anyU = usuario as unknown as { id_auth?: string | null }
    authUserId = anyU?.id_auth ?? null
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const clienteId = (url.searchParams.get('cliente_id') || '').trim()
  const role = (usuario?.rol || '').toString().trim().toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin','root'].includes(role)

  if (isSuper) {
    try {
      const admin = getServiceClient()
      let sel = admin
    .from('polizas')
  .select('id, cliente_id, numero_poliza, estatus, forma_pago, periodicidad_pago, prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision, fecha_renovacion, tipo_pago, dia_pago, meses_check, fecha_alta_sistema, producto_parametros:producto_parametro_id(nombre_comercial, tipo_producto)')
        .order('fecha_alta_sistema', { ascending: false })
        .limit(100)
      if (q) sel = sel.or(`numero_poliza.ilike.%${q}%,estatus.ilike.%${q}%`)
      if (clienteId) sel = sel.eq('cliente_id', clienteId)
  const { data, error } = await sel
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  // map join + computed fields
  type Row = { id: string; cliente_id: string; numero_poliza: string; estatus: string; forma_pago: string; periodicidad_pago?: string|null; prima_input: number; prima_moneda: string; sa_input: number | null; sa_moneda: string | null; fecha_emision?: string | null; fecha_renovacion?: string | null; tipo_pago?: string | null; dia_pago?: number | null; meses_check?: Record<string, boolean>|null; producto_parametros?: { nombre_comercial?: string | null; tipo_producto?: string | null } | null }
  const items = ((data || []) as Row[]).map((r) => {
    const producto_nombre = r.producto_parametros?.nombre_comercial ?? null
    const tipo_producto = r.producto_parametros?.tipo_producto ?? null
    const fecha_emision: string | null = r.fecha_emision ?? null
      const fecha_renovacion: string | null = r.fecha_renovacion ?? null
    let renovacion: string | null = null
      if (fecha_emision && !fecha_renovacion) {
      try {
        const d = new Date(fecha_emision)
        d.setFullYear(d.getFullYear() + 1)
        renovacion = d.toISOString().slice(0,10)
      } catch {}
    }
      if (fecha_renovacion) renovacion = fecha_renovacion
    return {
      id: r.id,
      cliente_id: r.cliente_id,
      numero_poliza: r.numero_poliza,
      estatus: r.estatus,
      forma_pago: r.forma_pago,
  prima_input: r.prima_input,
  periodicidad_pago: r.periodicidad_pago ?? null,
      prima_moneda: r.prima_moneda,
      sa_input: r.sa_input,
      sa_moneda: r.sa_moneda,
      fecha_emision,
        fecha_renovacion,
        tipo_pago: r.tipo_pago ?? null,
        dia_pago: r.dia_pago ?? null,
        meses_check: r.meses_check ?? {},
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
    .select('id, cliente_id, numero_poliza, estatus, forma_pago, periodicidad_pago, prima_input, prima_moneda, sa_input, sa_moneda, fecha_emision, fecha_renovacion, tipo_pago, dia_pago, meses_check, producto_parametros:producto_parametro_id(nombre_comercial, tipo_producto), clientes!inner(asesor_id)')
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
  type Row = { id: string; cliente_id: string; numero_poliza: string; estatus: string; forma_pago: string; periodicidad_pago?: string|null; prima_input: number; prima_moneda: string; sa_input: number | null; sa_moneda: string | null; fecha_emision?: string | null; fecha_renovacion?: string | null; tipo_pago?: string | null; dia_pago?: number | null; meses_check?: Record<string, boolean>|null; producto_parametros?: { nombre_comercial?: string | null; tipo_producto?: string | null } | null }
  const items = ((data || []) as Row[]).map((r) => {
    const producto_nombre = r.producto_parametros?.nombre_comercial ?? null
    const tipo_producto = r.producto_parametros?.tipo_producto ?? null
      const fecha_emision: string | null = r.fecha_emision ?? null
      const fecha_renovacion: string | null = r.fecha_renovacion ?? null
    let renovacion: string | null = null
      if (fecha_emision && !fecha_renovacion) {
      try {
        const d = new Date(fecha_emision)
        d.setFullYear(d.getFullYear() + 1)
        renovacion = d.toISOString().slice(0,10)
      } catch {}
    }
      if (fecha_renovacion) renovacion = fecha_renovacion
    return {
      id: r.id,
      cliente_id: r.cliente_id,
      numero_poliza: r.numero_poliza,
      estatus: r.estatus,
  forma_pago: r.forma_pago,
  periodicidad_pago: r.periodicidad_pago ?? null,
      prima_input: r.prima_input,
      prima_moneda: r.prima_moneda,
      sa_input: r.sa_input,
      sa_moneda: r.sa_moneda,
      fecha_emision,
        fecha_renovacion,
        tipo_pago: r.tipo_pago ?? null,
        dia_pago: r.dia_pago ?? null,
        meses_check: r.meses_check ?? {},
      renovacion,
      producto_nombre,
      tipo_producto
    }
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  // Crear nueva póliza: super puede crear para cualquier cliente; agente solo para clientes propios
  let usuario = await getUsuarioSesion()
  // Fallback SSR auth (cookies) si getUsuarioSesion devolvió null
  if (!usuario) {
    try {
      const supa = await getSupa()
      const { data: authRes } = await supa.auth.getUser()
      const email = authRes?.user?.email
      if (email) {
        const { data: uRow } = await supa.from('usuarios').select('*').eq('email', email).maybeSingle()
        if (uRow) {
          interface UsuarioRow { id: number; email: string; rol: string; activo: boolean; id_auth?: string | null; nombre?: string|null; last_login?: string|null }
          // Normalizar rol a cadena no vacía
          const normalized = { ...uRow, rol: (uRow.rol || '').toString() } as UsuarioRow
          usuario = normalized
        }
      }
    } catch {
      // ignore
    }
  }
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const role = (usuario.rol || '').toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin'].includes(role)

  const body = await req.json().catch(() => null) as {
    cliente_id?: string
    producto_parametro_id?: string | null
    numero_poliza?: string
    fecha_emision?: string
  fecha_renovacion?: string
  forma_pago?: string
  periodicidad_pago?: string
  tipo_pago?: string
  dia_pago?: number
  meses_check?: Record<string, boolean>
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
  const fecha_renovacion = (body.fecha_renovacion || '').trim()
  const forma_pago_raw = (body.forma_pago || '').trim()
  const periodicidad_pago = (body.periodicidad_pago || '').trim()
  // If front-end sent legacy A/S/T/M in forma_pago, interpret it as periodicidad and require a method in tipo_pago or default MODO_DIRECTO
  let forma_pago = forma_pago_raw
  const isFreq = ['A','S','T','M'].includes(forma_pago_raw)
  if (isFreq) {
    // shift to periodicidad if not provided
    forma_pago = (body.tipo_pago && ['MODO_DIRECTO','CARGO_AUTOMATICO'].includes(body.tipo_pago)) ? body.tipo_pago : 'MODO_DIRECTO'
  }
  const tipo_pago = (body.tipo_pago || '').trim()
  const dia_pago = typeof body.dia_pago === 'number' ? body.dia_pago : null
  const meses_check = body.meses_check && typeof body.meses_check === 'object' ? body.meses_check : null
  const prima_input = typeof body.prima_input === 'number' ? body.prima_input : Number.NaN
  const producto_parametro_id = (body.producto_parametro_id || '').trim()
  if (!cliente_id || !producto_parametro_id || !numero_poliza || !fecha_emision || !forma_pago || !isFinite(prima_input)) {
    return NextResponse.json({ error: 'Faltan campos requeridos: cliente_id, producto_parametro_id, numero_poliza, fecha_emision, forma_pago, prima_input' }, { status: 400 })
  }

  // Si no es super, validar que el cliente pertenece al asesor (RLS también lo reforzará en SELECTs)
  if (!isSuper) {
    try {
      const admin = getServiceClient()
      const { data: clienteRow, error: cErr } = await admin.from('clientes').select('id, asesor_id').eq('id', cliente_id).maybeSingle()
      if (cErr || !clienteRow) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  interface UsuarioAuth { id_auth?: string | null }
  const idAuth = (usuario as UsuarioAuth).id_auth || null
      if (!idAuth || clienteRow.asesor_id !== idAuth) {
        return NextResponse.json({ error: 'No autorizado para este cliente' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ error: 'Error validando cliente' }, { status: 500 })
    }
  }

  // Si viene producto_parametro_id, obtener moneda y rango SA para rellenar
  let prima_moneda: string | null = null
  let sa_moneda: string | null = null
  let sa_input: number | null = null
  if (body.producto_parametro_id) {
    try {
      const admin = getServiceClient()
      const { data: prod } = await admin.from('producto_parametros').select('id, moneda, sa_min, sa_max').eq('id', body.producto_parametro_id).maybeSingle()
      if (prod) {
        prima_moneda = (prod.moneda || '').trim() || null
        sa_moneda = prima_moneda
        if (typeof prod.sa_min === 'number') sa_input = prod.sa_min
      }
    } catch {}
  }

  const insertPayload: Record<string, unknown> = {
    cliente_id,
  producto_parametro_id: producto_parametro_id || null,
    numero_poliza,
    fecha_emision,
  fecha_renovacion: fecha_renovacion || null,
    forma_pago,
    periodicidad_pago: isFreq ? forma_pago_raw : (periodicidad_pago || null),
  tipo_pago: tipo_pago || null,
  dia_pago: dia_pago,
  meses_check: meses_check || {},
    prima_input,
    prima_moneda: prima_moneda || body.prima_moneda || null,
    sa_input: sa_input ?? body.sa_input ?? null,
    sa_moneda: sa_moneda || body.sa_moneda || null,
  }
  if (body.estatus) insertPayload.estatus = body.estatus

  try {
    const admin = getServiceClient()
    // Guardar contra duplicados: misma póliza para el mismo cliente
    const { data: dup } = await admin
      .from('polizas')
      .select('id')
      .eq('cliente_id', cliente_id)
      .eq('numero_poliza', numero_poliza)
      .limit(1)
    if (dup && dup.length) {
      return NextResponse.json({ error: 'Ya existe una póliza con ese número para este cliente' }, { status: 409 })
    }
    const { data, error } = await admin.from('polizas').insert(insertPayload).select('*').maybeSingle()
    if (error) {
      // Atrapamos la restricción única global por numero_poliza
      if (/uq_polizas_numero|unique/i.test(error.message)) {
        return NextResponse.json({ error: 'El número de póliza ya existe en el sistema. Verifica que no esté registrada con otro cliente.' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ item: data }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado'
    if (/No UDI value found/i.test(msg) || /No FX \(USD\/MXN\) found/i.test(msg)) {
      return NextResponse.json({ error: 'Falta valor de mercado (UDI/USD) para la fecha de emisión. Ejecuta sync de mercado para esa fecha.' }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
