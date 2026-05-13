import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getInbox } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

const supabase = ensureAdminClient()

/**
 * GET /api/sendpilot/inbox
 * Returns inbox threads for the current recruiter's campaigns.
 * Each recruiter only sees their own campaign threads.
 * Admins/supervisors may pass ?campana_id=<uuid> to filter to one campaign.
 *
 * Query params:
 *   campana_id? : filter to a specific campaign (UUID)
 *   cursor?     : pagination cursor from previous response
 */
export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const url = new URL(req.url)
  const campanaIdParam = url.searchParams.get('campana_id')
  const cursor = url.searchParams.get('cursor') ?? undefined

  const isSuper = ['admin', 'supervisor'].includes(actor.rol)

  // Resolve which SP campaign IDs to fetch inbox from
  let spCampaignIds: string[] = []

  if (campanaIdParam) {
    // Fetch that specific campaign
    const { data: campana } = await supabase
      .from('sp_campanas')
      .select('sendpilot_campaign_id')
      .eq('id', campanaIdParam)
      .maybeSingle()
    if (campana) spCampaignIds = [campana.sendpilot_campaign_id]
  } else if (isSuper) {
    // All active campaigns
    const { data: campanas } = await supabase
      .from('sp_campanas')
      .select('sendpilot_campaign_id')
      .eq('estado', 'activa')
    spCampaignIds = (campanas || []).map(c => c.sendpilot_campaign_id)
  } else {
    // Recruiter: only their own campaigns
    if (!actor.id_auth) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })
    const { data: assignments } = await supabase
      .from('sp_campana_reclutadores')
      .select('campana_id, sp_campanas(sendpilot_campaign_id)')
      .eq('reclutador_id', actor.id_auth)
      .eq('activo', true)
    for (const a of assignments || []) {
      const spId = (a.sp_campanas as unknown as { sendpilot_campaign_id: string } | null)?.sendpilot_campaign_id
      if (spId) spCampaignIds.push(spId)
    }
  }

  if (spCampaignIds.length === 0) {
    return NextResponse.json({ threads: [], nextCursor: null })
  }

  // Fetch inbox from first matching campaign (SP inbox is per-campaign)
  // For multi-campaign, we aggregate the first page of each
  const results = await Promise.allSettled(
    spCampaignIds.map(spId => getInbox(spId, cursor))
  )

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason))

  const threads = results
    .flatMap(r => r.status === 'fulfilled' ? r.value.threads : [])
  const nextCursor = results
    .map(r => r.status === 'fulfilled' ? r.value.nextCursor : null)
    .find(c => c != null) ?? null

  return NextResponse.json({ threads, nextCursor, errors: errors.length ? errors : undefined })
}
