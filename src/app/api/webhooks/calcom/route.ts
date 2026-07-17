import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { verifyCalcomSignature } from '@/lib/integrations/calcom'
import { normalizeLinkedInSlug, updateLeadStatus } from '@/lib/integrations/sendpilot'
import { sendMail } from '@/lib/mailer'
import {
  detachPlanificacionSpCita,
  detachPlanificacionCita,
  syncPlanificacionCita,
  syncPlanificacionSpCita
} from '@/app/api/agenda/citas/planificacionSync'
import { cancelAgendaCitaCascade } from '@/app/api/agenda/citas/cancel/cascade'
import { notifyAgendaCitaEvent } from '@/lib/agendaNotifications'
import { syncQuestionnaireBooking } from '@/lib/questionnaireBookingSync'

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
  const eventPayload =
    payload.payload && typeof payload.payload === 'object'
      ? payload.payload as Record<string, unknown>
      : payload

  const supabase = ensureAdminClient()

  // Step 1: Resolve organizer by email (guaranteed field in Cal.com Person structure)
  const organizerEmail = (
    (eventPayload.organizer as Record<string, unknown> | undefined)?.email
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
  await logCalcomWebhookEvent(supabase, {
    triggerEvent,
    payload: eventPayload,
    organizerEmail,
    usuarioId: reclutadorAuthId
  }).catch(() => {})

  try {
    if (triggerEvent === 'BOOKING_CREATED') {
      await handleBookingCreated(supabase, eventPayload, reclutadorAuthId)
    } else if (triggerEvent === 'BOOKING_CANCELLED') {
      await handleBookingCancelled(supabase, eventPayload)
    } else if (triggerEvent === 'BOOKING_RESCHEDULED') {
      await handleBookingRescheduled(supabase, eventPayload)
    }
  } catch (err) {
    console.error('[webhook/calcom] Error handling event', { triggerEvent, err })
    return new Response('retry', { status: 500 })
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
  const videoCallData = payload.videoCallData as Record<string, unknown> | undefined
  const metadata = payload.metadata as Record<string, unknown> | undefined
  const videoCallUrl: string | null =
    (payload.videoCallUrl as string) ??
    (videoCallData?.url as string) ??
    (metadata?.videoCallUrl as string) ??
    null

  const attendee = (payload.attendees as Record<string, unknown>[] | undefined)?.[0]
  const attendeeEmail: string | null = (attendee?.email as string) ?? null

  if (!bookingUid) return

  const lealtiaSubmissionId = typeof metadata?.lealtiaSubmissionId === 'string'
    ? metadata.lealtiaSubmissionId
    : null
  const lealtiaProspectoId = metadata?.lealtiaProspectoId
    ? Number(metadata.lealtiaProspectoId)
    : null

  if (lealtiaSubmissionId || (lealtiaProspectoId && Number.isFinite(lealtiaProspectoId))) {
    await syncLealtiaCrmBooking(supabase, {
      bookingUid,
      reclutadorAuthId,
      submissionId: lealtiaSubmissionId,
      prospectoId: lealtiaProspectoId && Number.isFinite(lealtiaProspectoId) ? lealtiaProspectoId : null,
      inicio,
      fin,
      meetingUrl: videoCallUrl
    })
    return
  }

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

  const spCitaId = await upsertSpCita(supabase, {
    reclutador_id: reclutadorAuthId,
    campana_id: asignacion.campana_id,
    precandidato_id: precandidato?.id ?? null,
    calcom_booking_uid: bookingUid,
    inicio,
    fin,
    meeting_url: videoCallUrl
  })

  // Sync to planificacion semanal
  if (spCitaId) {
    const nombre = precandidato
      ? [precandidato.nombre, precandidato.apellido].filter(Boolean).join(' ')
      : null
    await syncPlanificacionSpCita({
      supabase,
      reclutadorAuthId,
      inicioIso: inicio,
      precandidatoNombre: nombre,
      spCitaId
    }).catch(() => {})
  }

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

    // Discard duplicate records of the same person in other campaigns.
    // Preserves history — marks as 'descartado' rather than deleting.
    if (linkedinSlug) {
      const { data: otrosDuplicados } = await supabase
        .from('sp_precandidatos')
        .select('id, campana_id')
        .eq('linkedin_slug', linkedinSlug)
        .neq('id', precandidato.id)
        .not('estado', 'in', '("promovido","descartado")')

      if (otrosDuplicados?.length) {
        const ids = otrosDuplicados.map(r => r.id)
        await supabase
          .from('sp_precandidatos')
          .update({ estado: 'descartado', updated_at: new Date().toISOString() })
          .in('id', ids)

        await supabase.from('sp_actividades').insert(
          otrosDuplicados.map(r => ({
            precandidato_id: r.id,
            campana_id: r.campana_id,
            tipo: 'sp_estado_cambiado',
            metadata: {
              old_status: null,
              new_status: 'descartado',
              razon: 'agendo_otra_campana',
              campana_activa_id: asignacion!.campana_id
            }
          }))
        )
      }
    }

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
  const bookingUidCandidates = calcomBookingUidCandidates(payload)
  const metadata = payload.metadata as Record<string, unknown> | undefined
  const lealtiaSubmissionId = typeof metadata?.lealtiaSubmissionId === 'string'
    ? metadata.lealtiaSubmissionId
    : null
  if (lealtiaSubmissionId) {
    const { data: submission } = await supabase
      .from('questionnaire_submissions')
      .select('cal_booking_uid')
      .eq('id', lealtiaSubmissionId)
      .maybeSingle()
    if (submission?.cal_booking_uid) {
      bookingUidCandidates.push(String(submission.cal_booking_uid))
    }
  }

  const candidateUids = uniqueStrings(bookingUidCandidates)
  if (!candidateUids.length) return
  const bookingUid = candidateUids[0]

  const { data: regularCitas } = await supabase
    .from('citas')
    .select('id,external_event_id,estado,updated_at')
    .in('external_event_id', candidateUids)
    .neq('estado', 'cancelada')
    .order('updated_at', { ascending: false })
    .limit(1)
  const regularCita = regularCitas?.[0]
  if (regularCita?.id) {
    await cancelAgendaCitaCascade({
      citaId: Number(regularCita.id),
      actor: null,
      origin: 'calendar',
      supabase,
      skipRemote: true
    })
    await supabase
      .from('questionnaire_submissions')
      .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
      .in('cal_booking_uid', candidateUids)
    return
  }

  await supabase
    .from('questionnaire_submissions')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .in('cal_booking_uid', candidateUids)

  const { data: citas } = await supabase
    .from('sp_citas')
    .select('id, precandidato_id, campana_id')
    .in('calcom_booking_uid', candidateUids)
    .neq('estado', 'cancelada')
    .order('updated_at', { ascending: false })
    .limit(1)
  const cita = citas?.[0]

  if (!cita) return

  await supabase
    .from('sp_citas')
    .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
    .eq('id', cita.id)

  await detachPlanificacionSpCita({
    supabase,
    spCitaId: String(cita.id)
  }).catch(() => {})

  if (cita.precandidato_id) {
    // Fetch current precandidato state — we need it to decide what to do
    const { data: pre } = await supabase
      .from('sp_precandidatos')
      .select('estado, sp_contact_id')
      .eq('id', cita.precandidato_id)
      .maybeSingle()

    // Check if there are other future confirmed citas remaining
    const { data: remaining } = await supabase
      .from('sp_citas')
      .select('id, calcom_booking_uid, inicio')
      .eq('precandidato_id', cita.precandidato_id)
      .eq('estado', 'confirmada')
      .neq('id', cita.id)
      .gt('inicio', new Date().toISOString())   // only future citas count
      .order('inicio', { ascending: true })
      .limit(1)

    const hasFutureCitas = (remaining?.length ?? 0) > 0

    if (hasFutureCitas) {
      // Still has a future cita — always safe to just update the booking uid pointer
      await supabase
        .from('sp_precandidatos')
        .update({
          calcom_booking_uid: remaining![0].calcom_booking_uid,
          updated_at: new Date().toISOString()
        })
        .eq('id', cita.precandidato_id)
    } else if (pre?.estado === 'cita_agendada') {
      // No future citas AND still in cita_agendada → revert so SP can follow up
      await supabase
        .from('sp_precandidatos')
        .update({ estado: 'link_enviado', calcom_booking_uid: null, updated_at: new Date().toISOString() })
        .eq('id', cita.precandidato_id)
      // Sync revert back to SP (best-effort)
      if (pre.sp_contact_id) {
        updateLeadStatus(pre.sp_contact_id as string, 'Meeting booked').catch(() => {})
      }
    } else {
      // State is promovido, descartado, or manually changed — don't touch estado,
      // just clear the stale booking uid
      await supabase
        .from('sp_precandidatos')
        .update({ calcom_booking_uid: null, updated_at: new Date().toISOString() })
        .eq('id', cita.precandidato_id)
    }

    await supabase.from('sp_actividades').insert({
      precandidato_id: cita.precandidato_id,
      campana_id: cita.campana_id,
      tipo: 'cita_cancelada',
      metadata: {
        calcom_booking_uid: bookingUid,
        precandidato_estado: pre?.estado ?? null,
        remaining_citas: remaining?.length ?? 0
      }
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
  const currentUid = (payload.uid ?? payload.bookingUid) as string | undefined
  const oldUid = (
    payload.rescheduledFromUid ??
    payload.rescheduleUid ??
    currentUid
  ) as string | undefined
  const newUid = (
    payload.rescheduledToUid ??
    (payload.rescheduledFromUid ? currentUid : undefined) ??
    currentUid
  ) as string | undefined
  const newStart = payload.startTime as string | undefined
  const newEnd = payload.endTime as string | undefined
  const videoCallData = payload.videoCallData as Record<string, unknown> | undefined
  const videoCallUrl = ((payload.videoCallUrl as string) ?? (videoCallData?.url as string)) || null
  if (!oldUid) return

  const { data: regularCita } = await supabase
    .from('citas')
    .select('id,agente_id,prospecto_id,inicio')
    .eq('external_event_id', oldUid)
    .maybeSingle()
  if (regularCita) {
    await supabase
      .from('citas')
      .update({
        external_event_id: newUid ?? oldUid,
        inicio: newStart ?? undefined,
        fin: newEnd ?? undefined,
        meeting_url: videoCallUrl ?? undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', regularCita.id)
    const { data: agent } = await supabase
      .from('usuarios')
      .select('id')
      .eq('id_auth', regularCita.agente_id)
      .maybeSingle()
    if (agent?.id && newStart) {
      await detachPlanificacionCita({
        supabase,
        agenteId: Number(agent.id),
        inicioIso: regularCita.inicio,
        citaId: Number(regularCita.id)
      })
      const { data: prospect } = regularCita.prospecto_id
        ? await supabase.from('prospectos').select('nombre').eq('id', regularCita.prospecto_id).maybeSingle()
        : { data: null }
      await syncPlanificacionCita({
        supabase,
        agenteId: Number(agent.id),
        inicioIso: newStart,
        finIso: newEnd ?? null,
        prospectoId: regularCita.prospecto_id,
        prospectoNombre: prospect?.nombre ?? null,
        citaId: Number(regularCita.id)
      })
    }
    await supabase
      .from('questionnaire_submissions')
      .update({
        cal_booking_uid: newUid ?? oldUid,
        booking_start: newStart ?? undefined,
        booking_end: newEnd ?? undefined,
        updated_at: new Date().toISOString()
      })
      .eq('cal_booking_uid', oldUid)
    await notifyAgendaCitaEvent(supabase, {
      citaId: Number(regularCita.id),
      event: 'rescheduled',
      previousStart: regularCita.inicio,
      nextStart: newStart ?? null,
      bookingUid: newUid ?? oldUid,
      actorEmail: null
    })
    return
  }

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

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  ))
}

function calcomBookingUidCandidates(payload: Record<string, unknown>): string[] {
  const booking = payload.booking && typeof payload.booking === 'object'
    ? payload.booking as Record<string, unknown>
    : null
  return uniqueStrings([
    payload.uid,
    payload.bookingUid,
    payload.rescheduledFromUid,
    payload.rescheduledToUid,
    payload.rescheduleUid,
    booking?.uid,
    booking?.bookingUid,
    booking?.rescheduledFromUid,
    booking?.rescheduledToUid,
    booking?.rescheduleUid
  ])
}

async function logCalcomWebhookEvent(
  supabase: ReturnType<typeof ensureAdminClient>,
  input: {
    triggerEvent: string
    payload: Record<string, unknown>
    organizerEmail: string
    usuarioId: string
  }
) {
  const metadata = input.payload.metadata && typeof input.payload.metadata === 'object'
    ? input.payload.metadata as Record<string, unknown>
    : null
  await supabase.from('logs_integracion').insert({
    usuario_id: input.usuarioId,
    proveedor: 'calcom',
    operacion: 'webhook_calcom_recibido',
    nivel: 'info',
    detalle: {
      triggerEvent: input.triggerEvent,
      organizerEmail: input.organizerEmail,
      bookingUid: calcomBookingUidCandidates(input.payload)[0] ?? null,
      bookingUidCandidates: calcomBookingUidCandidates(input.payload),
      status: typeof input.payload.status === 'string' ? input.payload.status : null,
      startTime: typeof input.payload.startTime === 'string' ? input.payload.startTime : null,
      endTime: typeof input.payload.endTime === 'string' ? input.payload.endTime : null,
      rescheduledFromUid: typeof input.payload.rescheduledFromUid === 'string' ? input.payload.rescheduledFromUid : null,
      rescheduledToUid: typeof input.payload.rescheduledToUid === 'string' ? input.payload.rescheduledToUid : null,
      metadata: metadata ? {
        lealtiaSubmissionId: typeof metadata.lealtiaSubmissionId === 'string' ? metadata.lealtiaSubmissionId : null,
        lealtiaProspectoId: typeof metadata.lealtiaProspectoId === 'string' ? metadata.lealtiaProspectoId : null,
        lealtiaLinkId: typeof metadata.lealtiaLinkId === 'string' ? metadata.lealtiaLinkId : null
      } : null
    }
  })
}

async function syncLealtiaCrmBooking(
  supabase: ReturnType<typeof ensureAdminClient>,
  input: {
    bookingUid: string
    reclutadorAuthId: string
    submissionId: string | null
    prospectoId: number | null
    inicio: string
    fin: string
    meetingUrl: string | null
  }
) {
  if (input.submissionId) {
    await syncQuestionnaireBooking(supabase, {
      submissionId: input.submissionId,
      bookingUid: input.bookingUid,
      start: input.inicio,
      end: input.fin,
      meetingUrl: input.meetingUrl
    })
    return
  }

  let prospectoId = input.prospectoId
  if (input.submissionId) {
    const { data: submission } = await supabase
      .from('questionnaire_submissions')
      .select('id,prospecto_id,questionnaire_snapshot,respuestas')
      .eq('id', input.submissionId)
      .maybeSingle()
    if (submission?.prospecto_id) prospectoId = Number(submission.prospecto_id)
  }

  const { data: existing } = await supabase
    .from('citas')
    .select('id,meeting_url')
    .eq('external_event_id', input.bookingUid)
    .maybeSingle()

  let citaId: number | null = existing?.id ? Number(existing.id) : null
  if (existing?.id) {
    await supabase
      .from('citas')
      .update({
        inicio: input.inicio,
        fin: input.fin,
        meeting_url: input.meetingUrl || existing.meeting_url,
        estado: 'confirmada',
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
  } else if (prospectoId) {
    const { data: created } = await supabase
      .from('citas')
      .insert({
        prospecto_id: prospectoId,
        agente_id: input.reclutadorAuthId,
        supervisor_id: null,
        inicio: input.inicio,
        fin: input.fin,
        meeting_url: input.meetingUrl || 'https://cal.com',
        meeting_provider: 'calcom',
        external_event_id: input.bookingUid,
        estado: 'confirmada'
      })
      .select('id')
      .single()
    citaId = created?.id ? Number(created.id) : null
  }

  if (input.submissionId) {
    await supabase
      .from('questionnaire_submissions')
      .update({
        estado: 'cita_agendada',
        cal_booking_uid: input.bookingUid,
        booking_start: input.inicio,
        booking_end: input.fin,
        updated_at: new Date().toISOString()
      })
      .eq('id', input.submissionId)
  }

  if (prospectoId) {
    await supabase
      .from('prospectos')
      .update({
        estado: 'con_cita',
        cita_creada: true,
        fecha_cita: input.inicio,
        updated_at: new Date().toISOString()
      })
      .eq('id', prospectoId)
  }

  if (citaId) {
    const [{ data: agent }, { data: prospect }] = await Promise.all([
      supabase.from('usuarios').select('id').eq('id_auth', input.reclutadorAuthId).maybeSingle(),
      prospectoId
        ? supabase.from('prospectos').select('nombre').eq('id', prospectoId).maybeSingle()
        : Promise.resolve({ data: null })
    ])
    if (agent?.id) {
      await syncPlanificacionCita({
        supabase,
        agenteId: Number(agent.id),
        inicioIso: input.inicio,
        finIso: input.fin,
        prospectoId,
        prospectoNombre: prospect?.nombre ?? null,
        citaId
      })
    }
  }

}

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
