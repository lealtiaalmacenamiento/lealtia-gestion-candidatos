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
  poliza_numero?: string | null
}

export async function GET() {
  const supa = await getSupa()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // 1) Traer pendientes de ambas tablas
  const [cr, pr] = await Promise.all([
    supa.from('cliente_update_requests')
      .select('id, cliente_id, solicitante_id, creado_at')
      .eq('estado', 'PENDIENTE')
      .order('creado_at', { ascending: false })
      .limit(200),
    supa.from('poliza_update_requests')
      .select('id, poliza_id, solicitante_id, creado_at')
      .eq('estado', 'PENDIENTE')
      .order('creado_at', { ascending: false })
      .limit(200)
  ])

  const items: PendingItem[] = []
  const clienteIds = new Set<string>()
  const polizaIds = new Set<string>()
  const solicitantes = new Set<string>()

  if (cr.data) {
    for (const r of cr.data as Array<{ id: string, cliente_id: string, solicitante_id: string, creado_at: string }>) {
      items.push({ id: r.id, tipo: 'cliente', ref_id: r.cliente_id, creado_at: r.creado_at, solicitante_id: r.solicitante_id, cliente_id: r.cliente_id })
      clienteIds.add(r.cliente_id)
      solicitantes.add(r.solicitante_id)
    }
  }
  if (pr.data) {
    for (const r of pr.data as Array<{ id: string, poliza_id: string, solicitante_id: string, creado_at: string }>) {
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

  // 3) Enriquecer: polizas -> cliente_id, numero_poliza
  const polizaMap = new Map<string, { cliente_id?: string | null, numero_poliza?: string | null }>()
  if (polizaIds.size) {
    try {
      const { data: pols } = await supa
        .from('polizas')
        .select('id, cliente_id, numero_poliza')
        .in('id', Array.from(polizaIds))
      for (const p of (pols || []) as Array<{ id: string, cliente_id: string, numero_poliza?: string | null }>) {
        polizaMap.set(p.id, { cliente_id: p.cliente_id, numero_poliza: p.numero_poliza ?? null })
        if (p.cliente_id) clienteIds.add(p.cliente_id)
      }
    } catch { /* omit */ }
  }

  // 4) Enriquecer: clientes -> nombre completo
  const clienteMap = new Map<string, { nombre: string | null }>()
  if (clienteIds.size) {
    try {
      const { data: cls } = await supa
        .from('clientes')
        .select('id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido')
        .in('id', Array.from(clienteIds))
      for (const c of (cls || []) as Array<{ id: string, primer_nombre?: string | null, segundo_nombre?: string | null, primer_apellido?: string | null, segundo_apellido?: string | null }>) {
        const pn = (c.primer_nombre || '').toString().trim()
        const sn = (c.segundo_nombre || '').toString().trim()
        const pa = (c.primer_apellido || '').toString().trim()
        const sa = (c.segundo_apellido || '').toString().trim()
        const nombre = [pn, sn, pa, sa].filter(Boolean).join(' ').trim() || null
        clienteMap.set(c.id, { nombre })
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
      if (c) it.cliente_nombre = c.nombre
    }
  }

  // Ordenar por fecha desc
  items.sort((a, b) => (new Date(b.creado_at).getTime() - new Date(a.creado_at).getTime()))

  return NextResponse.json({ items })
}
