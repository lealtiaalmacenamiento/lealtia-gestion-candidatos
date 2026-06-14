import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'
import { syncLeadsForCampaign } from '@/lib/sp-leads-sync'

export const dynamic = 'force-dynamic'

const supabase = ensureAdminClient()

/**
 * POST /api/sp/campanas/[id]/sync-leads
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id: campanaId } = await params

  const { data: campana, error: campanaError } = await supabase
    .from('sp_campanas')
    .select('id, sendpilot_campaign_id')
    .eq('id', campanaId)
    .single()

  if (campanaError || !campana) {
    return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  }

  const result = await syncLeadsForCampaign(campanaId, campana.sendpilot_campaign_id)

  if (result.error) {
    return NextResponse.json({ error: `Error al obtener leads de SendPilot: ${result.error}` }, { status: 502 })
  }

  await logAccion('sp_leads_sync', {
    usuario: actor.email,
    tabla_afectada: 'sp_precandidatos',
    snapshot: { campanaId, ...result }
  }).catch(() => {})

  return NextResponse.json(result)
}

