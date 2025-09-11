import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

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

type PendingItem = {
  id: string
  tipo: 'cliente' | 'poliza'
  ref_id: string
  creado_at: string
  solicitante_id: string
  solicitante_nombre?: string | null
  solicitante_email?: string | null
  cliente_id?: string | null
  cliente_nombre?: string | null
  cliente_code?: string | null
  poliza_numero?: string | null
  ref_label?: string | null
  changes?: Array<{ campo: string, actual: unknown, propuesto: unknown }>
}

export async function GET() {
  const supa = await getSupa()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // 1) Traer pendientes de ambas tablas
  const [cr, pr] = await Promise.all([
    supa.from('cliente_update_requests')
      .select('id, cliente_id, solicitante_id, creado_at, payload_propuesto')
      .eq('estado', 'PENDIENTE')
      .order('creado_at', { ascending: false })
      .limit(200),
    supa.from('poliza_update_requests')
  .select('id, poliza_id, solicitante_id, creado_at, payload_propuesto')
      .eq('estado', 'PENDIENTE')
      .order('creado_at', { ascending: false })
      .limit(200)
  ])

  const items: PendingItem[] = []
  const clienteIds = new Set<string>()
  const polizaIds = new Set<string>()
  const solicitantes = new Set<string>()

  const clienteReqs = (cr.data || []) as Array<{ id: string, cliente_id: string, solicitante_id: string, creado_at: string, payload_propuesto?: Record<string, unknown> }>
  if (clienteReqs?.length) {
    for (const r of clienteReqs) {
      items.push({ id: r.id, tipo: 'cliente', ref_id: r.cliente_id, creado_at: r.creado_at, solicitante_id: r.solicitante_id, cliente_id: r.cliente_id, changes: [] })
      clienteIds.add(r.cliente_id)
      solicitantes.add(r.solicitante_id)
    }
  }
  const polizaReqs = (pr.data || []) as Array<{ id: string, poliza_id: string, solicitante_id: string, creado_at: string, payload_propuesto?: Record<string, unknown> }>
  if (polizaReqs?.length) {
    for (const r of polizaReqs) {
      items.push({ id: r.id, tipo: 'poliza', ref_id: r.poliza_id, creado_at: r.creado_at, solicitante_id: r.solicitante_id })
      polizaIds.add(r.poliza_id)
      solicitantes.add(r.solicitante_id)
    }
  }

  // 2) Enriquecer: usuarios (solicitantes)
  const usuariosMap = new Map<string, { nombre?: string | null, email?: string | null }>()
  if (solicitantes.size) {
    try {
      // solicitante_id proviene de auth.uid() (uuid); en la tabla usuarios corresponde a usuarios.id_auth
      const { data: users } = await supa
        .from('usuarios')
        .select('id_auth, nombre, email')
        .in('id_auth', Array.from(solicitantes))
      for (const u of (users || []) as Array<{ id_auth: string, nombre?: string | null, email?: string | null }>) {
        usuariosMap.set(u.id_auth, { nombre: u.nombre ?? null, email: u.email ?? null })
      }
    } catch { /* omit enrichment on RLS error */ }
  }

  // 3) Enriquecer: polizas -> cliente_id, numero_poliza y fila base para diffs
  const polizaMap = new Map<string, { cliente_id?: string | null, numero_poliza?: string | null, row?: Record<string, unknown> }>()
  if (polizaIds.size) {
    try {
      const { data: pols } = await supa
        .from('polizas')
        .select('id, cliente_id, numero_poliza, estatus, fecha_emision, fecha_renovacion, forma_pago, periodicidad_pago, dia_pago, prima_input, prima_moneda, sa_input, sa_moneda, producto_parametro_id, meses_check')
        .in('id', Array.from(polizaIds))
      for (const p of (pols || []) as Array<{ id: string, cliente_id: string, numero_poliza?: string | null, estatus?: string|null, fecha_emision?: string|null, fecha_renovacion?: string|null, forma_pago?: string|null, periodicidad_pago?: string|null, dia_pago?: number|null, prima_input?: number|null, prima_moneda?: string|null, sa_input?: number|null, sa_moneda?: string|null, producto_parametro_id?: string|null, meses_check?: unknown }>) {
        const row: Record<string, unknown> = {
          numero_poliza: p.numero_poliza ?? null,
          estatus: p.estatus ?? null,
          fecha_emision: p.fecha_emision ?? null,
          fecha_renovacion: p.fecha_renovacion ?? null,
          forma_pago: p.forma_pago ?? null,
          periodicidad_pago: p.periodicidad_pago ?? null,
          dia_pago: p.dia_pago ?? null,
          prima_input: p.prima_input ?? null,
          prima_moneda: p.prima_moneda ?? null,
          sa_input: p.sa_input ?? null,
          sa_moneda: p.sa_moneda ?? null,
          producto_parametro_id: p.producto_parametro_id ?? null,
          meses_check: p.meses_check ?? null,
        }
        polizaMap.set(p.id, { cliente_id: p.cliente_id, numero_poliza: p.numero_poliza ?? null, row })
        if (p.cliente_id) clienteIds.add(p.cliente_id)
      }
    } catch { /* omit */ }
  }

  // 4) Enriquecer: clientes -> nombre completo
  const clienteMap = new Map<string, { nombre: string | null, code?: string | null, row?: Record<string, unknown> }>()
  if (clienteIds.size) {
    try {
      const { data: cls } = await supa
        .from('clientes')
        .select('id, cliente_code, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, email, telefono_celular, fecha_nacimiento')
        .in('id', Array.from(clienteIds))
      for (const c of (cls || []) as Array<{ id: string, cliente_code?: string|null, primer_nombre?: string | null, segundo_nombre?: string | null, primer_apellido?: string | null, segundo_apellido?: string | null, email?: string|null, telefono_celular?: string|null, fecha_nacimiento?: string|null }>) {
        const pn = (c.primer_nombre || '').toString().trim()
        const sn = (c.segundo_nombre || '').toString().trim()
        const pa = (c.primer_apellido || '').toString().trim()
        const sa = (c.segundo_apellido || '').toString().trim()
        const nombre = [pn, sn, pa, sa].filter(Boolean).join(' ').trim() || null
        const row: Record<string, unknown> = {
          primer_nombre: c.primer_nombre ?? null,
          segundo_nombre: c.segundo_nombre ?? null,
          primer_apellido: c.primer_apellido ?? null,
          segundo_apellido: c.segundo_apellido ?? null,
          email: c.email ?? null,
          telefono_celular: c.telefono_celular ?? null,
          fecha_nacimiento: c.fecha_nacimiento ?? null,
        }
        clienteMap.set(c.id, { nombre, code: c.cliente_code ?? null, row })
      }
    } catch { /* omit */ }
  }

  // 5) Aplicar enriquecimiento
  for (const it of items) {
    const u = usuariosMap.get(it.solicitante_id)
    if (u) { it.solicitante_nombre = u.nombre ?? null; it.solicitante_email = u.email ?? null }
    if (it.tipo === 'poliza') {
      const p = polizaMap.get(it.ref_id)
      if (p) { it.cliente_id = p.cliente_id ?? null; it.poliza_numero = p.numero_poliza ?? null }
    }
    const cid = it.tipo === 'cliente' ? (it.cliente_id || it.ref_id) : (it.cliente_id || null)
    if (cid) {
      const c = clienteMap.get(cid)
      if (c) {
  it.cliente_nombre = c.nombre
  it.cliente_code = c.code || null
        // etiqueta de referencia amigable
        it.ref_label = c.code || c.nombre || cid
      }
    }
    // Construir diffs para cambios de cliente (si el request incluía payload)
    if (it.tipo === 'cliente' && it.ref_id && Array.isArray(clienteReqs)) {
      const req = clienteReqs.find(r => r.id === it.id)
      if (req && req.payload_propuesto && typeof req.payload_propuesto === 'object') {
        const c = clienteMap.get(req.cliente_id || it.ref_id)
        const base: Record<string, unknown> = (c?.row || {}) as Record<string, unknown>
        const diffs: Array<{ campo: string, actual: unknown, propuesto: unknown }> = []
        for (const [k, v] of Object.entries(req.payload_propuesto)) {
          const actual = base[k]
          diffs.push({ campo: k, actual, propuesto: v as unknown })
        }
        it.changes = diffs
      }
    }
    // Construir diffs para cambios de póliza
    if (it.tipo === 'poliza' && it.ref_id && Array.isArray(polizaReqs)) {
      const req = polizaReqs.find(r => r.id === it.id)
      if (req && req.payload_propuesto && typeof req.payload_propuesto === 'object') {
        const p = polizaMap.get(it.ref_id)
        const base: Record<string, unknown> = (p?.row || {}) as Record<string, unknown>
        const diffs: Array<{ campo: string, actual: unknown, propuesto: unknown }> = []
        for (const [k, v] of Object.entries(req.payload_propuesto)) {
          const actual = base[k]
          diffs.push({ campo: k, actual, propuesto: v as unknown })
        }
        it.changes = diffs
      }
    }
  }

  // Ordenar por fecha desc
  items.sort((a, b) => (new Date(b.creado_at).getTime() - new Date(a.creado_at).getTime()))

  return NextResponse.json({ items })
}
