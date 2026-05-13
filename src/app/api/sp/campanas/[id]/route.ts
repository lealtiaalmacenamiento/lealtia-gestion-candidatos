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
    .from('sp_campanas')
    .select(`
      id,
      nombre,
      sendpilot_campaign_id,
      calcom_linkedin_identifier,
      estado,
      created_at,
      updated_at,
      sp_campana_reclutadores (
        id,
        reclutador_id,
        calcom_event_type_id,
        calcom_scheduling_url,
        activo
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  // Enrich reclutadores with usuario info
  const reclutadorIds = ((data.sp_campana_reclutadores as unknown as Array<{ reclutador_id: string }>) || []).map(r => r.reclutador_id)
  let usuariosMap: Record<string, { id: number; email: string; nombre: string | null }> = {}
  if (reclutadorIds.length > 0) {
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id,email,nombre,id_auth')
      .in('id_auth', reclutadorIds)
    for (const u of usuarios || []) {
      if (u.id_auth) usuariosMap[u.id_auth] = { id: u.id, email: u.email, nombre: u.nombre ?? null }
    }
  }

  // Precandidato counts by estado
  const { data: preStats } = await supabase
    .from('sp_precandidatos')
    .select('estado')
    .eq('campana_id', id)
  const stats: Record<string, number> = {}
  for (const row of preStats || []) {
    stats[row.estado] = (stats[row.estado] ?? 0) + 1
  }

  return NextResponse.json({
    ...data,
    sp_campana_reclutadores: ((data.sp_campana_reclutadores as unknown as Array<{ reclutador_id: string }>) || []).map(r => ({
      ...r,
      usuario: usuariosMap[r.reclutador_id] ?? null
    })),
    stats
  })
}

export async function PATCH(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id } = await context.params

  let body: { nombre?: string; calcom_linkedin_identifier?: string; estado?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.nombre !== undefined) update.nombre = body.nombre.trim()
  if (body.calcom_linkedin_identifier !== undefined) update.calcom_linkedin_identifier = body.calcom_linkedin_identifier.trim()
  if (body.estado === 'activa' || body.estado === 'pausada' || body.estado === 'inactiva') {
    update.estado = body.estado
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sp_campanas')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('sp_campana_updated', { snapshot: { campana_id: id, update } })
  return NextResponse.json(data)
}
