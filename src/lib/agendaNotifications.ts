import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyCrmUsers } from '@/lib/crmNotifications'

export type AgendaNotificationEvent = 'scheduled' | 'rescheduled' | 'cancelled'

function formatDateTime(iso?: string | null) {
  if (!iso) return null
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

export async function notifyAgendaCitaEvent(
  supabase: SupabaseClient,
  input: {
    citaId: number
    event: AgendaNotificationEvent
    previousStart?: string | null
    nextStart?: string | null
    bookingUid?: string | null
    actorEmail?: string | null
    email?: boolean
  }
) {
  const { data: cita } = await supabase
    .from('citas')
    .select('id,prospecto_id,agente_id,supervisor_id,inicio,fin,meeting_provider,meeting_url,external_event_id')
    .eq('id', input.citaId)
    .maybeSingle()
  if (!cita) return

  const authIds = [cita.agente_id, cita.supervisor_id].filter((value): value is string => Boolean(value))
  const { data: usuarios } = authIds.length
    ? await supabase.from('usuarios').select('id_auth,email,nombre').in('id_auth', authIds)
    : { data: [] }
  const recipients = (usuarios || []).map(user => ({
    id_auth: user.id_auth ?? null,
    email: user.email ?? null,
    nombre: user.nombre ?? null
  }))

  const { data: prospecto } = cita.prospecto_id
    ? await supabase.from('prospectos').select('nombre,email').eq('id', cita.prospecto_id).maybeSingle()
    : { data: null }

  const prospectName = prospecto?.nombre || 'Prospecto'
  const previous = formatDateTime(input.previousStart)
  const next = formatDateTime(input.nextStart || cita.inicio)
  const eventLabel = input.event === 'cancelled'
    ? 'Cita cancelada'
    : input.event === 'rescheduled'
      ? 'Cita reprogramada'
      : 'Cita agendada'
  const message = input.event === 'rescheduled'
    ? `${prospectName} fue reprogramado${next ? ` para ${next}` : ''}.`
    : input.event === 'cancelled'
      ? `${prospectName} tenía una cita cancelada${previous ? ` para ${previous}` : ''}.`
      : `${prospectName} tiene una cita agendada${next ? ` para ${next}` : ''}.`

  await notifyCrmUsers(supabase, recipients, {
    titulo: eventLabel,
    mensaje: message,
    dedupeKey: `agenda:${input.event}:${cita.id}:${input.bookingUid || cita.external_event_id || input.nextStart || input.previousStart || ''}`,
    metadata: {
      source: 'agenda',
      event: input.event,
      cita_id: cita.id,
      prospecto_id: cita.prospecto_id,
      booking_uid: input.bookingUid || cita.external_event_id || null,
      actor_email: input.actorEmail ?? null
    },
    email: input.email === false ? undefined : {
      subject: `${eventLabel} - ${prospectName}`,
      heading: eventLabel,
      lines: [
        message,
        previous && input.event === 'rescheduled' ? `Horario anterior: ${previous}.` : '',
        next && input.event !== 'cancelled' ? `Horario actual: ${next}.` : '',
        prospecto?.email ? `Correo del prospecto: ${prospecto.email}.` : '',
        input.actorEmail ? `Gestionado por: ${input.actorEmail}.` : ''
      ],
      actionUrl: `${(process.env.NEXT_PUBLIC_APP_URL || process.env.MAIL_LOGIN_URL || 'http://localhost:3000').replace(/\/$/, '')}/agenda`,
      actionLabel: 'Ver agenda'
    }
  })
}

