import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { pauseCampaign, resumeCampaign } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const supabase = ensureAdminClient()

/**
 * PATCH /api/sendpilot/campaigns/[id]
 * Body: { action: 'pause' | 'resume' }
 * [id] is our internal sp_campanas UUID (not SP's own ID).
 */
export async function PATCH(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id } = await context.params

  let body: { action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.action !== 'pause' && body.action !== 'resume') {
    return NextResponse.json({ error: 'action debe ser "pause" o "resume"' }, { status: 400 })
  }

  // Look up the SP campaign ID
  const { data: campana, error: dbError } = await supabase
    .from('sp_campanas')
    .select('id,sendpilot_campaign_id,estado')
    .eq('id', id)
    .maybeSingle()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  if (!campana) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })

  try {
    if (body.action === 'pause') {
      await pauseCampaign(campana.sendpilot_campaign_id)
    } else {
      await resumeCampaign(campana.sendpilot_campaign_id)
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error SP' }, { status: 502 })
  }

  // Sync local estado
  const newEstado = body.action === 'pause' ? 'pausada' : 'activa'
  await supabase.from('sp_campanas').update({ estado: newEstado }).eq('id', id)

  return NextResponse.json({ ok: true, estado: newEstado })
}
