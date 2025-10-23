import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { cancelRemoteMeeting } from '@/lib/agendaProviders'
import { logAccion } from '@/lib/logger'
import { buildCitaCancelacionEmail, sendMail } from '@/lib/mailer'
import { getZoomManualSettings, getTeamsManualSettings } from '@/lib/zoomManual'
import type { MeetingProvider } from '@/types'
import { detachPlanificacionCita } from '../planificacionSync'

export type CancelCascadeOrigin = 'agenda' | 'planificacion' | 'calendar'

export interface CancelCascadeActor {
  id?: number | null
  id_auth?: string | null
  email?: string | null
  rol?: string | null
  is_desarrollador?: boolean | null
}

export interface CancelAgendaCascadeOptions {
  citaId: number
  motivo?: string | null
  actor: CancelCascadeActor | null
  origin: CancelCascadeOrigin
  supabase?: SupabaseClient
  skipRemote?: boolean
}

export interface CancelAgendaCascadeResult {
  success: boolean
  alreadyCancelled?: boolean
  error?: string
}

function motiveFromOrigin(origin: CancelCascadeOrigin, provided?: string | null): string | null {
  if (provided && provided.trim().length > 0) {
    return provided.trim()
  }
  switch (origin) {
    case 'planificacion':
      return 'Cancelada desde planificación semanal.'
    case 'calendar':
      return 'Cancelada desde Google Calendar.'
    default:
      return null
  }
}

export async function cancelAgendaCitaCascade(options: CancelAgendaCascadeOptions): Promise<CancelAgendaCascadeResult> {
  const supabase = options.supabase ?? ensureAdminClient()
  const { data: cita, error: citaError } = await supabase
    .from('citas')
    .select('id,estado,prospecto_id,agente_id,supervisor_id,inicio,fin,meeting_provider,meeting_url,external_event_id')
    .eq('id', options.citaId)
    .maybeSingle()

  if (citaError) {
    return { success: false, error: citaError.message }
  }

  if (!cita) {
    return { success: false, error: 'Cita no encontrada' }
  }

  if (cita.estado === 'cancelada') {
    return { success: true, alreadyCancelled: true }
  }

  const provider = (cita.meeting_provider || 'google_meet') as MeetingProvider

  if (!options.skipRemote && cita.external_event_id) {
    try {
      await cancelRemoteMeeting(cita.agente_id, 'google_meet', cita.external_event_id)
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: cita.agente_id,
          proveedor: 'google_meet',
          operacion: 'cancel_cita_remote',
          nivel: 'info',
          detalle: {
            citaId: cita.id,
            external_event_id: cita.external_event_id,
            origin: options.origin
          }
        })
      } catch {}
    } catch (err) {
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: cita.agente_id,
          proveedor: 'google_meet',
          operacion: 'cancel_cita_remote',
          nivel: 'error',
          detalle: {
            citaId: cita.id,
            external_event_id: cita.external_event_id,
            origin: options.origin,
            error: err instanceof Error ? err.message : String(err)
          }
        })
      } catch {}
      return { success: false, error: err instanceof Error ? err.message : 'No se pudo cancelar la reunión remota' }
    }
  }

  const { error: updateError } = await supabase
    .from('citas')
    .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
    .eq('id', cita.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  if (cita.prospecto_id != null) {
    try {
      await supabase
        .from('prospectos')
        .update({ cita_creada: false, fecha_cita: null, estado: 'seguimiento' })
        .eq('id', cita.prospecto_id)
    } catch {}
  }

  let prospectoNombre: string | null = null
  let prospectoEmail: string | null = null
  if (cita.prospecto_id != null) {
    try {
      const { data: prospecto } = await supabase
        .from('prospectos')
        .select('nombre,email')
        .eq('id', cita.prospecto_id)
        .maybeSingle()
      if (prospecto?.nombre) prospectoNombre = prospecto.nombre
      if (prospecto?.email && prospecto.email.includes('@')) {
        prospectoEmail = prospecto.email
      }
    } catch {}
  }

  let agenteRecord: { id?: number | null; email?: string; nombre?: string | null; id_auth?: string | null } | null = null
  let supervisorRecord: { id?: number | null; email?: string; nombre?: string | null; id_auth?: string | null } | null = null
  let agenteNumericId: number | null = null

  try {
    const authIds = [cita.agente_id, cita.supervisor_id].filter((value): value is string => Boolean(value))
    if (authIds.length > 0) {
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id,email,nombre,id_auth')
        .in('id_auth', authIds)
      for (const user of usuarios || []) {
        if (!user?.id_auth) continue
        if (user.id_auth === cita.agente_id) {
          agenteRecord = { id: user.id ?? null, email: user.email, nombre: user.nombre ?? null, id_auth: user.id_auth }
          if (typeof user.id === 'number') agenteNumericId = user.id
        } else if (cita.supervisor_id && user.id_auth === cita.supervisor_id) {
          supervisorRecord = { id: user.id ?? null, email: user.email, nombre: user.nombre ?? null, id_auth: user.id_auth }
        }
      }
    }
  } catch {}

  if (agenteNumericId != null) {
    try {
      await detachPlanificacionCita({
        supabase,
        agenteId: agenteNumericId,
        inicioIso: cita.inicio,
        citaId: cita.id
      })
    } catch {}
  }

  let meetingIdForEmail: string | null = null
  let meetingPasswordForEmail: string | null = null
  if ((provider === 'zoom' || provider === 'teams') && cita.agente_id) {
    try {
      const manualResult = provider === 'zoom'
        ? await getZoomManualSettings(cita.agente_id)
        : await getTeamsManualSettings(cita.agente_id)
      if (!manualResult.error && manualResult.settings) {
        meetingIdForEmail = manualResult.settings.meetingId ?? null
        meetingPasswordForEmail = manualResult.settings.meetingPassword ?? null
      }
    } catch {}
  }

  const recipientSet = new Set<string>()
  if (agenteRecord?.email && agenteRecord.email.includes('@')) {
    recipientSet.add(agenteRecord.email)
  }
  if (prospectoEmail) {
    recipientSet.add(prospectoEmail)
  }

  const actorEmail = options.actor?.email || null
  if (recipientSet.size > 0) {
    const toList = Array.from(recipientSet)
    const ccList = [supervisorRecord?.email, actorEmail]
      .filter((value): value is string => Boolean(value && !recipientSet.has(value)))
    const agenteNombreCorreo = agenteRecord?.nombre || agenteRecord?.email || 'Agente Lealtia'
    const agenteCorreoPlantilla = agenteRecord?.email || (toList.length > 0 ? toList[0] : '')
    const logUsuarioId = agenteRecord?.id_auth || cita.agente_id || null
    try {
      const { subject, html, text } = buildCitaCancelacionEmail({
        nombreAgente: agenteNombreCorreo,
        emailAgente: agenteCorreoPlantilla,
        inicio: cita.inicio,
        fin: cita.fin,
        meetingUrl: cita.meeting_url || '',
        meetingProvider: cita.meeting_provider,
        motivo: motiveFromOrigin(options.origin, options.motivo),
        nombreProspecto: prospectoNombre,
        supervisorNombre: supervisorRecord?.nombre || null,
        solicitante: actorEmail,
        timezone: process.env.AGENDA_TZ || null,
        meetingId: meetingIdForEmail,
        meetingPassword: meetingPasswordForEmail
      })
      await sendMail({ to: toList.join(','), subject, html, text, cc: ccList.length ? ccList : undefined })
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: logUsuarioId,
          proveedor: 'mailer',
          operacion: 'cita_cancelacion',
          nivel: 'info',
          detalle: {
            citaId: cita.id,
            to: toList,
            cc: ccList,
            supervisor: supervisorRecord?.email || null,
            origin: options.origin
          }
        })
      } catch {}
    } catch (err) {
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agenteRecord?.id_auth || cita.agente_id || null,
          proveedor: 'mailer',
          operacion: 'cita_cancelacion',
          nivel: 'error',
          detalle: {
            citaId: cita.id,
            to: Array.from(recipientSet),
            origin: options.origin,
            error: err instanceof Error ? err.message : String(err)
          }
        })
      } catch {}
    }
  }

  try {
    await logAccion('cancelar_cita', {
      usuario: actorEmail || 'sistema',
      tabla_afectada: 'citas',
      id_registro: cita.id,
      snapshot: {
        estado_anterior: cita.estado,
        estado_nuevo: 'cancelada',
        motivo: motiveFromOrigin(options.origin, options.motivo),
        origin: options.origin
      }
    })
  } catch {}

  try {
    await supabase.from('logs_integracion').insert({
      usuario_id: options.actor?.id_auth ?? options.actor?.id ?? null,
      proveedor: cita.meeting_provider,
      operacion: 'cancel_cita',
      nivel: 'info',
      detalle: {
        citaId: cita.id,
        motivo: motiveFromOrigin(options.origin, options.motivo),
        external_event_id: cita.external_event_id || null,
        remoto: Boolean(cita.external_event_id) && !options.skipRemote,
        origin: options.origin
      }
    })
  } catch {}

  return { success: true }
}
