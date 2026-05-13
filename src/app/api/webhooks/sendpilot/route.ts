import { ensureAdminClient } from '@/lib/supabaseAdmin'
import {
  verifySendPilotSignature,
  getSendPilotWebhookSecret,
  parseSpLinkedinUrl,
  replyToThread
} from '@/lib/integrations/sendpilot'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// SP lead status value configured in the campaign to represent "link sent"
const LINK_ENVIADO_STATUS = process.env.SP_LINK_ENVIADO_STATUS ?? 'link_enviado'

export async function POST(req: Request) {
  const rawBody = await req.text()

  // 1. Retrieve org-level webhook secret
  const webhookSecret = await getSendPilotWebhookSecret()
  if (!webhookSecret) {
    // SP is not configured at all — accept silently so SP doesn't retry
    return new Response('ok', { status: 200 })
  }

  // 2. Verify signature
  const signatureHeader = req.headers.get('Webhook-Signature') ?? ''
  if (!verifySendPilotSignature(rawBody, signatureHeader, webhookSecret)) {
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const eventId = payload.eventId as string | undefined
  const eventType = payload.eventType as string | undefined

  if (!eventType) return new Response('ok', { status: 200 })

  const supabase = ensureAdminClient()

  // 3. Idempotency check — reject duplicates using sendpilot_event_id
  if (eventId) {
    const { data: existing } = await supabase
      .from('sp_actividades')
      .select('id')
      .eq('sendpilot_event_id', eventId)
      .maybeSingle()
    if (existing) return new Response('ok', { status: 200 })
  }

  const data = (payload.data ?? {}) as Record<string, unknown>

  try {
    await handleEvent(supabase, eventType, eventId ?? null, data)
  } catch (err) {
    console.error('[webhook/sendpilot] Error handling event', { eventType, eventId, err })
    // Return 200 to prevent SP from retrying — log the error internally
  }

  return new Response('ok', { status: 200 })
}

async function handleEvent(
  supabase: ReturnType<typeof ensureAdminClient>,
  eventType: string,
  eventId: string | null,
  data: Record<string, unknown>
) {
  switch (eventType) {
    case 'connection.sent':
      await handleConnectionSent(supabase, eventId, data)
      break
    case 'connection.accepted':
    case 'message.received':
      await handleContactResponded(supabase, eventId, eventType, data)
      break
    case 'message.sent':
      await handleMessageSent(supabase, eventId, data)
      break
    case 'lead.status.changed':
      await handleLeadStatusChanged(supabase, eventId, data)
      break
    case 'campaign.started':
      await handleCampaignStarted(supabase, data)
      break
    case 'campaign.paused':
      await handleCampaignStateChange(supabase, data, 'pausada')
      break
    case 'campaign.resumed':
      await handleCampaignStateChange(supabase, data, 'activa')
      break
    default:
      // Unknown event — no-op but do not throw so idempotency record is still created
      break
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleConnectionSent(
  supabase: ReturnType<typeof ensureAdminClient>,
  eventId: string | null,
  data: Record<string, unknown>
) {
  const spCampaignId = (data.campaignId ?? data.campaign_id) as string | undefined
  const spContactId = (data.contactId ?? data.leadId ?? data.id) as string | undefined
  const rawLinkedinUrl = (data.linkedinUrl ?? data.linkedin_url ?? data.profileUrl) as string | undefined
  const firstName = (data.firstName ?? data.first_name ?? '') as string
  const lastName = (data.lastName ?? data.last_name ?? '') as string
  const company = (data.company ?? data.companyName ?? '') as string
  const title = (data.title ?? data.jobTitle ?? '') as string

  if (!spCampaignId) return

  // Resolve campaign by SP campaign ID
  const { data: campana } = await supabase
    .from('sp_campanas')
    .select('id')
    .eq('sendpilot_campaign_id', spCampaignId)
    .maybeSingle()
  if (!campana) return

  const campanaId = campana.id

  // Parse LinkedIn identifiers
  const parsed = rawLinkedinUrl
    ? parseSpLinkedinUrl(rawLinkedinUrl)
    : { linkedin_url: null, linkedin_urn: null, linkedin_slug: null }

  // Check for existing pre-candidate (idempotent by sp_contact_id)
  let precandidatoId: string | null = null
  if (spContactId) {
    const { data: existing } = await supabase
      .from('sp_precandidatos')
      .select('id')
      .eq('sp_contact_id', spContactId)
      .eq('campana_id', campanaId)
      .maybeSingle()
    if (existing) {
      precandidatoId = existing.id
    }
  }

  if (!precandidatoId) {
    // Round-robin recruiter assignment
    const reclutadorId = await assignReclutador(supabase, campanaId)

    const { data: nuevo, error } = await supabase
      .from('sp_precandidatos')
      .insert({
        campana_id: campanaId,
        reclutador_id: reclutadorId,
        sp_contact_id: spContactId ?? null,
        nombre: firstName || 'Desconocido',
        apellido: lastName || null,
        linkedin_url: parsed.linkedin_url,
        linkedin_urn: parsed.linkedin_urn,
        linkedin_slug: parsed.linkedin_slug,
        empresa: company || null,
        cargo: title || null,
        estado: 'en_secuencia'
      })
      .select('id')
      .single()

    if (error) throw error
    precandidatoId = nuevo.id
  }

  if (!precandidatoId) return  // should not happen; guards against TypeScript null

  await insertActividad(supabase, precandidatoId, campanaId, eventId, 'sp_conexion_enviada', {
    sp_contact_id: spContactId,
    linkedin_url: parsed.linkedin_url
  })
}

async function handleContactResponded(
  supabase: ReturnType<typeof ensureAdminClient>,
  eventId: string | null,
  eventType: string,
  data: Record<string, unknown>
) {
  const spContactId = (data.contactId ?? data.leadId ?? data.id) as string | undefined
  if (!spContactId) return

  const { data: precandidato } = await supabase
    .from('sp_precandidatos')
    .select('id, campana_id, estado, nombre, reclutador_id')
    .eq('sp_contact_id', spContactId)
    .maybeSingle()
  if (!precandidato) return

  // Only advance state — never go backwards
  const estadosOrden = ['en_secuencia', 'respondio', 'link_enviado', 'cita_agendada', 'promovido']
  const currentIdx = estadosOrden.indexOf(precandidato.estado)
  if (currentIdx < estadosOrden.indexOf('respondio')) {
    await supabase
      .from('sp_precandidatos')
      .update({ estado: 'respondio', updated_at: new Date().toISOString() })
      .eq('id', precandidato.id)
  }

  const tipo = eventType === 'connection.accepted' ? 'sp_conexion_aceptada' : 'sp_mensaje_recibido'
  const email = (data.email ?? null) as string | null
  if (email) {
    await supabase
      .from('sp_precandidatos')
      .update({ email, updated_at: new Date().toISOString() })
      .eq('id', precandidato.id)
  }

  await insertActividad(supabase, precandidato.id, precandidato.campana_id, eventId, tipo, data)

  // Auto-reply with Cal.com link when a lead replies to Message #1
  // Only fires on first inbound message while state was 'en_secuencia'
  // Requires: threadId in payload, APP_URL configured, precandidato has a campaign
  if (
    eventType === 'message.received' &&
    currentIdx <= estadosOrden.indexOf('en_secuencia') &&
    APP_URL
  ) {
    const threadId = (data.threadId ?? data.thread_id ?? spContactId) as string

    // Get the campaign's sendpilot_campaign_id for the redirect URL
    const { data: campana } = await supabase
      .from('sp_campanas')
      .select('sendpilot_campaign_id')
      .eq('id', precandidato.campana_id)
      .maybeSingle()

    if (campana?.sendpilot_campaign_id) {
      const calLink = `${APP_URL}/api/cal/${campana.sendpilot_campaign_id}/${precandidato.id}`
      const nombre = (precandidato.nombre ?? '').split(' ')[0] || ''
      const message = `¡Qué bueno conectar${ nombre ? `, ${nombre}` : ''}! Te comparto mi agenda para que elijas el horario que más te convenga:\n\n${calLink}\n\nSon 20 minutos, sin compromiso. Tú decides.`

      await replyToThread(threadId, message).catch(err =>
        console.error('[webhook/sendpilot] Auto-reply failed', { threadId, err })
      )

      // Mark as link_enviado since we just sent the link
      await supabase
        .from('sp_precandidatos')
        .update({ estado: 'link_enviado', updated_at: new Date().toISOString() })
        .eq('id', precandidato.id)

      await insertActividad(supabase, precandidato.id, precandidato.campana_id, null, 'sp_link_enviado', {
        auto_reply: true,
        cal_link: calLink
      })
    }
  }
}

async function handleMessageSent(
  supabase: ReturnType<typeof ensureAdminClient>,
  eventId: string | null,
  data: Record<string, unknown>
) {
  const spContactId = (data.contactId ?? data.leadId) as string | undefined
  if (!spContactId) return

  const { data: precandidato } = await supabase
    .from('sp_precandidatos')
    .select('id, campana_id')
    .eq('sp_contact_id', spContactId)
    .maybeSingle()
  if (!precandidato) return

  await insertActividad(supabase, precandidato.id, precandidato.campana_id, eventId, 'sp_mensaje_enviado', data)
}

async function handleLeadStatusChanged(
  supabase: ReturnType<typeof ensureAdminClient>,
  eventId: string | null,
  data: Record<string, unknown>
) {
  const spContactId = (data.contactId ?? data.leadId) as string | undefined
  const newStatus = (data.status ?? data.newStatus) as string | undefined
  if (!spContactId || !newStatus) return

  const { data: precandidato } = await supabase
    .from('sp_precandidatos')
    .select('id, campana_id, estado')
    .eq('sp_contact_id', spContactId)
    .maybeSingle()
  if (!precandidato) return

  let newEstado: string | null = null
  if (newStatus.toLowerCase() === LINK_ENVIADO_STATUS.toLowerCase()) {
    newEstado = 'link_enviado'
  } else if (newStatus.toLowerCase() === 'not_interested' || newStatus.toLowerCase() === 'not interested') {
    newEstado = 'descartado'
  }

  if (newEstado) {
    await supabase
      .from('sp_precandidatos')
      .update({ estado: newEstado, updated_at: new Date().toISOString() })
      .eq('id', precandidato.id)
  }

  await insertActividad(supabase, precandidato.id, precandidato.campana_id, eventId, 'sp_estado_cambiado', {
    old_status: precandidato.estado,
    new_status: newStatus,
    mapped_to: newEstado
  })
}

async function handleCampaignStarted(
  supabase: ReturnType<typeof ensureAdminClient>,
  data: Record<string, unknown>
) {
  const spCampaignId = (data.campaignId ?? data.id) as string | undefined
  const nombre = (data.name ?? data.campaignName ?? spCampaignId) as string | undefined
  if (!spCampaignId) return

  // Upsert the campaign record
  await supabase
    .from('sp_campanas')
    .upsert(
      { sendpilot_campaign_id: spCampaignId, nombre: nombre ?? spCampaignId, estado: 'activa' },
      { onConflict: 'sendpilot_campaign_id', ignoreDuplicates: false }
    )
}

async function handleCampaignStateChange(
  supabase: ReturnType<typeof ensureAdminClient>,
  data: Record<string, unknown>,
  estado: 'activa' | 'pausada'
) {
  const spCampaignId = (data.campaignId ?? data.id) as string | undefined
  if (!spCampaignId) return
  await supabase
    .from('sp_campanas')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('sendpilot_campaign_id', spCampaignId)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assignReclutador(
  supabase: ReturnType<typeof ensureAdminClient>,
  campanaId: string
): Promise<string | null> {
  const { data: reclutadores } = await supabase
    .from('sp_campana_reclutadores')
    .select('reclutador_id')
    .eq('campana_id', campanaId)
    .eq('activo', true)

  if (!reclutadores || reclutadores.length === 0) return null

  // Count active pre-candidates per recruiter
  const counts = await Promise.all(
    reclutadores.map(async (r) => {
      const { count } = await supabase
        .from('sp_precandidatos')
        .select('*', { count: 'exact', head: true })
        .eq('reclutador_id', r.reclutador_id)
        .not('estado', 'in', '("promovido","descartado")')
      return { reclutadorId: r.reclutador_id, count: count ?? 0 }
    })
  )

  // Pick the one with the lowest count (round-robin)
  counts.sort((a, b) => a.count - b.count)
  return counts[0]?.reclutadorId ?? null
}

async function insertActividad(
  supabase: ReturnType<typeof ensureAdminClient>,
  precandidatoId: string,
  campanaId: string | null,
  eventId: string | null,
  tipo: string,
  metadata: Record<string, unknown>
) {
  await supabase.from('sp_actividades').insert({
    precandidato_id: precandidatoId,
    campana_id: campanaId,
    tipo,
    sendpilot_event_id: eventId,
    metadata
  })
}
