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

type Item = {
  id: string
  tipo: 'cliente' | 'poliza'
  ref_id: string
  ref_nombre?: string | null
  ref_numero_poliza?: string | null
  solicitante_id: string
  solicitante_email?: string | null
  solicitante_nombre?: string | null
  estado: string
  motivo_rechazo?: string | null
  creado_at: string
  resuelto_at?: string | null
  resuelto_por?: string | null
  resuelto_por_email?: string | null
  resuelto_por_nombre?: string | null
  payload_propuesto: Record<string, unknown>
}

export async function GET() {
  const supa = await getSupa()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [cr, pr] = await Promise.all([
    supa.from('cliente_update_requests')
      .select('id, cliente_id, solicitante_id, estado, motivo_rechazo, creado_at, resuelto_at, resuelto_por, payload_propuesto')
      .order('creado_at', { ascending: false })
      .limit(200),
    supa.from('poliza_update_requests')
      .select('id, poliza_id, solicitante_id, estado, motivo_rechazo, creado_at, resuelto_at, resuelto_por, payload_propuesto')
      .order('creado_at', { ascending: false })
      .limit(200)
  ])

  const items: Item[] = []
  type ClienteReq = { id: string, cliente_id: string, solicitante_id: string, estado: string, motivo_rechazo?: string|null, creado_at: string, resuelto_at?: string|null, resuelto_por?: string|null, payload_propuesto: Record<string, unknown> }
  type PolizaReq = { id: string, poliza_id: string, solicitante_id: string, estado: string, motivo_rechazo?: string|null, creado_at: string, resuelto_at?: string|null, resuelto_por?: string|null, payload_propuesto: Record<string, unknown> }

  if (cr.data) items.push(...(cr.data as ClienteReq[]).map((r) => ({
    id: r.id, tipo: 'cliente' as const, ref_id: r.cliente_id, solicitante_id: r.solicitante_id,
    estado: r.estado, motivo_rechazo: r.motivo_rechazo ?? null, creado_at: r.creado_at, resuelto_at: r.resuelto_at ?? null, resuelto_por: r.resuelto_por ?? null,
    payload_propuesto: r.payload_propuesto
  })))
  if (pr.data) items.push(...(pr.data as PolizaReq[]).map((r) => ({
    id: r.id, tipo: 'poliza' as const, ref_id: r.poliza_id, solicitante_id: r.solicitante_id,
    estado: r.estado, motivo_rechazo: r.motivo_rechazo ?? null, creado_at: r.creado_at, resuelto_at: r.resuelto_at ?? null, resuelto_por: r.resuelto_por ?? null,
    payload_propuesto: r.payload_propuesto
  })))

  // Enriquecer con datos de usuarios (solicitante y resuelto_por)
  const ids = Array.from(new Set(items.flatMap(i => [i.solicitante_id, i.resuelto_por]).filter(Boolean))) as string[]
  if (ids.length) {
    try {
  type UserRow = { id_auth?: string|null, email?: string|null, nombre?: string|null }
  const { data: users } = await supa.from('usuarios').select('id_auth, email, nombre').in('id_auth', ids)
  const map = new Map<string, { email?: string|null, nombre?: string|null }>((users as UserRow[] || []).map((u) => [u.id_auth ?? '', { email: u.email ?? null, nombre: u.nombre ?? null }]))
      for (const it of items) {
        const s = map.get(it.solicitante_id)
        if (s) { it.solicitante_email = s.email ?? null; it.solicitante_nombre = s.nombre ?? null }
        if (it.resuelto_por) {
          const r = map.get(it.resuelto_por)
          if (r) { it.resuelto_por_email = r.email ?? null; it.resuelto_por_nombre = r.nombre ?? null }
        }
      }
    } catch { /* noop: si falla RLS o permisos, omitimos enriquecimiento */ }
  }

  // Enriquecer con datos de clientes y pólizas
  const clienteIds = items.filter(i => i.tipo === 'cliente').map(i => i.ref_id)
  const polizaIds = items.filter(i => i.tipo === 'poliza').map(i => i.ref_id)
  
  if (clienteIds.length) {
    try {
      type ClienteRow = { id: string, primer_nombre?: string|null, primer_apellido?: string|null, segundo_apellido?: string|null }
      const { data: clientes } = await supa.from('clientes').select('id, primer_nombre, primer_apellido, segundo_apellido').in('id', clienteIds)
      const clienteMap = new Map<string, string>((clientes as ClienteRow[] || []).map((c) => {
        const nombre = [c.primer_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ').trim()
        return [c.id, nombre || '']
      }))
      for (const it of items.filter(i => i.tipo === 'cliente')) {
        it.ref_nombre = clienteMap.get(it.ref_id) ?? null
      }
    } catch { /* noop */ }
  }
  
  if (polizaIds.length) {
    try {
      type PolizaRow = { id: string, numero_poliza?: string|null }
      const { data: polizas } = await supa.from('polizas').select('id, numero_poliza').in('id', polizaIds)
      const polizaMap = new Map<string, string>((polizas as PolizaRow[] || []).map((p) => [p.id, p.numero_poliza ?? '']))
      for (const it of items.filter(i => i.tipo === 'poliza')) {
        it.ref_numero_poliza = polizaMap.get(it.ref_id) ?? null
      }
    } catch { /* noop */ }
  }

  // Ordenar por creado_at desc combinando ambas
  items.sort((a, b) => (new Date(b.creado_at).getTime() - new Date(a.creado_at).getTime()))

  return NextResponse.json({ items })
}
