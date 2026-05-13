import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; reclutadorId: string }> }

const supabase = ensureAdminClient()

export async function DELETE(_req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id, reclutadorId } = await context.params

  const { error } = await supabase
    .from('sp_campana_reclutadores')
    .delete()
    .eq('id', reclutadorId)
    .eq('campana_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('sp_reclutador_eliminado', { snapshot: { campana_id: id, reclutador_row_id: reclutadorId } })
  return new NextResponse(null, { status: 204 })
}

export async function PATCH(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id, reclutadorId } = await context.params

  let body: { calcom_event_type_id?: number | null; calcom_scheduling_url?: string | null; activo?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.calcom_event_type_id !== undefined) update.calcom_event_type_id = body.calcom_event_type_id
  if (body.calcom_scheduling_url !== undefined) update.calcom_scheduling_url = body.calcom_scheduling_url?.trim() ?? null
  if (typeof body.activo === 'boolean') update.activo = body.activo

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sp_campana_reclutadores')
    .update(update)
    .eq('id', reclutadorId)
    .eq('campana_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
