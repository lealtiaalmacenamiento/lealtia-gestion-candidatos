import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { logAccion } from '@/lib/logger'
import { createRemoteMeeting } from '@/lib/agendaProviders'
import { getZoomManualSettings, getTeamsManualSettings } from '@/lib/zoomManual'
import type { MeetingProvider, AgendaCita, AgendaParticipant, ManualMeetingSettings } from '@/types'
import { syncPlanificacionCita } from './planificacionSync'
import { sendMail } from '@/lib/mailer'

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
  prospectoEmail?: string | null
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

  const prospectosMap = new Map<number, { nombre: string | null; email: string | null }>()
  if (prospectoIds.size > 0) {
    const { data: prospectos } = await supabase
      .from('prospectos')
      .select('id,nombre,email')
      .in('id', Array.from(prospectoIds))
    for (const prospecto of prospectos || []) {
      if (prospecto?.id != null) {
        prospectosMap.set(prospecto.id, {
          nombre: prospecto.nombre ?? null,
          email: prospecto.email ?? null
        })
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
  prospectoNombre: cita.prospecto_id != null ? prospectosMap.get(cita.prospecto_id)?.nombre ?? null : null,
  prospectoEmail: cita.prospecto_id != null ? prospectosMap.get(cita.prospecto_id)?.email ?? null : null,
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

async function createAgendaCitaHandler(req: Request) {
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
  const notas = typeof payload.notas === 'string' && payload.notas.trim().length > 0 ? payload.notas.trim() : null

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

  let googleMeetAutoEnabled = true
  let googleIntegrationRecord: { scopes: string[] | null } | null = null
  if (agente.id_auth) {
    try {
      const { data: googleToken } = await supabase
        .from('tokens_integracion')
        .select('scopes')
        .eq('usuario_id', agente.id_auth)
        .eq('proveedor', 'google')
        .maybeSingle()
      if (googleToken) {
        googleIntegrationRecord = { scopes: googleToken.scopes ?? null }
        if (Array.isArray(googleToken.scopes)) {
          googleMeetAutoEnabled = !googleToken.scopes.includes('auto_meet_disabled')
        }
      }
    } catch {}
  }

  let prospectoNombre = typeof payload.prospectoNombre === 'string' && payload.prospectoNombre.trim().length > 0
    ? payload.prospectoNombre.trim()
    : null
  let prospectoEmail = typeof payload.prospectoEmail === 'string' && payload.prospectoEmail.includes('@')
    ? payload.prospectoEmail.trim()
    : null

  if (prospectoId != null && (!prospectoNombre || !prospectoEmail)) {
    try {
      const { data: prospecto, error: prospectoError } = await supabase
        .from('prospectos')
        .select('id,nombre,email')
        .eq('id', prospectoId)
        .maybeSingle()
      if (prospectoError) {
        return NextResponse.json({ error: prospectoError.message }, { status: 500 })
      }
      if (!prospecto) {
        return NextResponse.json({ error: 'Prospecto no encontrado' }, { status: 404 })
      }
      if (!prospectoNombre) {
        prospectoNombre = prospecto.nombre ?? null
      }
      if (!prospectoEmail && prospecto.email && prospecto.email.includes('@')) {
        prospectoEmail = prospecto.email
      }
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Error consultando prospecto' }, { status: 500 })
    }
  }

  let manualMeetingSettings: ManualMeetingSettings | null = null
  let meetingIdForEmail: string | null = null
  let meetingPasswordForEmail: string | null = null

  if (provider === 'zoom' || provider === 'teams') {
    if (!googleIntegrationRecord) {
      return NextResponse.json({ error: 'Conecta Google Calendar en Integraciones antes de agendar sesiones de Zoom o Teams.' }, { status: 400 })
    }
    try {
      const manualResult = provider === 'zoom'
        ? await getZoomManualSettings(agente.id_auth)
        : await getTeamsManualSettings(agente.id_auth)
      if (manualResult.error) {
        return NextResponse.json({ error: manualResult.error.message || 'No se pudo obtener la configuración de la sesión.' }, { status: 500 })
      }
      manualMeetingSettings = manualResult.settings
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo consultar la configuración de la sesión.' }, { status: 500 })
    }
    if (!manualMeetingSettings || !manualMeetingSettings.meetingUrl) {
      const message = provider === 'zoom'
        ? 'Configura tu enlace personal de Zoom desde Integraciones antes de crear la cita.'
        : 'Configura tu enlace de Teams desde Integraciones antes de crear la cita.'
      return NextResponse.json({ error: message }, { status: 400 })
    }
    meetingUrl = manualMeetingSettings.meetingUrl
    meetingIdForEmail = manualMeetingSettings.meetingId ?? null
    meetingPasswordForEmail = manualMeetingSettings.meetingPassword ?? null
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

  const attendees = Array.from(new Set([
    agente.email || null,
    supervisorRecord?.email || null,
    actor.email || null,
    prospectoEmail || null
  ].filter((value): value is string => Boolean(value && value.includes('@')))))

  const summary = prospectoNombre ? `Cita con ${prospectoNombre}` : 'Cita agenda Lealtia'
  const baseDescriptionParts: string[] = []
  if (notas) {
    baseDescriptionParts.push(notas)
  }
  if (prospectoNombre) {
    baseDescriptionParts.push(`Prospecto: ${prospectoNombre}`)
  }
  if (actor.email) {
    baseDescriptionParts.push(`Programada por: ${actor.email}`)
  }

  if (generarEnlace) {
    if (provider === 'google_meet') {
      if (!googleMeetAutoEnabled) {
        return NextResponse.json({ error: 'La generación automática de enlaces está deshabilitada para este agente. Ingresa un enlace manual.' }, { status: 400 })
      }
      const descriptionParts = [...baseDescriptionParts]

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
  meetingUrl = remote.meetingUrl || ''
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

  if (provider === 'zoom' || provider === 'teams') {
    const descriptionParts = [...baseDescriptionParts]
    descriptionParts.push(`Plataforma: ${provider === 'zoom' ? 'Zoom' : 'Microsoft Teams'}`)
    if (meetingUrl) {
      descriptionParts.push(`Enlace: ${meetingUrl}`)
    }
    if (meetingIdForEmail) {
      descriptionParts.push(`ID de sesión: ${meetingIdForEmail}`)
    }
    if (meetingPasswordForEmail) {
      descriptionParts.push(`Contraseña: ${meetingPasswordForEmail}`)
    }

    try {
      const remote = await createRemoteMeeting({
        usuarioAuthId: agente.id_auth,
        provider: 'google_meet',
        start: inicioIso,
        end: finIso,
        summary,
        description: descriptionParts.length ? descriptionParts.join('\n\n') : null,
        attendees,
        timezone: process.env.AGENDA_TZ || null,
        conferenceMode: 'none',
        location: meetingUrl
      })
      externalEventId = remote.externalEventId
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agente.id_auth,
          proveedor: 'google_meet',
          operacion: 'create_cita',
          nivel: 'info',
          detalle: {
            inicio: inicioIso,
            fin: finIso,
            meeting_provider: provider,
            external_event_id: externalEventId,
            attendees
          }
        })
      } catch {}
    } catch (err) {
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agente.id_auth,
          proveedor: 'google_meet',
          operacion: 'create_cita',
          nivel: 'error',
          detalle: {
            inicio: inicioIso,
            fin: finIso,
            meeting_provider: provider,
            error: err instanceof Error ? err.message : String(err)
          }
        })
      } catch {}
      return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo registrar la sesión en Google Calendar' }, { status: 502 })
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
      const updatePayload: Record<string, unknown> = {
        cita_creada: true,
        fecha_cita: inicioIso,
        estado: 'con_cita'
      }
      if (prospectoEmail) {
        updatePayload.email = prospectoEmail
      }
      await supabase
        .from('prospectos')
        .update(updatePayload)
        .eq('id', prospectoId)
    } catch {}
  }

  try {
    await syncPlanificacionCita({
      supabase,
      agenteId,
      inicioIso,
      prospectoId,
      prospectoNombre,
      citaId: created.id,
      notas
    })
  } catch {}

  let developerRecipients: string[] = []
  if (!supervisorRecord) {
    try {
      const { data: developers } = await supabase
        .from('usuarios')
        .select('email')
        .eq('is_desarrollador', true)
        .eq('activo', true)
      developerRecipients = (developers || [])
        .map((row) => (typeof row?.email === 'string' && row.email.includes('@') ? row.email : null))
        .filter((email): email is string => Boolean(email && email !== agente.email))
    } catch {}
  }

  if (developerRecipients.length > 0) {
    const toList = Array.from(new Set(developerRecipients))
    const agenteLabel = agente.nombre || agente.email
    const timezone = process.env.AGENDA_TZ || 'America/Mexico_City'
    const formatDateTime = (iso: string) => {
      try {
        return new Intl.DateTimeFormat('es-MX', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: timezone
        }).format(new Date(iso))
      } catch {
        return iso
      }
    }
    const inicioLocal = formatDateTime(created.inicio)
    const finLocal = formatDateTime(created.fin)
    const providerLabel = created.meeting_provider === 'zoom'
      ? 'Zoom'
      : created.meeting_provider === 'teams'
        ? 'Microsoft Teams'
        : 'Google Meet'
    const subject = `Aviso: ${agenteLabel} agendó una cita sin supervisor`
    const htmlSections = [
      `<p>Hola equipo de desarrollo,</p>`,
      `<p>${agenteLabel} (${agente.email}) agendó una cita sin supervisor. Aquí están los detalles disponibles:</p>`,
      '<ul>',
      `<li><strong>Prospecto:</strong> ${prospectoNombre || 'Sin nombre registrado'}</li>`,
      `<li><strong>Correo del prospecto:</strong> ${prospectoEmail || 'Sin correo capturado'}</li>`,
      `<li><strong>Horario:</strong> ${inicioLocal} - ${finLocal}</li>`,
      `<li><strong>Zona horaria:</strong> ${timezone}</li>`,
      `<li><strong>Plataforma:</strong> ${providerLabel}</li>`,
      `<li><strong>Enlace:</strong> <a href="${created.meeting_url}">${created.meeting_url}</a></li>`,
      meetingIdForEmail ? `<li><strong>ID de sesión:</strong> ${meetingIdForEmail}</li>` : '',
      meetingPasswordForEmail ? `<li><strong>Contraseña:</strong> ${meetingPasswordForEmail}</li>` : '',
      actor.email ? `<li><strong>Solicitud registrada por:</strong> ${actor.email}</li>` : '',
      notas ? `<li><strong>Notas:</strong> ${notas}</li>` : '',
      '</ul>',
      '<p>Revisen si necesitan asignar supervisor o tomar alguna acción adicional.</p>',
      '<p>Gracias.</p>'
    ].filter(Boolean)
    const html = htmlSections.join('\n')
    const textLines = [
      'Hola equipo de desarrollo,',
      `${agenteLabel} (${agente.email}) agendó una cita sin supervisor.`,
      '',
      `Prospecto: ${prospectoNombre || 'Sin nombre registrado'}`,
      `Correo del prospecto: ${prospectoEmail || 'Sin correo capturado'}`,
      `Horario: ${inicioLocal} - ${finLocal}`,
      `Zona horaria: ${timezone}`,
      `Plataforma: ${providerLabel}`,
      `Enlace: ${created.meeting_url}`,
      meetingIdForEmail ? `ID de sesión: ${meetingIdForEmail}` : null,
      meetingPasswordForEmail ? `Contraseña: ${meetingPasswordForEmail}` : null,
      actor.email ? `Solicitud registrada por: ${actor.email}` : null,
      notas ? `Notas: ${notas}` : null,
      '',
      'Revisen si necesitan asignar supervisor o tomar alguna acción adicional.',
      'Gracias.'
    ].filter(Boolean) as string[]
    const text = textLines.join('\n')
    try {
      await sendMail({ to: toList.join(','), subject, html, text })
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agente.id_auth,
          proveedor: 'mailer',
          operacion: 'cita_confirmacion_desarrolladores',
          nivel: 'info',
          detalle: {
            citaId: created.id,
            to: toList,
            motivo: 'sin_supervisor'
          }
        })
      } catch {}
    } catch (err) {
      try {
        await supabase.from('logs_integracion').insert({
          usuario_id: agente.id_auth,
          proveedor: 'mailer',
          operacion: 'cita_confirmacion_desarrolladores',
          nivel: 'error',
          detalle: {
            citaId: created.id,
            to: developerRecipients,
            error: err instanceof Error ? err.message : String(err),
            motivo: 'sin_supervisor'
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

  const citaResponse: AgendaCita = {
    id: created.id,
    prospectoId: created.prospecto_id ?? null,
    prospectoNombre,
    prospectoEmail,
    agente: {
      id: agente.id,
      idAuth: created.agente_id ?? agente.id_auth ?? null,
      email: agente.email ?? null,
      nombre: agente.nombre ?? null
    },
    supervisor: supervisorAuthId
      ? {
          id: supervisorRecord?.id ?? null,
          idAuth: created.supervisor_id ?? supervisorAuthId,
          email: supervisorRecord?.email ?? null,
          nombre: supervisorRecord?.nombre ?? null
        }
      : null,
    inicio: created.inicio,
    fin: created.fin,
    meetingUrl: created.meeting_url,
    meetingProvider: created.meeting_provider,
    externalEventId: created.external_event_id ?? null,
    estado: created.estado,
    createdAt: created.created_at ?? null,
    updatedAt: created.updated_at ?? null
  }

  return NextResponse.json({ cita: citaResponse })
}

export async function POST(req: Request) {
  try {
    return await createAgendaCitaHandler(req)
  } catch (err) {
    console.error('[agenda][citas] Error inesperado al crear la cita:', err)
    const message = err instanceof Error ? err.message : 'Error inesperado al crear la cita'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
