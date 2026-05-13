import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const supabase = ensureAdminClient()

export async function GET(_req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await context.params

  const { data, error } = await supabase
    .from('sp_campana_reclutadores')
    .select('id,campana_id,reclutador_id,calcom_event_type_id,calcom_scheduling_url,activo,created_at,updated_at')
    .eq('campana_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with usuario info
  const authIds = (data || []).map(r => r.reclutador_id)
  const usuariosMap: Record<string, { id: number; email: string; nombre: string | null }> = {}
  if (authIds.length > 0) {
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id,email,nombre,id_auth')
      .in('id_auth', authIds)
    for (const u of usuarios || []) {
      if (u.id_auth) usuariosMap[u.id_auth] = { id: u.id, email: u.email, nombre: u.nombre ?? null }
    }
  }

  return NextResponse.json({
    items: (data || []).map(r => ({ ...r, usuario: usuariosMap[r.reclutador_id] ?? null }))
  })
}

export async function POST(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id } = await context.params

  let body: { reclutador_id?: string; calcom_event_type_id?: number | null; calcom_scheduling_url?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const reclutador_id = (body.reclutador_id ?? '').trim()
  if (!reclutador_id) return NextResponse.json({ error: 'reclutador_id es obligatorio' }, { status: 400 })

  // Validate reclutador exists
  const { data: usuarioRow } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id_auth', reclutador_id)
    .maybeSingle()
  if (!usuarioRow) return NextResponse.json({ error: 'Reclutador no encontrado' }, { status: 404 })

  const { data, error } = await supabase
    .from('sp_campana_reclutadores')
    .upsert(
      {
        campana_id: id,
        reclutador_id,
        calcom_event_type_id: body.calcom_event_type_id ?? null,
        calcom_scheduling_url: body.calcom_scheduling_url?.trim() ?? null,
        activo: true
      },
      { onConflict: 'campana_id,reclutador_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('sp_reclutador_agregado', { snapshot: { campana_id: id, reclutador_id } })
  return NextResponse.json(data, { status: 201 })
}
