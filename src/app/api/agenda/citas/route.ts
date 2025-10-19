import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'
import { buildCitaConfirmacionEmail, sendMail } from '@/lib/mailer'
import { createRemoteMeeting } from '@/lib/agendaProviders'
import type { MeetingProvider, AgendaCita, AgendaParticipant } from '@/types'

function canManageAgenda(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (!usuario) return false
  if (usuario.rol === 'admin' || usuario.rol === 'superusuario') return true
  return Boolean(usuario.is_desarrollador)
}

function canViewAgenda(usuario: { rol?: string | null; is_desarrollador?: boolean | null }) {
  if (canManageAgenda(usuario)) return true
  return usuario?.rol === 'agente'
}

function normalizeProvider(value: unknown): MeetingProvider {
  if (value === 'zoom') return 'zoom'
  if (value === 'teams') return 'teams'
  return 'google_meet'
}

type CreateCitaBody = {
  prospectoId?: number | string | null
  agenteId: number
  supervisorId?: number | null
  inicio: string
  fin: string
  meetingUrl?: string | null
  meetingProvider: string
  externalEventId?: string | null
  generarEnlace?: boolean
  prospectoNombre?: string | null
  notas?: string | null
}

export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!canViewAgenda(actor)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const actorIsAgente = actor.rol === 'agente'
  const supabase = ensureAdminClient()
  const url = new URL(req.url)
  const estadoParam = url.searchParams.get('estado')
  const desdeParam = url.searchParams.get('desde')
  const hastaParam = url.searchParams.get('hasta')
  const limitParam = url.searchParams.get('limit')
  const agenteIdParam = url.searchParams.get('agente_id')

  if (desdeParam) {
    const test = new Date(desdeParam)
    if (Number.isNaN(test.getTime())) {
      return NextResponse.json({ error: 'Parámetro desde inválido' }, { status: 400 })
    }
  }
  if (hastaParam) {
    const test = new Date(hastaParam)
    if (Number.isNaN(test.getTime())) {
      return NextResponse.json({ error: 'Parámetro hasta inválido' }, { status: 400 })
    }
  }

  let agenteAuthId: string | null = null
  if (agenteIdParam) {
    const agenteId = Number(agenteIdParam)
    if (!Number.isFinite(agenteId)) {
      return NextResponse.json({ error: 'agente_id inválido' }, { status: 400 })
    }
    const { data: agente, error: agenteLookupError } = await supabase
      .from('usuarios')
      .select('id,id_auth')
      .eq('id', agenteId)
      .maybeSingle()
    if (agenteLookupError) {
      return NextResponse.json({ error: agenteLookupError.message }, { status: 500 })
    }
    if (!agente || !agente.id_auth) {
      return NextResponse.json({ error: 'El agente no tiene id_auth registrado' }, { status: 404 })
    }
    agenteAuthId = agente.id_auth
  }

  if (actorIsAgente) {
    if (!actor.id_auth) {
      return NextResponse.json({ error: 'Tu usuario no tiene id_auth registrado' }, { status: 400 })
    }
    if (agenteAuthId && agenteAuthId !== actor.id_auth) {
      return NextResponse.json({ error: 'Solo puedes consultar tus propias citas' }, { status: 403 })
    }
    agenteAuthId = actor.id_auth
  }

  let query = supabase
    .from('citas')
    .select('id,prospecto_id,agente_id,supervisor_id,inicio,fin,meeting_url,meeting_provider,external_event_id,estado,created_at,updated_at')
    .order('inicio', { ascending: true })

  if (estadoParam === 'confirmada' || estadoParam === 'cancelada') {
    query = query.eq('estado', estadoParam)
  }
  if (agenteAuthId) {
    query = query.eq('agente_id', agenteAuthId)
  }
  if (desdeParam) {
    query = query.gte('inicio', desdeParam)
  }
  if (hastaParam) {
    query = query.lte('inicio', hastaParam)
  }
  const limit = limitParam ? Number(limitParam) : null
  if (limit && Number.isFinite(limit) && limit > 0) {
    query = query.limit(limit)
  }

  const { data: citas, error: citasError } = await query
  if (citasError) {
    return NextResponse.json({ error: citasError.message }, { status: 500 })
  }

  const authIds = new Set<string>()
  const prospectoIds = new Set<number>()
  for (const cita of citas || []) {
    if (cita.agente_id) authIds.add(cita.agente_id)
    if (cita.supervisor_id) authIds.add(cita.supervisor_id)
    if (typeof cita.prospecto_id === 'number') prospectoIds.add(cita.prospecto_id)
  }

  const usuariosMap = new Map<string, { id: number; email: string; nombre: string | null; id_auth: string | null }>()
  if (authIds.size > 0) {
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id,email,nombre,id_auth')
      .in('id_auth', Array.from(authIds))
    for (const usuario of usuarios || []) {
      if (usuario.id_auth) {
        usuariosMap.set(usuario.id_auth, {
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre ?? null,
          id_auth: usuario.id_auth ?? null
        })
      }
    }
  }

  const prospectosMap = new Map<number, string>()
  if (prospectoIds.size > 0) {
    const { data: prospectos } = await supabase
      .from('prospectos')
      .select('id,nombre')
      .in('id', Array.from(prospectoIds))
    for (const prospecto of prospectos || []) {
      if (prospecto?.id != null) {
        prospectosMap.set(prospecto.id, prospecto.nombre ?? null)
      }
    }
  }

  const result = (citas || []).map((cita) => {
    const agente = usuariosMap.get(cita.agente_id || '')
    const supervisor = cita.supervisor_id ? usuariosMap.get(cita.supervisor_id) : null

    const agentePayload: AgendaParticipant = {
      id: agente?.id ?? null,
      idAuth: cita.agente_id ?? null,
      email: agente?.email ?? null,
      nombre: agente?.nombre ?? null
    }

    const supervisorPayload: AgendaParticipant | null = cita.supervisor_id
      ? {
          id: supervisor?.id ?? null,
          idAuth: cita.supervisor_id ?? null,
          email: supervisor?.email ?? null,
          nombre: supervisor?.nombre ?? null
        }
      : null

    return {
      id: cita.id,
      prospectoId: cita.prospecto_id,
      prospectoNombre: cita.prospecto_id != null ? prospectosMap.get(cita.prospecto_id) ?? null : null,
      agente: agentePayload,
      supervisor: supervisorPayload,
      inicio: cita.inicio,
      fin: cita.fin,
      meetingUrl: cita.meeting_url,
      meetingProvider: cita.meeting_provider,
      externalEventId: cita.external_event_id,
      estado: cita.estado,
      createdAt: cita.created_at,
      updatedAt: cita.updated_at
    } as AgendaCita
  })

  return NextResponse.json({ citas: result })
}

export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const actorIsAgente = actor.rol === 'agente'
  if (!canManageAgenda(actor) && !actorIsAgente) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let payload: CreateCitaBody
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  let prospectoId: number | null = null
  if (payload.prospectoId !== undefined && payload.prospectoId !== null && payload.prospectoId !== '') {
    const parsedProspectoId = typeof payload.prospectoId === 'number'
      ? payload.prospectoId
      : Number(payload.prospectoId)
    if (!Number.isFinite(parsedProspectoId) || parsedProspectoId <= 0) {
      return NextResponse.json({ error: 'prospectoId inválido' }, { status: 400 })
    }
    prospectoId = parsedProspectoId
  }
  const agenteId = Number(payload.agenteId)
  const supervisorId = payload.supervisorId != null ? Number(payload.supervisorId) : null
  const inicioRaw = typeof payload.inicio === 'string' ? payload.inicio : ''
  const finRaw = typeof payload.fin === 'string' ? payload.fin : ''
  let meetingUrl = (payload.meetingUrl || '').trim()
  const provider = normalizeProvider(payload.meetingProvider)
  let externalEventId = payload.externalEventId ? String(payload.externalEventId) : null
  const generarEnlace = payload.generarEnlace ?? meetingUrl.length === 0

  if (!Number.isFinite(agenteId)) {
    return NextResponse.json({ error: 'agenteId inválido' }, { status: 400 })
  }
  if (supervisorId != null && !Number.isFinite(supervisorId)) {
    return NextResponse.json({ error: 'supervisorId inválido' }, { status: 400 })
  }
  if (!inicioRaw || !finRaw) {
    return NextResponse.json({ error: 'inicio y fin son obligatorios' }, { status: 400 })
  }
  if (meetingUrl && !/^https?:\/\//i.test(meetingUrl)) {
    return NextResponse.json({ error: 'meetingUrl debe iniciar con http(s)://' }, { status: 400 })
  }

  const inicioDate = new Date(inicioRaw)
  const finDate = new Date(finRaw)
  if (Number.isNaN(inicioDate.getTime()) || Number.isNaN(finDate.getTime())) {
    return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })
  }
  if (finDate <= inicioDate) {
    return NextResponse.json({ error: 'La hora de fin debe ser posterior al inicio' }, { status: 400 })
  }

  const inicioIso = inicioDate.toISOString()
  const finIso = finDate.toISOString()

  if (actorIsAgente) {
    if (!actor.id || !actor.id_auth) {
      return NextResponse.json({ error: 'No tienes los datos necesarios para agendar citas. Contacta a un administrador.' }, { status: 400 })
    }
    if (agenteId !== actor.id) {
      return NextResponse.json({ error: 'Solo puedes agendar citas para ti mismo' }, { status: 403 })
    }
  }

  const supabase = ensureAdminClient()

  const { data: agente, error: agenteError } = await supabase
    .from('usuarios')
    .select('id,id_auth,activo,email,nombre')
    .eq('id', agenteId)
    .maybeSingle()

  if (agenteError) {
    return NextResponse.json({ error: agenteError.message }, { status: 500 })
  }
  if (!agente) {
    return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 })
  }
  if (!agente.id_auth) {
    return NextResponse.json({ error: 'El agente no tiene id_auth registrado' }, { status: 400 })
  }
  if (agente.activo === false) {
    return NextResponse.json({ error: 'El agente está inactivo' }, { status: 400 })
  }

  let prospectoNombre = typeof payload.prospectoNombre === 'string' && payload.prospectoNombre.trim().length > 0
    ? payload.prospectoNombre.trim()
    : null

  if (prospectoId != null && !prospectoNombre) {
    try {
      const { data: prospecto, error: prospectoError } = await supabase
        .from('prospectos')
        .select('id,nombre')
        .eq('id', prospectoId)
        .maybeSingle()
      if (prospectoError) {
        return NextResponse.json({ error: prospectoError.message }, { status: 500 })
      }
      if (!prospecto) {
        return NextResponse.json({ error: 'Prospecto no encontrado' }, { status: 404 })
      }
      prospectoNombre = prospecto.nombre ?? null
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Error consultando prospecto' }, { status: 500 })
    }
  }

  let supervisorAuthId: string | null = null
  let supervisorRecord: { id: number; email: string; nombre: string | null; id_auth: string | null } | null = null
  if (supervisorId != null) {
    const { data: supervisor, error: supervisorError } = await supabase
      .from('usuarios')
      .select('id,id_auth,activo,email,nombre')
      .eq('id', supervisorId)
      .maybeSingle()
    if (supervisorError) {
      return NextResponse.json({ error: supervisorError.message }, { status: 500 })
    }
    if (!supervisor) {
      return NextResponse.json({ error: 'Supervisor no encontrado' }, { status: 404 })
    }
    if (!supervisor.id_auth) {
      return NextResponse.json({ error: 'El supervisor no tiene id_auth registrado' }, { status: 400 })
    }
    if (supervisor.activo === false) {
      return NextResponse.json({ error: 'El supervisor está inactivo' }, { status: 400 })
    }
    supervisorAuthId = supervisor.id_auth
    supervisorRecord = {
      id: supervisor.id,
      email: supervisor.email,
      nombre: supervisor.nombre ?? null,
      id_auth: supervisor.id_auth ?? null
    }
  }

  const { data: overlapAgente, error: overlapAgenteError } = await supabase
    .from('citas')
    .select('id')
    .eq('estado', 'confirmada')
    .eq('agente_id', agente.id_auth)
    .lt('inicio', finIso)
    .gt('fin', inicioIso)
    .limit(1)

  if (overlapAgenteError) {
    return NextResponse.json({ error: overlapAgenteError.message }, { status: 500 })
  }
  if (overlapAgente && overlapAgente.length > 0) {
    return NextResponse.json({ error: 'El agente ya tiene una cita en ese horario' }, { status: 409 })
  }

  if (supervisorAuthId) {
    const { data: overlapSupervisor, error: overlapSupervisorError } = await supabase
      .from('citas')
      .select('id')
      .eq('estado', 'confirmada')
      .eq('supervisor_id', supervisorAuthId)
      .lt('inicio', finIso)
      .gt('fin', inicioIso)
      .limit(1)

    if (overlapSupervisorError) {
      return NextResponse.json({ error: overlapSupervisorError.message }, { status: 500 })
    }
    if (overlapSupervisor && overlapSupervisor.length > 0) {
      return NextResponse.json({ error: 'El supervisor ya tiene una cita en ese horario' }, { status: 409 })
    }
  }

  if (generarEnlace) {
    if (provider === 'google_meet') {
      const attendees = Array.from(new Set([
        agente.email || null,
        supervisorRecord?.email || null,
        actor.email || null
      ].filter((value): value is string => Boolean(value && value.includes('@')))))

      const summary = prospectoNombre ? `Cita con ${prospectoNombre}` : 'Cita agenda Lealtia'
      const descriptionParts: string[] = []
      if (payload.notas && payload.notas.trim().length > 0) {
        descriptionParts.push(payload.notas.trim())
      }
      if (prospectoNombre) {
        descriptionParts.push(`Prospecto: ${prospectoNombre}`)
      }
      if (actor.email) {
        descriptionParts.push(`Programada por: ${actor.email}`)
      }

      try {
        const remote = await createRemoteMeeting({
          usuarioAuthId: agente.id_auth,
          provider,
          start: inicioIso,
          end: finIso,
          summary,
          description: descriptionParts.length ? descriptionParts.join('\n\n') : null,
          attendees,
          timezone: process.env.AGENDA_TZ || null
        })
        meetingUrl = remote.meetingUrl
        externalEventId = remote.externalEventId
        try {
          await supabase.from('logs_integracion').insert({
            usuario_id: agente.id_auth,
            proveedor: provider,
            operacion: 'create_cita',
            nivel: 'info',
            detalle: {
              inicio: inicioIso,
              fin: finIso,
              meetingUrl,
              external_event_id: externalEventId,
              attendees
            }
          })
        } catch {}
      } catch (err) {
        try {
          await supabase.from('logs_integracion').insert({
            usuario_id: agente.id_auth,
            proveedor: provider,
            operacion: 'create_cita',
            nivel: 'error',
            detalle: {
              inicio: inicioIso,
              fin: finIso,
              error: err instanceof Error ? err.message : String(err)
            }
          })
        } catch {}
        return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo generar el enlace de la reunión' }, { status: 502 })
      }
    } else {
      return NextResponse.json({ error: 'La generación automática solo está disponible para Google Meet' }, { status: 400 })
    }
  }

  if (!meetingUrl) {
    return NextResponse.json({ error: 'meetingUrl es obligatorio' }, { status: 400 })
  }

  const insert = {
    prospecto_id: prospectoId,
    agente_id: agente.id_auth,
    supervisor_id: supervisorAuthId,
    inicio: inicioIso,
    fin: finIso,
    meeting_url: meetingUrl,
    meeting_provider: provider,
    external_event_id: externalEventId,
    estado: 'confirmada' as const
  }

  const { data: created, error: createError } = await supabase
    .from('citas')
    .insert(insert)
    .select('*')
    .maybeSingle()

  if (createError || !created) {
    return NextResponse.json({ error: createError ? createError.message : 'No se pudo crear la cita' }, { status: 500 })
  }

  if (prospectoId != null) {
    try {
      await supabase
        .from('prospectos')
        .update({ cita_creada: true, fecha_cita: inicioIso })
        .eq('id', prospectoId)
    } catch {}
  }

  if (agente.email) {
    const ccList = [supervisorRecord?.email, actor.email].filter((value): value is string => Boolean(value && value !== agente.email))
    try {
      const { subject, html, text } = buildCitaConfirmacionEmail({
        nombreAgente: agente.nombre || agente.email,
        emailAgente: agente.email,
        inicio: created.inicio,
        fin: created.fin,
        meetingUrl: created.meeting_url,
        meetingProvider: created.meeting_provider,
        nombreProspecto: prospectoNombre,
        supervisorNombre: supervisorRecord?.nombre || null,
        solicitante: actor.email || null,
        timezone: process.env.AGENDA_TZ || null
      })
      await sendMail({ to: agente.email, subject, html, text, cc: ccList.length ? ccList : undefined })
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agente.id_auth,
          proveedor: 'mailer',
          operacion: 'cita_confirmacion',
          nivel: 'info',
          detalle: {
            citaId: created.id,
            to: agente.email,
            cc: ccList,
            supervisor: supervisorRecord?.email || null
          }
        })
      } catch {}
    } catch (err) {
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agente.id_auth,
          proveedor: 'mailer',
          operacion: 'cita_confirmacion',
          nivel: 'error',
          detalle: {
            citaId: created.id,
            to: agente.email,
            error: err instanceof Error ? err.message : String(err)
          }
        })
      } catch {}
    }
  }

  try {
    await logAccion('crear_cita', {
      usuario: actor.email,
      tabla_afectada: 'citas',
      id_registro: created.id,
      snapshot: {
        prospecto_id: created.prospecto_id,
        agente_id: created.agente_id,
        supervisor_id: created.supervisor_id,
        inicio: created.inicio,
        fin: created.fin,
        provider
      }
    })
  } catch {}

  return NextResponse.json({ cita: created })
}
