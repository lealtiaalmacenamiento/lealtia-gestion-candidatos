import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'
import { buildCitaCancelacionEmail, sendMail } from '@/lib/mailer'
import { cancelRemoteMeeting } from '@/lib/agendaProviders'
import type { MeetingProvider } from '@/types'

function canManageAgenda(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  return Boolean(usuario.is_desarrollador)
}

type CancelPayload = {
  citaId: number
  motivo?: string | null
}

export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!canManageAgenda(actor)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let payload: CancelPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const citaId = Number(payload.citaId)
  if (!Number.isFinite(citaId) || citaId <= 0) {
    return NextResponse.json({ error: 'citaId inválido' }, { status: 400 })
  }

  const motivo = payload.motivo ? String(payload.motivo).trim() : undefined

  const supabase = ensureAdminClient()
  const { data: cita, error: citaError } = await supabase
    .from('citas')
    .select('id,estado,prospecto_id,agente_id,supervisor_id,inicio,fin,meeting_provider,meeting_url,external_event_id')
    .eq('id', citaId)
    .maybeSingle()

  if (citaError) {
    return NextResponse.json({ error: citaError.message }, { status: 500 })
  }
  if (!cita) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }
  if (cita.estado === 'cancelada') {
    return NextResponse.json({ success: true, cita })
  }

  const provider = cita.meeting_provider as MeetingProvider

  if (cita.external_event_id && provider === 'google_meet') {
    try {
      await cancelRemoteMeeting(cita.agente_id, provider, cita.external_event_id)
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: cita.agente_id,
          proveedor: provider,
          operacion: 'cancel_cita_remote',
          nivel: 'info',
          detalle: {
            citaId,
            external_event_id: cita.external_event_id
          }
        })
      } catch {}
    } catch (err) {
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: cita.agente_id,
          proveedor: provider,
          operacion: 'cancel_cita_remote',
          nivel: 'error',
          detalle: {
            citaId,
            external_event_id: cita.external_event_id,
            error: err instanceof Error ? err.message : String(err)
          }
        })
      } catch {}
      return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo cancelar la reunión remota' }, { status: 502 })
    }
  }

  const { error: updateError } = await supabase
    .from('citas')
    .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
    .eq('id', citaId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (cita.prospecto_id != null) {
    try {
      await supabase
        .from('prospectos')
        .update({ cita_creada: false, fecha_cita: null })
        .eq('id', cita.prospecto_id)
    } catch {}
  }

  let prospectoNombre: string | null = null
  if (cita.prospecto_id != null) {
    try {
      const { data: prospecto } = await supabase
        .from('prospectos')
        .select('nombre')
        .eq('id', cita.prospecto_id)
        .maybeSingle()
      if (prospecto?.nombre) prospectoNombre = prospecto.nombre
    } catch {}
  }

  let agenteRecord: { email: string; nombre: string | null; id_auth: string | null } | null = null
  let supervisorRecord: { email: string; nombre: string | null; id_auth: string | null } | null = null
  try {
    const ids = [cita.agente_id, cita.supervisor_id].filter((value): value is string => Boolean(value))
    if (ids.length === 0) {
      throw new Error('Sin id_auth relacionados')
    }
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('email,nombre,id_auth')
      .in('id_auth', ids)

    for (const user of usuarios || []) {
      if (user.id_auth === cita.agente_id) {
        agenteRecord = { email: user.email, nombre: user.nombre ?? null, id_auth: user.id_auth ?? null }
      } else if (cita.supervisor_id && user.id_auth === cita.supervisor_id) {
        supervisorRecord = { email: user.email, nombre: user.nombre ?? null, id_auth: user.id_auth ?? null }
      }
    }
  } catch {}

  if (agenteRecord?.email) {
    const ccList = [supervisorRecord?.email, actor.email].filter((value): value is string => Boolean(value && value !== agenteRecord?.email))
    try {
      const { subject, html, text } = buildCitaCancelacionEmail({
        nombreAgente: agenteRecord.nombre || agenteRecord.email,
        emailAgente: agenteRecord.email,
        inicio: cita.inicio,
        fin: cita.fin,
        meetingUrl: cita.meeting_url || '',
        meetingProvider: cita.meeting_provider,
        motivo: motivo || null,
        nombreProspecto: prospectoNombre,
        supervisorNombre: supervisorRecord?.nombre || null,
        solicitante: actor.email || null,
        timezone: process.env.AGENDA_TZ || null
      })
      await sendMail({ to: agenteRecord.email, subject, html, text, cc: ccList.length ? ccList : undefined })
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agenteRecord.id_auth,
          proveedor: 'mailer',
          operacion: 'cita_cancelacion',
          nivel: 'info',
          detalle: {
            citaId,
            to: agenteRecord.email,
            cc: ccList,
            motivo: motivo || null
          }
        })
      } catch {}
    } catch (err) {
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agenteRecord.id_auth,
          proveedor: 'mailer',
          operacion: 'cita_cancelacion',
          nivel: 'error',
          detalle: {
            citaId,
            to: agenteRecord.email,
            error: err instanceof Error ? err.message : String(err)
          }
        })
      } catch {}
    }
  }

  try {
    await logAccion('cancelar_cita', {
      usuario: actor.email,
      tabla_afectada: 'citas',
      id_registro: citaId,
      snapshot: {
        estado_anterior: cita.estado,
        estado_nuevo: 'cancelada',
        motivo: motivo || null
      }
    })
  } catch {}

  try {
    await supabase.from('logs_integracion').insert({
      usuario_id: actor.id_auth ?? null,
  proveedor: cita.meeting_provider,
      operacion: 'cancel_cita',
      nivel: 'info',
      detalle: {
        citaId,
        motivo: motivo || null,
        external_event_id: cita.external_event_id || null,
        remoto: Boolean(cita.external_event_id)
      }
    })
  } catch {}

  return NextResponse.json({ success: true })
}
