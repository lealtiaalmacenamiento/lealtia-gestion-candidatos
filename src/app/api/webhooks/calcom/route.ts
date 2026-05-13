import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { verifyCalcomSignature } from '@/lib/integrations/calcom'
import { normalizeLinkedInSlug } from '@/lib/integrations/sendpilot'
import { sendMail } from '@/lib/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('x-cal-signature-256')

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const triggerEvent = payload.triggerEvent as string | undefined
  if (!triggerEvent) return new Response('ok', { status: 200 })

  const supabase = ensureAdminClient()

  // Step 1: Resolve organizer by email (guaranteed field in Cal.com Person structure)
  const organizerEmail = (
    (payload.organizer as Record<string, unknown> | undefined)?.email
  ) as string | undefined

  if (!organizerEmail) return new Response('ok', { status: 200 })

  const { data: tokenRow } = await supabase
    .from('tokens_integracion')
    .select('usuario_id, access_token, meta')
    .eq('proveedor', 'calcom')
    .filter('meta->>organizer_email', 'eq', organizerEmail)
    .maybeSingle()

  if (!tokenRow) {
    // Unknown organizer — respond 200 (no info leakage)
    return new Response('ok', { status: 200 })
  }

  // Step 2: Verify HMAC with this organizer's webhook_secret
  const meta = tokenRow.meta as Record<string, unknown>
  const webhookSecret = meta?.webhook_secret as string | undefined
  if (!webhookSecret || !verifyCalcomSignature(rawBody, signatureHeader, webhookSecret)) {
    // Invalid signature — always 200 to avoid info leakage (logged internally)
    console.warn('[webhook/calcom] Invalid signature for organizer', organizerEmail)
    return new Response('ok', { status: 200 })
  }

  const reclutadorAuthId = tokenRow.usuario_id

  try {
    if (triggerEvent === 'BOOKING_CREATED') {
      await handleBookingCreated(supabase, payload, reclutadorAuthId)
    } else if (triggerEvent === 'BOOKING_CANCELLED') {
      await handleBookingCancelled(supabase, payload)
    } else if (triggerEvent === 'BOOKING_RESCHEDULED') {
      await handleBookingRescheduled(supabase, payload)
    }
  } catch (err) {
    console.error('[webhook/calcom] Error handling event', { triggerEvent, err })
  }

  return new Response('ok', { status: 200 })
}

// ---------------------------------------------------------------------------
// BOOKING_CREATED — 3-step cascade
// ---------------------------------------------------------------------------

async function handleBookingCreated(
  supabase: ReturnType<typeof ensureAdminClient>,
  payload: Record<string, unknown>,
  reclutadorAuthId: string
) {
  const eventTypeId: number | undefined =
    (payload.eventTypeId as number | undefined) ??
    ((payload.eventType as Record<string, unknown> | undefined)?.id as number | undefined)

  const bookingUid: string =
    (payload.uid as string) ?? (payload.bookingUid as string) ?? ''

  const inicio: string = payload.startTime as string ?? ''
  const fin: string = payload.endTime as string ?? ''
  const videoCallUrl: string | null = (payload.videoCallUrl as string) ?? null

  const attendee = (payload.attendees as Record<string, unknown>[] | undefined)?.[0]
  const attendeeEmail: string | null = (attendee?.email as string) ?? null

  if (!bookingUid) return

  // Step 1: Does eventTypeId belong to an active SP campaign assigned to this recruiter?
  let asignacion: { campana_id: string; calcom_linkedin_identifier: string } | null = null

  if (eventTypeId) {
    const { data } = await supabase
      .from('sp_campana_reclutadores')
      .select('campana_id, sp_campanas!inner(calcom_linkedin_identifier)')
      .eq('reclutador_id', reclutadorAuthId)
      .eq('calcom_event_type_id', eventTypeId)
      .eq('activo', true)
      .maybeSingle()

    if (data) {
      const spCampanasResult = data.sp_campanas as unknown as { calcom_linkedin_identifier: string }[] | { calcom_linkedin_identifier: string } | null
      const campanaRow = Array.isArray(spCampanasResult) ? spCampanasResult[0] : spCampanasResult
      asignacion = {
        campana_id: data.campana_id as string,
        calcom_linkedin_identifier: campanaRow?.calcom_linkedin_identifier ?? 'LinkedIn'
      }
    }
  }

  if (!asignacion) {
    // Regular personal booking — create sp_citas with no campaign link
    await upsertSpCita(supabase, {
      reclutador_id: reclutadorAuthId,
      calcom_booking_uid: bookingUid,
      inicio,
      fin,
      meeting_url: videoCallUrl
    })
    return
  }

  // Step 2: Extract linkedin_url from booking responses using the campaign's identifier
  const responses =
    (payload.responses as Record<string, unknown>) ??
    (payload.bookingFieldsResponses as Record<string, unknown>) ??
    {}
  const linkedinRaw = extractLinkedinFromResponses(responses, asignacion.calcom_linkedin_identifier)
  const linkedinSlug = normalizeLinkedInSlug(linkedinRaw)

  if (!linkedinSlug) {
    // Organic booking from SP event type but no LinkedIn prefill
    await upsertSpCita(supabase, {
      reclutador_id: reclutadorAuthId,
      campana_id: asignacion.campana_id,
      calcom_booking_uid: bookingUid,
      inicio,
      fin,
      meeting_url: videoCallUrl
    })
    return
  }

  // Step 3: Find pre-candidate by slug + campaign
  const { data: precandidato } = await supabase
    .from('sp_precandidatos')
    .select('id, nombre, apellido, estado')
    .eq('campana_id', asignacion.campana_id)
    .ilike('linkedin_slug', linkedinSlug)
    .maybeSingle()

  await upsertSpCita(supabase, {
    reclutador_id: reclutadorAuthId,
    campana_id: asignacion.campana_id,
    precandidato_id: precandidato?.id ?? null,
    calcom_booking_uid: bookingUid,
    inicio,
    fin,
    meeting_url: videoCallUrl
  })

  if (precandidato) {
    // Update pre-candidate state and booking UID
    await supabase
      .from('sp_precandidatos')
      .update({
        estado: 'cita_agendada',
        calcom_booking_uid: bookingUid,
        email: precandidato ? (attendeeEmail ?? undefined) : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', precandidato.id)

    await supabase.from('sp_actividades').insert({
      precandidato_id: precandidato.id,
      campana_id: asignacion.campana_id,
      tipo: 'cita_agendada',
      metadata: {
        calcom_booking_uid: bookingUid,
        inicio,
        fin,
        attendee_email: attendeeEmail
      }
    })

    // Notify recruiter: in-app + email
    await notifyReclutador(supabase, reclutadorAuthId, precandidato, bookingUid, inicio)
  }
}

// ---------------------------------------------------------------------------
// BOOKING_CANCELLED
// ---------------------------------------------------------------------------

async function handleBookingCancelled(
  supabase: ReturnType<typeof ensureAdminClient>,
  payload: Record<string, unknown>
) {
  const bookingUid = (payload.uid ?? payload.bookingUid) as string | undefined
  if (!bookingUid) return

  const { data: cita } = await supabase
    .from('sp_citas')
    .select('id, precandidato_id, campana_id')
    .eq('calcom_booking_uid', bookingUid)
    .maybeSingle()

  if (!cita) return

  await supabase
    .from('sp_citas')
    .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
    .eq('id', cita.id)

  if (cita.precandidato_id) {
    // Revert state to link_enviado (they did click the link; SP can follow up)
    await supabase
      .from('sp_precandidatos')
      .update({ estado: 'link_enviado', calcom_booking_uid: null, updated_at: new Date().toISOString() })
      .eq('id', cita.precandidato_id)

    await supabase.from('sp_actividades').insert({
      precandidato_id: cita.precandidato_id,
      campana_id: cita.campana_id,
      tipo: 'cita_cancelada',
      metadata: { calcom_booking_uid: bookingUid }
    })
  }
}

// ---------------------------------------------------------------------------
// BOOKING_RESCHEDULED
// ---------------------------------------------------------------------------

async function handleBookingRescheduled(
  supabase: ReturnType<typeof ensureAdminClient>,
  payload: Record<string, unknown>
) {
  const oldUid = (payload.uid ?? payload.bookingUid) as string | undefined
  const newUid = (payload.rescheduledToUid as string) ?? oldUid
  if (!oldUid) return

  const newStart = payload.startTime as string | undefined
  const newEnd = payload.endTime as string | undefined
  const videoCallUrl = (payload.videoCallUrl as string) ?? null

  const { data: cita } = await supabase
    .from('sp_citas')
    .select('id, precandidato_id, campana_id')
    .eq('calcom_booking_uid', oldUid)
    .maybeSingle()

  if (!cita) return

  await supabase.from('sp_citas').update({
    calcom_booking_uid: newUid ?? oldUid,
    inicio: newStart ?? undefined,
    fin: newEnd ?? undefined,
    meeting_url: videoCallUrl,
    updated_at: new Date().toISOString()
  }).eq('id', cita.id)

  if (cita.precandidato_id && newUid && newUid !== oldUid) {
    await supabase
      .from('sp_precandidatos')
      .update({ calcom_booking_uid: newUid, updated_at: new Date().toISOString() })
      .eq('id', cita.precandidato_id)
  }

  if (cita.precandidato_id) {
    await supabase.from('sp_actividades').insert({
      precandidato_id: cita.precandidato_id,
      campana_id: cita.campana_id,
      tipo: 'cita_reprogramada',
      metadata: { old_uid: oldUid, new_uid: newUid, new_start: newStart }
    })
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractLinkedinFromResponses(
  responses: Record<string, unknown>,
  identifier: string
): string | null {
  // Cal.com can return responses in different structures across versions
  const tryKeys = [identifier, identifier.toLowerCase(), 'linkedin', 'linkedinUrl', 'linkedin_url']
  for (const key of tryKeys) {
    const val = responses[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
    if (val && typeof val === 'object') {
      const inner = (val as Record<string, unknown>).value ?? (val as Record<string, unknown>).answer
      if (typeof inner === 'string' && inner.trim()) return inner.trim()
    }
  }
  return null
}

async function upsertSpCita(
  supabase: ReturnType<typeof ensureAdminClient>,
  data: {
    reclutador_id: string
    campana_id?: string | null
    precandidato_id?: string | null
    calcom_booking_uid: string
    inicio: string
    fin: string
    meeting_url?: string | null
  }
): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('sp_citas')
    .upsert(
      {
        reclutador_id: data.reclutador_id,
        campana_id: data.campana_id ?? null,
        precandidato_id: data.precandidato_id ?? null,
        calcom_booking_uid: data.calcom_booking_uid,
        inicio: data.inicio,
        fin: data.fin,
        meeting_url: data.meeting_url ?? null
      },
      { onConflict: 'calcom_booking_uid', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (error) throw error
  return row?.id ?? null
}

async function notifyReclutador(
  supabase: ReturnType<typeof ensureAdminClient>,
  reclutadorAuthId: string,
  precandidato: { nombre: string; apellido?: string | null },
  bookingUid: string,
  inicio: string
) {
  const nombre = [precandidato.nombre, precandidato.apellido].filter(Boolean).join(' ')
  const fecha = new Date(inicio).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'medium',
    timeStyle: 'short'
  })

  // In-app notification
  try {
    await supabase.from('notificaciones').insert({
      usuario_id: reclutadorAuthId,
      tipo: 'sistema',
      titulo: 'Cita agendada',
      mensaje: `${nombre} agendó una cita para el ${fecha}`,
      metadata: { tipo: 'sp_cita_agendada', calcom_booking_uid: bookingUid }
    })
  } catch { /* notification failures are non-critical */ }

  // Email: get recruiter email from usuarios table
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('email, nombre')
    .eq('id_auth', reclutadorAuthId)
    .maybeSingle()

  if (usuario?.email) {
    await sendMail({
      to: usuario.email,
      subject: `Nueva cita agendada: ${nombre}`,
      html: `
        <p>Hola ${usuario.nombre ?? ''},</p>
        <p><strong>${nombre}</strong> ha agendado una cita contigo para el <strong>${fecha}</strong>.</p>
        <p>Revisa el CRM para ver los detalles del pre-candidato.</p>
      `
    }).catch(() => {})
  }
}
