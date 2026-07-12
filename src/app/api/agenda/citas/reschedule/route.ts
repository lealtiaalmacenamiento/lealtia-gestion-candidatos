import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { getCalcomApiKey, rescheduleCalcomBooking } from '@/lib/integrations/calcom'
import { detachPlanificacionCita, syncPlanificacionCita } from '../planificacionSync'
import { logAccion } from '@/lib/logger'
import { notifyAgendaCitaEvent } from '@/lib/agendaNotifications'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor?.activo) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['agente', 'supervisor', 'admin'].includes(actor.rol || '') && !actor.is_desarrollador) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { citaId?: number; start?: string; reason?: string } | null
  const citaId = Number(body?.citaId)
  const start = body?.start ? new Date(body.start) : null
  if (!Number.isFinite(citaId) || !start || Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Cita u horario inválido' }, { status: 400 })
  }
  const supabase = ensureAdminClient()
  const { data: cita, error } = await supabase
    .from('citas')
    .select('id,agente_id,prospecto_id,inicio,fin,meeting_url,meeting_provider,external_event_id,estado')
    .eq('id', citaId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!cita || cita.estado !== 'confirmada') return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  if (actor.rol === 'agente' && cita.agente_id !== actor.id_auth) {
    return NextResponse.json({ error: 'Solo puedes reprogramar tus propias citas' }, { status: 403 })
  }
  if (cita.meeting_provider !== 'calcom' || !cita.external_event_id) {
    return NextResponse.json({ error: 'La reprogramación directa está disponible para citas de Cal.com' }, { status: 409 })
  }
  const apiKey = await getCalcomApiKey(cita.agente_id)
  if (!apiKey) return NextResponse.json({ error: 'La cuenta de Cal.com del agente no está conectada' }, { status: 409 })

  let booking
  try {
    booking = await rescheduleCalcomBooking(apiKey, cita.external_event_id, start.toISOString(), body?.reason)
  } catch (bookingError) {
    return NextResponse.json({ error: bookingError instanceof Error ? bookingError.message : 'No se pudo reprogramar en Cal.com' }, { status: 502 })
  }

  const { data: agent } = await supabase.from('usuarios').select('id').eq('id_auth', cita.agente_id).maybeSingle()
  if (agent?.id) {
    await detachPlanificacionCita({
      supabase,
      agenteId: Number(agent.id),
      inicioIso: cita.inicio,
      citaId: Number(cita.id)
    })
  }

  const meetingUrl = booking.meetingUrl || booking.location || cita.meeting_url
  const { data: updated, error: updateError } = await supabase
    .from('citas')
    .update({
      inicio: booking.start,
      fin: booking.end,
      meeting_url: meetingUrl,
      external_event_id: booking.uid,
      updated_at: new Date().toISOString()
    })
    .eq('id', cita.id)
    .select('*')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { data: prospect } = cita.prospecto_id
    ? await supabase.from('prospectos').select('nombre').eq('id', cita.prospecto_id).maybeSingle()
    : { data: null }
  if (cita.prospecto_id) {
    await supabase.from('prospectos').update({ fecha_cita: booking.start }).eq('id', cita.prospecto_id)
  }
  if (agent?.id) {
    await syncPlanificacionCita({
      supabase,
      agenteId: Number(agent.id),
      inicioIso: booking.start,
      finIso: booking.end,
      prospectoId: cita.prospecto_id,
      prospectoNombre: prospect?.nombre ?? null,
      citaId: Number(cita.id)
    })
  }
  await supabase
    .from('questionnaire_submissions')
    .update({
      cal_booking_uid: booking.uid,
      booking_start: booking.start,
      booking_end: booking.end,
      updated_at: new Date().toISOString()
    })
    .eq('cal_booking_uid', cita.external_event_id)

  void logAccion('reprogramar_cita_agenda', {
    usuario: actor.email,
    tabla_afectada: 'citas',
    id_registro: Number(cita.id),
    snapshot: { inicio_anterior: cita.inicio, inicio_nuevo: booking.start, booking_uid: booking.uid }
  })
  void notifyAgendaCitaEvent(supabase, {
    citaId: Number(cita.id),
    event: 'rescheduled',
    previousStart: cita.inicio,
    nextStart: booking.start,
    bookingUid: booking.uid,
    actorEmail: actor.email
  })
  return NextResponse.json({ success: true, cita: updated })
}
