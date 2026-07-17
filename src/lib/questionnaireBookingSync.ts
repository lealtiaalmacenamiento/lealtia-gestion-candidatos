import type { SupabaseClient } from '@supabase/supabase-js'
import { syncPlanificacionCita } from '@/app/api/agenda/citas/planificacionSync'
import { notifyQuestionnaireAgent } from '@/lib/questionnaireNotifications'
import { extractSemanticAnswers, type QuestionnaireSection } from '@/lib/validation/questionnaireSchemas'

function firstOrValue<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function validIsoOrNull(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function defaultEnd(startIso: string) {
  return new Date(new Date(startIso).getTime() + 30 * 60_000).toISOString()
}

export async function syncQuestionnaireBooking(
  supabase: SupabaseClient,
  input: {
    submissionId: string
    bookingUid: string
    start: string
    end?: string | null
    meetingUrl?: string | null
  }
) {
  const bookingUid = input.bookingUid.trim()
  const start = validIsoOrNull(input.start)
  if (!bookingUid) throw new Error('No se recibió el identificador de la reserva de Cal.com')
  if (!start) throw new Error('No se recibió una fecha válida para la cita')
  const end = validIsoOrNull(input.end) ?? defaultEnd(start)

  const { data: submission, error: submissionError } = await supabase
    .from('questionnaire_submissions')
    .select('id,link_id,respuestas,prospecto_id,questionnaire_snapshot,cal_booking_uid,estado,ppr_result')
    .eq('id', input.submissionId)
    .maybeSingle()
  if (submissionError) throw submissionError
  if (!submission) throw new Error('Respuesta no encontrada')
  if (submission.cal_booking_uid && submission.cal_booking_uid !== bookingUid) {
    throw new Error('Esta solicitud ya tiene una cita agendada')
  }
  const alreadySyncedBooking = submission.cal_booking_uid === bookingUid && submission.estado === 'cita_agendada'

  const { data: linkRow, error: linkError } = await supabase
    .from('questionnaire_links')
    .select(`
      id,agente_id,agent_code,cal_booking_url,
      questionnaire:questionnaires(id,titulo,requiere_ppr),
      agente:usuarios(id,id_auth,nombre,email)
    `)
    .eq('id', submission.link_id)
    .maybeSingle()
  if (linkError) throw linkError
  if (!linkRow) throw new Error('Enlace de cuestionario no encontrado')

  const questionnaire = firstOrValue(linkRow.questionnaire as { id: string; titulo: string; requiere_ppr: boolean } | { id: string; titulo: string; requiere_ppr: boolean }[] | null)
  const agente = firstOrValue(linkRow.agente as { id: number; id_auth: string | null; nombre: string | null; email: string | null } | { id: number; id_auth: string | null; nombre: string | null; email: string | null }[] | null)
  if (!questionnaire) throw new Error('Cuestionario no encontrado')
  if (!agente?.id_auth) throw new Error('El agente no tiene usuario de CRM vinculado')

  const snapshot = submission.questionnaire_snapshot &&
    typeof submission.questionnaire_snapshot === 'object' &&
    !Array.isArray(submission.questionnaire_snapshot)
    ? submission.questionnaire_snapshot as { secciones?: QuestionnaireSection[]; titulo?: string }
    : {}
  const answers = submission.respuestas && typeof submission.respuestas === 'object'
    ? submission.respuestas as Record<string, unknown>
    : {}
  const semantic = extractSemanticAnswers(snapshot.secciones || [], answers)
  const prospectName = String(semantic.nombre || '').trim() || 'Prospecto'
  const prospectEmail = typeof semantic.email === 'string' ? semantic.email : null
  const prospectoId = submission.prospecto_id ? Number(submission.prospecto_id) : null
  if (!prospectoId) throw new Error('No se encontró el prospecto vinculado a la solicitud')

  const meetingUrl = input.meetingUrl || linkRow.cal_booking_url || 'https://cal.com'
  const { data: existing, error: existingError } = await supabase
    .from('citas')
    .select('id,meeting_url')
    .eq('external_event_id', bookingUid)
    .maybeSingle()
  if (existingError) throw existingError

  let citaId: number
  if (existing?.id) {
    citaId = Number(existing.id)
    const { error: updateError } = await supabase
      .from('citas')
      .update({
        prospecto_id: prospectoId,
        agente_id: agente.id_auth,
        inicio: start,
        fin: end,
        meeting_url: meetingUrl || existing.meeting_url,
        meeting_provider: 'calcom',
        estado: 'confirmada',
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
    if (updateError) throw updateError
  } else {
    const { data: created, error: insertError } = await supabase
      .from('citas')
      .insert({
        prospecto_id: prospectoId,
        agente_id: agente.id_auth,
        supervisor_id: null,
        inicio: start,
        fin: end,
        meeting_url: meetingUrl,
        meeting_provider: 'calcom',
        external_event_id: bookingUid,
        estado: 'confirmada'
      })
      .select('id')
      .single()
    if (insertError) throw insertError
    citaId = Number(created.id)
  }

  const { data: bookingMarker, error: markerError } = await supabase
    .from('questionnaire_submissions')
    .update({
      estado: 'cita_agendada',
      cal_booking_uid: bookingUid,
      booking_start: start,
      booking_end: end,
      updated_at: new Date().toISOString()
    })
    .eq('id', submission.id)
    .neq('estado', 'cita_agendada')
    .select('id')
    .maybeSingle()
  if (markerError) throw markerError

  const { error: prospectUpdateError } = await supabase
    .from('prospectos')
    .update({
      estado: 'con_cita',
      cita_creada: true,
      fecha_cita: start,
      updated_at: new Date().toISOString()
    })
    .eq('id', prospectoId)
  if (prospectUpdateError) throw prospectUpdateError

  await syncPlanificacionCita({
    supabase,
    agenteId: Number(linkRow.agente_id),
    inicioIso: start,
    finIso: end,
    prospectoId,
    prospectoNombre: prospectName,
    citaId,
    notas: `Agendado desde cuestionario ${snapshot.titulo || questionnaire.titulo}`
  })

  if (!alreadySyncedBooking && bookingMarker) {
    await notifyQuestionnaireAgent(supabase, {
      event: 'booking_scheduled',
      agenteId: Number(linkRow.agente_id),
      agentAuthId: agente.id_auth,
      prospectName,
      prospectEmail,
      questionnaireTitle: snapshot.titulo || questionnaire.titulo,
      agentCode: linkRow.agent_code,
      submissionId: submission.id,
      prospectoId,
      bookingUid,
      bookingStart: start,
      sendEmail: false
    })
  }

  return {
    citaId,
    booking: {
      uid: bookingUid,
      start,
      end,
      meetingUrl
    },
    prospect: {
      id: prospectoId,
      name: prospectName,
      email: prospectEmail
    }
  }
}
