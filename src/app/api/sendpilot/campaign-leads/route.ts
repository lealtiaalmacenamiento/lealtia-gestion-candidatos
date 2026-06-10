import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sendpilot/campaign-leads?id=<sendpilot_campaign_id>
 *
 * Returns the leads for a SP campaign sourced from our DB (sp_precandidatos),
 * which is already synced from SP and contains normalized linkedin_slug values.
 *
 * Response: { names: string[], slugs: string[] }
 *   - slugs: normalized linkedin slugs (primary match key against conversation profileUrl)
 *   - names: normalized "nombre" strings (fallback when profileUrl is a URN, not a URL)
 */
export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const spCampaignId = searchParams.get('id')?.trim()
  if (!spCampaignId) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const supabase = ensureAdminClient()

  // Look up CRM campaign by SP campaign ID
  const { data: campana } = await supabase
    .from('sp_campanas')
    .select('id')
    .eq('sendpilot_campaign_id', spCampaignId)
    .maybeSingle()

  if (!campana) {
    // Campaign not yet synced to DB — return empty so filter shows nothing rather than crashing
    return NextResponse.json({ names: [], slugs: [] })
  }

  const { data: leads, error } = await supabase
    .from('sp_precandidatos')
    .select('nombre, linkedin_slug')
    .eq('campana_id', campana.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  const slugs = (leads ?? [])
    .map(l => l.linkedin_slug as string | null)
    .filter((s): s is string => Boolean(s))

  const names = (leads ?? [])
    .map(l => normalize(l.nombre ?? ''))
    .filter(Boolean)

  return NextResponse.json({ names, slugs })
}
