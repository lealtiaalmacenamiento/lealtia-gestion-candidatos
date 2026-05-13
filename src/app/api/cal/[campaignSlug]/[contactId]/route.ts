import { NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cal/[campaignSlug]/[contactId]
 *
 * Public redirect endpoint. Embedded in SendPilot sequences.
 * Resolves the pre-candidate and redirects to the recruiter's Cal.com booking URL
 * with the candidate's LinkedIn URL pre-filled.
 *
 * Fallback: if the pre-candidate is not found yet (race with SP webhook),
 * redirects to Cal.com without prefill using the campaign's default recruiter.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ campaignSlug: string; contactId: string }> }
) {
  const { campaignSlug, contactId } = await context.params
  const supabase = ensureAdminClient()

  // Resolve campaign by slug (derived from its sendpilot_campaign_id or nombre)
  // We use sendpilot_campaign_id as slug for simplicity
  const { data: campana } = await supabase
    .from('sp_campanas')
    .select('id, calcom_linkedin_identifier')
    .eq('sendpilot_campaign_id', campaignSlug)
    .maybeSingle()

  if (!campana) {
    return new Response('Campaña no encontrada', { status: 404 })
  }

  // Try to find pre-candidate:
  // 1. By UUID (used in auto-reply from webhook)
  // 2. By linkedin_slug (used when SP injects {{linkedinIdentifier}} merge tag)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId)
  const decodedId = decodeURIComponent(contactId)

  let precandidato: { id: string; linkedin_url: string | null; reclutador_id: string | null; campana_id: string } | null = null

  if (isUuid) {
    const { data } = await supabase
      .from('sp_precandidatos')
      .select('id, linkedin_url, reclutador_id, campana_id')
      .eq('id', decodedId)
      .eq('campana_id', campana.id)
      .maybeSingle()
    precandidato = data
  } else {
    // Extract slug from a full LinkedIn URL or use the raw value as slug
    let slug = decodedId
    try {
      const u = new URL(decodedId.startsWith('http') ? decodedId : `https://www.linkedin.com/in/${decodedId}`)
      slug = u.pathname.replace(/^\/in\//, '').split('?')[0].toLowerCase()
    } catch { /* use raw value */ }

    const { data } = await supabase
      .from('sp_precandidatos')
      .select('id, linkedin_url, reclutador_id, campana_id')
      .eq('campana_id', campana.id)
      .ilike('linkedin_slug', slug)
      .maybeSingle()
    precandidato = data
  }

  // Determine the recruiter: either the one assigned to this pre-candidate,
  // or fall back to the first active recruiter in the campaign
  let reclutadorId: string | null = precandidato?.reclutador_id ?? null

  if (!reclutadorId) {
    const { data: rec } = await supabase
      .from('sp_campana_reclutadores')
      .select('reclutador_id')
      .eq('campana_id', campana.id)
      .eq('activo', true)
      .limit(1)
      .maybeSingle()
    reclutadorId = rec?.reclutador_id ?? null
  }

  if (!reclutadorId) {
    return new Response('Sin reclutador asignado a esta campaña', { status: 503 })
  }

  // Get recruiter's Cal.com scheduling URL + event type for this campaign
  const { data: asignacion } = await supabase
    .from('sp_campana_reclutadores')
    .select('calcom_scheduling_url, calcom_event_type_id')
    .eq('campana_id', campana.id)
    .eq('reclutador_id', reclutadorId)
    .maybeSingle()

  let calUrl = asignacion?.calcom_scheduling_url

  if (!calUrl) {
    // Fallback: build from Cal.com username in tokens_integracion.meta
    const { data: tokenRow } = await supabase
      .from('tokens_integracion')
      .select('meta')
      .eq('usuario_id', reclutadorId)
      .eq('proveedor', 'calcom')
      .maybeSingle()
    const meta = tokenRow?.meta as Record<string, unknown> | null
    const username = meta?.username as string | null
    if (username) {
      calUrl = `https://cal.com/${username}`
    }
  }

  if (!calUrl) {
    return new Response('URL de Cal.com no configurada para este reclutador', { status: 503 })
  }

  // Build the final Cal.com URL with optional LinkedIn prefill
  const finalUrl = new URL(calUrl)
  if (precandidato?.linkedin_url) {
    const identifier = campana.calcom_linkedin_identifier ?? 'LinkedIn'
    finalUrl.searchParams.set(identifier, precandidato.linkedin_url)
  }

  return NextResponse.redirect(finalUrl.toString(), { status: 302 })
}
