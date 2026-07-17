import { NextRequest, NextResponse } from 'next/server'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { resolvePublicQuestionnaireLink } from '@/lib/questionnairePublic'
import {
  createCalcomBooking,
  getCalcomApiKey
} from '@/lib/integrations/calcom'
import { extractSemanticAnswers, type QuestionnaireSection } from '@/lib/validation/questionnaireSchemas'
import { logAccion } from '@/lib/logger'
import { syncQuestionnaireBooking } from '@/lib/questionnaireBookingSync'
import { ensureQuestionnaireProspect } from '@/lib/questionnaireProspect'
import type { PprResult } from '@/lib/pprCalculator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function uniqueEmails(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const email = raw?.trim().toLowerCase()
    if (!email || !email.includes('@') || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

async function getSupervisorGuestEmails(
  supabase: ReturnType<typeof ensureAdminClient>,
  excludedEmails: Array<string | null | undefined> = []
) {
  const excluded = new Set(uniqueEmails(excludedEmails))
  const { data } = await supabase
    .from('usuarios')
    .select('email')
    .in('rol', ['supervisor', 'admin', 'superusuario'])
    .eq('activo', true)

  return uniqueEmails((data || []).map(user => user.email as string | null | undefined))
    .filter(email => !excluded.has(email))
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params
  const { link, error } = await resolvePublicQuestionnaireLink(token)
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!link?.cal_event_type_id || !link.agente.id_auth) {
    return NextResponse.json({ error: 'El agente no tiene un evento disponible' }, { status: 409 })
  }

  const body = await req.json().catch(() => null) as {
    submission_id?: string
    start?: string
    end?: string
    booking_uid?: string
    meetingUrl?: string | null
    timeZone?: string
  } | null
  if (!body?.submission_id || !body.start || Number.isNaN(new Date(body.start).getTime())) {
    return NextResponse.json({ error: 'Selecciona un horario válido' }, { status: 400 })
  }

  const supabase = ensureAdminClient()
  const { data: submission, error: submissionError } = await supabase
    .from('questionnaire_submissions')
    .select('id,respuestas,prospecto_id,questionnaire_snapshot,cal_booking_uid,estado,ppr_result')
    .eq('id', body.submission_id)
    .eq('link_id', link.id)
    .maybeSingle()
  if (submissionError) return NextResponse.json({ error: submissionError.message }, { status: 500 })
  if (!submission) return NextResponse.json({ error: 'Respuesta no encontrada' }, { status: 404 })
  if (submission.cal_booking_uid && submission.cal_booking_uid !== body.booking_uid) {
    return NextResponse.json({ error: 'Esta solicitud ya tiene una cita agendada' }, { status: 409 })
  }
  if (link.questionnaire.requiere_ppr && submission.estado !== 'simulacion_completa' && submission.estado !== 'cita_agendada') {
    return NextResponse.json({ error: 'Completa la simulación PPR antes de agendar' }, { status: 409 })
  }

  const snapshot = submission.questionnaire_snapshot as {
    secciones?: QuestionnaireSection[]
  }
  const contact = extractSemanticAnswers(snapshot.secciones || [], submission.respuestas as Record<string, unknown>)
  const name = String(contact.nombre || '').trim()
  const email = String(contact.email || '').trim().toLowerCase()
  const phoneNumber = String(contact.telefono || '').replace(/\D/g, '')
  if (!name || !email) return NextResponse.json({ error: 'Faltan los datos de contacto del prospecto' }, { status: 409 })

  try {
    const ensured = await ensureQuestionnaireProspect(supabase, {
      agenteId: Number(link.agente_id),
      questionnaireTitle: link.questionnaire.titulo,
      agentCode: link.agent_code,
      sections: snapshot.secciones || [],
      answers: submission.respuestas as Record<string, unknown>,
      requierePpr: link.questionnaire.requiere_ppr,
      pprResult: submission.ppr_result && typeof submission.ppr_result === 'object'
        ? submission.ppr_result as PprResult
        : null,
      existingProspectId: submission.prospecto_id ? Number(submission.prospecto_id) : null
    })
    if (Number(submission.prospecto_id || 0) !== ensured.prospectId) {
      const { error: updateError } = await supabase
        .from('questionnaire_submissions')
        .update({ prospecto_id: ensured.prospectId, updated_at: new Date().toISOString() })
        .eq('id', submission.id)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      submission.prospecto_id = ensured.prospectId
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No se pudo guardar la información del prospecto'
    }, { status: 500 })
  }

  if (body.booking_uid) {
    try {
      const synced = await syncQuestionnaireBooking(supabase, {
        submissionId: submission.id,
        bookingUid: body.booking_uid,
        start: body.start,
        end: body.end,
        meetingUrl: body.meetingUrl
      })
      void logAccion('sincronizar_cita_cuestionario_embed', {
        tabla_afectada: 'citas',
        id_registro: synced.citaId,
        snapshot: {
          submission_id: submission.id,
          booking_uid: synced.booking.uid,
          prospecto_id: submission.prospecto_id,
          agent_code: link.agent_code,
          source: 'calcom_embed'
        }
      })
      return NextResponse.json({ success: true, booking: synced.booking }, { status: 201 })
    } catch (syncError) {
      return NextResponse.json({
        error: syncError instanceof Error ? syncError.message : 'No se pudo sincronizar la cita con el CRM'
      }, { status: 500 })
    }
  }

  const apiKey = await getCalcomApiKey(link.agente.id_auth)
  if (!apiKey) return NextResponse.json({ error: 'La agenda del agente no está conectada' }, { status: 409 })

  const supervisorGuests = await getSupervisorGuestEmails(supabase, [link.agente.email, email])

  let booking
  try {
    booking = await createCalcomBooking(apiKey, {
      eventTypeId: link.cal_event_type_id,
      start: new Date(body.start).toISOString(),
      attendee: {
        name,
        email,
        phoneNumber: phoneNumber ? `+52${phoneNumber.slice(-10)}` : undefined,
        timeZone: body.timeZone || 'America/Mexico_City',
        language: 'es'
      },
      guests: supervisorGuests,
      metadata: {
        lealtiaSubmissionId: submission.id,
        lealtiaLinkId: link.id,
        lealtiaAgentCode: link.agent_code
      }
    })
  } catch (bookingError) {
    return NextResponse.json({ error: bookingError instanceof Error ? bookingError.message : 'No se pudo crear la cita' }, { status: 502 })
  }

  let synced
  try {
    synced = await syncQuestionnaireBooking(supabase, {
      submissionId: submission.id,
      bookingUid: booking.uid,
      start: booking.start,
      end: booking.end,
      meetingUrl: booking.meetingUrl || booking.location || link.cal_booking_url || 'https://cal.com'
    })
  } catch (syncError) {
    return NextResponse.json({
      error: `La cita se creó en Cal.com, pero no se pudo guardar en el CRM: ${syncError instanceof Error ? syncError.message : 'Error desconocido'}`,
      booking_uid: booking.uid
    }, { status: 500 })
  }

  void logAccion('agendar_cita_cuestionario', {
    tabla_afectada: 'citas',
    id_registro: synced.citaId,
    snapshot: {
      submission_id: submission.id,
      booking_uid: booking.uid,
      prospecto_id: submission.prospecto_id,
      agent_code: link.agent_code
    }
  })

  return NextResponse.json({
    success: true,
    booking: synced.booking
  }, { status: 201 })
}
