import type { SupabaseClient } from '@supabase/supabase-js'
import { syncPlanificacionCita } from '@/app/api/agenda/citas/planificacionSync'
import { notifyQuestionnaireAgent } from '@/lib/questionnaireNotifications'
import { extractSemanticAnswers, type QuestionnaireSection } from '@/lib/validation/questionnaireSchemas'
import { sendMail } from '@/lib/mailer'

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

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: process.env.AGENDA_TZ || 'America/Mexico_City'
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

async function notifyDevelopersQuestionnaireBookingWithoutSupervisor(
  supabase: SupabaseClient,
  input: {
    citaId: number
    agenteAuthId: string
    agenteNombre?: string | null
    agenteEmail?: string | null
    prospectName: string
    prospectEmail?: string | null
    start: string
    end: string
    meetingUrl: string
    questionnaireTitle: string
    bookingUid: string
  }
) {
  const { data: developers } = await supabase
    .from('usuarios')
    .select('email')
    .eq('is_desarrollador', true)
    .eq('activo', true)

  const recipients = Array.from(new Set((developers || [])
    .map(row => (typeof row?.email === 'string' && row.email.includes('@') ? row.email : null))
    .filter((email): email is string => Boolean(email && email !== input.agenteEmail))))

  if (!recipients.length) return

  const agenteLabel = input.agenteNombre || input.agenteEmail || 'Asesor'
  const timezone = process.env.AGENDA_TZ || 'America/Mexico_City'
  const inicioLocal = formatDateTime(input.start)
  const finLocal = formatDateTime(input.end)
  const subject = `Aviso: ${input.prospectName} agendó una cita sin supervisor`
  const html = [
    '<p>Hola equipo de desarrollo,</p>',
    `<p>${input.prospectName}${input.prospectEmail ? ` (${input.prospectEmail})` : ''} agendó una cita con ${agenteLabel} sin supervisor desde el flujo de cuestionario/PPR. Aquí están los detalles disponibles:</p>`,
    '<ul>',
    `<li><strong>Asesor:</strong> ${agenteLabel}${input.agenteEmail ? ` (${input.agenteEmail})` : ''}</li>`,
    `<li><strong>Prospecto:</strong> ${input.prospectName}</li>`,
    `<li><strong>Correo del prospecto:</strong> ${input.prospectEmail || 'Sin correo capturado'}</li>`,
    `<li><strong>Cuestionario:</strong> ${input.questionnaireTitle}</li>`,
    `<li><strong>Horario:</strong> ${inicioLocal} - ${finLocal}</li>`,
    `<li><strong>Zona horaria:</strong> ${timezone}</li>`,
    '<li><strong>Plataforma:</strong> Cal.com</li>',
    `<li><strong>Enlace:</strong> <a href="${input.meetingUrl}">${input.meetingUrl}</a></li>`,
    '</ul>',
    '<p>Revisen si necesitan asignar supervisor o tomar alguna acción adicional.</p>',
    '<p>Gracias.</p>'
  ].join('\n')
  const text = [
    'Hola equipo de desarrollo,',
    `${input.prospectName}${input.prospectEmail ? ` (${input.prospectEmail})` : ''} agendó una cita con ${agenteLabel} sin supervisor desde el flujo de cuestionario/PPR.`,
    '',
    `Asesor: ${agenteLabel}${input.agenteEmail ? ` (${input.agenteEmail})` : ''}`,
    `Prospecto: ${input.prospectName}`,
    `Correo del prospecto: ${input.prospectEmail || 'Sin correo capturado'}`,
    `Cuestionario: ${input.questionnaireTitle}`,
    `Horario: ${inicioLocal} - ${finLocal}`,
    `Zona horaria: ${timezone}`,
    'Plataforma: Cal.com',
    `Enlace: ${input.meetingUrl}`,
    '',
    'Revisen si necesitan asignar supervisor o tomar alguna acción adicional.',
    'Gracias.'
  ].join('\n')

  try {
    await sendMail({ to: recipients.join(','), subject, html, text })
    await supabase.from('logs_integracion').insert({
      usuario_id: input.agenteAuthId,
      proveedor: 'mailer',
      operacion: 'cita_confirmacion_desarrolladores',
      nivel: 'info',
      detalle: {
        citaId: input.citaId,
        to: recipients,
        booking_uid: input.bookingUid,
        source: 'questionnaire_ppr',
        motivo: 'sin_supervisor'
      }
    })
  } catch (err) {
    try {
      await supabase.from('logs_integracion').insert({
        usuario_id: input.agenteAuthId,
        proveedor: 'mailer',
        operacion: 'cita_confirmacion_desarrolladores',
        nivel: 'error',
        detalle: {
          citaId: input.citaId,
          to: recipients,
          booking_uid: input.bookingUid,
          source: 'questionnaire_ppr',
          motivo: 'sin_supervisor',
          error: err instanceof Error ? err.message : String(err)
        }
      })
    } catch {}
  }
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

    await notifyDevelopersQuestionnaireBookingWithoutSupervisor(supabase, {
      citaId,
      agenteAuthId: agente.id_auth,
      agenteNombre: agente.nombre,
      agenteEmail: agente.email,
      prospectName,
      prospectEmail,
      start,
      end,
      meetingUrl,
      questionnaireTitle: snapshot.titulo || questionnaire.titulo,
      bookingUid
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
