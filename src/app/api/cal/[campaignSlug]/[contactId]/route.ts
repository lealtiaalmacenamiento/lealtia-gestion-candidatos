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
  // 3. By sp_contact_id (used when cron builds cal_url with the internal SP id)
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

    // Try by linkedin_slug first
    const { data: bySlug } = await supabase
      .from('sp_precandidatos')
      .select('id, linkedin_url, reclutador_id, campana_id')
      .eq('campana_id', campana.id)
      .ilike('linkedin_slug', slug)
      .maybeSingle()
    precandidato = bySlug

    // Fallback: search by sp_contact_id (cron builds cal_url with internal SP id)
    if (!precandidato) {
      const { data: bySpId } = await supabase
        .from('sp_precandidatos')
        .select('id, linkedin_url, reclutador_id, campana_id')
        .eq('campana_id', campana.id)
        .eq('sp_contact_id', decodedId)
        .maybeSingle()
      precandidato = bySpId
    }
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
    // Extra diagnostics to help identify the configuration gap
    const { data: anyRec } = await supabase
      .from('sp_campana_reclutadores')
      .select('reclutador_id, activo')
      .eq('campana_id', campana.id)
      .limit(5)
    const precandidatoFound = !!precandidato
    const msg = [
      `Sin reclutador asignado a esta campaña (id: ${campana.id})`,
      `precandidato encontrado: ${precandidatoFound}`,
      precandidato ? `precandidato.reclutador_id: ${precandidato.reclutador_id ?? 'null'}` : '',
      `filas en sp_campana_reclutadores: ${anyRec?.length ?? 0}`,
      anyRec?.length ? `(activo: ${anyRec.map(r => r.activo).join(', ')})` : '— tabla vacía para esta campaña',
    ].filter(Boolean).join(' | ')
    return new Response(msg, { status: 503 })
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

  // Build the final Cal.com URL with LinkedIn prefill
  // The field identifier is case-sensitive in Cal.com — use it exactly as stored.
  // Default 'LinkedIn' matches the confirmed identifier for edgar-zamarripa and paola-pecina.
  const finalUrl = new URL(calUrl)
  const fieldKey = campana.calcom_linkedin_identifier ?? 'LinkedIn'

  // Prefer the stored linkedin_url; fallback to reconstructing from the contactId in the URL
  const linkedinValue = precandidato?.linkedin_url
    ?? (isUuid ? null : `https://www.linkedin.com/in/${decodedId.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '')}`)

  if (linkedinValue) {
    finalUrl.searchParams.set(fieldKey, linkedinValue)
  }

  return NextResponse.redirect(finalUrl.toString(), { status: 302 })
}
