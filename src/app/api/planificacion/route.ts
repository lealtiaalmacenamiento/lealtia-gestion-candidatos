import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso, semanaDesdeNumero } from '@/lib/semanaIso'
import type { BloquePlanificacion } from '@/types'
import { logAccion } from '@/lib/logger'
import { sendMail, buildFelicitacionCitasEmail, buildFelicitacionSemanaCitasEmail } from '@/lib/mailer'
import { cancelAgendaCitaCascade } from '../agenda/citas/cancel/cascade'
import { planificacionMetaFromIso } from '../agenda/citas/planificacionSync'
import { getCalcomApiKey, resolveCalcomBookingChain } from '@/lib/integrations/calcom'




const supabase = getServiceClient()

async function reconcileAutoCitas<T extends { id?: number | string | null; bloques?: unknown }>(
  payload: T,
  agenteId: number,
  semana: number,
  anio: number
): Promise<T> {
  const bloques = Array.isArray(payload.bloques) ? (payload.bloques as BloquePlanificacion[]) : []
  const existingAutoByCita = new Map<number, BloquePlanificacion>()
  for (const block of bloques) {
    if (block?.origin === 'auto' && block.activity === 'CITAS' && block.agenda_cita_id != null) {
      existingAutoByCita.set(Number(block.agenda_cita_id), block)
    }
  }
  const agendaCitaIds = Array.from(existingAutoByCita.keys())
    .filter((value) => Number.isFinite(value) && value > 0)

  const spCitaIds = Array.from(new Set(
    bloques
      .filter((block) => block?.origin === 'auto' && block.activity === 'CITAS' && block.sp_cita_id)
      .map((block) => String(block.sp_cita_id))
  ))

  const activeSpIds = new Set<string>()
  if (spCitaIds.length) {
    const { data: citas } = await supabase
      .from('sp_citas')
      .select('id,estado')
      .in('id', spCitaIds)
    for (const cita of citas || []) {
      if (cita.estado !== 'cancelada') activeSpIds.add(String(cita.id))
    }
  }

  const preservedBlocks = bloques.filter((block) => {
    if (block?.origin !== 'auto' || block.activity !== 'CITAS') return true
    if (block.agenda_cita_id != null) return false
    if (block.sp_cita_id) return activeSpIds.has(String(block.sp_cita_id))
    return false
  })

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id_auth')
    .eq('id', agenteId)
    .maybeSingle()
  const authId = usuario?.id_auth
  if (!authId && agendaCitaIds.length === 0) {
    const cleaned = { ...payload, bloques: preservedBlocks }
    if (preservedBlocks.length !== bloques.length && payload.id != null) {
      await supabase
        .from('planificaciones')
        .update({ bloques: preservedBlocks, updated_at: new Date().toISOString() })
        .eq('id', payload.id)
    }
    return cleaned
  }

  const week = semanaDesdeNumero(anio, semana)
  const queryStart = new Date(week.inicio)
  queryStart.setUTCDate(queryStart.getUTCDate() - 1)
  const queryEnd = new Date(week.fin)
  queryEnd.setUTCDate(queryEnd.getUTCDate() + 2)

  const citasById = new Map<number, {
    id: number
    prospecto_id: number | null
    inicio: string
    fin: string | null
    estado: string | null
    meeting_provider?: string | null
    meeting_url?: string | null
    external_event_id?: string | null
  }>()

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const agenteLookupValues = Array.from(new Set([
    authId ? String(authId) : null
  ].filter((value): value is string => Boolean(value && uuidPattern.test(value)))))

  if (agenteLookupValues.length) {
    const { data: citasPorRango } = await supabase
      .from('citas')
      .select('id,prospecto_id,inicio,fin,estado,meeting_provider,meeting_url,external_event_id')
      .in('agente_id', agenteLookupValues)
      .neq('estado', 'cancelada')
      .gte('inicio', queryStart.toISOString())
      .lt('inicio', queryEnd.toISOString())
    for (const cita of citasPorRango || []) {
      citasById.set(Number(cita.id), {
        id: Number(cita.id),
        prospecto_id: cita.prospecto_id != null ? Number(cita.prospecto_id) : null,
        inicio: cita.inicio,
        fin: cita.fin ?? null,
        estado: cita.estado ?? null,
        meeting_provider: cita.meeting_provider ?? null,
        meeting_url: cita.meeting_url ?? null,
        external_event_id: cita.external_event_id ?? null
      })
    }
  }

  if (agendaCitaIds.length) {
    const { data: citasPorId } = await supabase
      .from('citas')
      .select('id,prospecto_id,inicio,fin,estado,meeting_provider,meeting_url,external_event_id')
      .in('id', agendaCitaIds)
      .neq('estado', 'cancelada')
    for (const cita of citasPorId || []) {
      citasById.set(Number(cita.id), {
        id: Number(cita.id),
        prospecto_id: cita.prospecto_id != null ? Number(cita.prospecto_id) : null,
        inicio: cita.inicio,
        fin: cita.fin ?? null,
        estado: cita.estado ?? null,
        meeting_provider: cita.meeting_provider ?? null,
        meeting_url: cita.meeting_url ?? null,
        external_event_id: cita.external_event_id ?? null
      })
    }
  }

  if (authId) {
    await reconcileCalcomRemoteState(citasById, authId)
  }

  const citas = Array.from(citasById.values())

  const prospectoIds = Array.from(new Set(
    citas
      .map((cita) => cita.prospecto_id != null ? Number(cita.prospecto_id) : null)
      .filter((value): value is number => value != null && Number.isFinite(value))
  ))
  const prospectos = new Map<number, { nombre?: string | null; estado?: string | null }>()
  if (prospectoIds.length) {
    const { data: rows } = await supabase
      .from('prospectos')
      .select('id,nombre,estado')
      .in('id', prospectoIds)
    for (const row of rows || []) {
      prospectos.set(Number(row.id), { nombre: row.nombre ?? null, estado: row.estado ?? null })
    }
  }

  const autoBlocks: BloquePlanificacion[] = []
  for (const cita of citas) {
    const meta = planificacionMetaFromIso(cita.inicio)
    if (!meta || meta.anio !== anio || meta.semana !== semana) continue
    const endMeta = cita.fin ? planificacionMetaFromIso(cita.fin) : null
    const existing = existingAutoByCita.get(Number(cita.id))
    const prospectoId = cita.prospecto_id != null ? Number(cita.prospecto_id) : null
    const prospecto = prospectoId != null ? prospectos.get(prospectoId) : null
    autoBlocks.push({
      day: meta.day,
      hour: meta.hour,
      activity: 'CITAS',
      origin: 'auto',
      prospecto_id: prospectoId ?? undefined,
      prospecto_nombre: prospecto?.nombre ?? existing?.prospecto_nombre,
      prospecto_estado: (prospecto?.estado as BloquePlanificacion['prospecto_estado']) ?? existing?.prospecto_estado ?? 'con_cita',
      notas: existing?.notas ?? undefined,
      confirmada: existing?.confirmada ?? false,
      agenda_cita_id: Number(cita.id),
      inicio_iso: cita.inicio,
      fin_iso: cita.fin ?? null,
      hora_inicio: meta.time,
      hora_fin: endMeta?.time ?? null
    })
  }

  const nextBlocks = [...preservedBlocks, ...autoBlocks]
  const changed = JSON.stringify(nextBlocks) !== JSON.stringify(bloques)
  if (!changed) return payload
  const cleaned = { ...payload, bloques: nextBlocks }
  if (payload.id != null) {
    await supabase
      .from('planificaciones')
      .update({ bloques: nextBlocks, updated_at: new Date().toISOString() })
      .eq('id', payload.id)
  }
  return cleaned
}

async function reconcileCalcomRemoteState(
  citasById: Map<number, {
    id: number
    prospecto_id: number | null
    inicio: string
    fin: string | null
    estado: string | null
    meeting_provider?: string | null
    meeting_url?: string | null
    external_event_id?: string | null
  }>,
  agenteAuthId: string
) {
  const calCitas = Array.from(citasById.values())
    .filter((cita) => cita.meeting_provider === 'calcom' && cita.external_event_id)
  if (!calCitas.length) return

  let apiKey: string | null = null
  try {
    apiKey = await getCalcomApiKey(agenteAuthId)
  } catch (error) {
    await logCalcomReconcileError(agenteAuthId, null, error)
    return
  }
  if (!apiKey) return

  for (const cita of calCitas) {
    const originalUid = cita.external_event_id!
    try {
      const resolved = await resolveCalcomBookingChain(apiKey, originalUid)
      const chain = resolved.chain.length ? resolved.chain : [originalUid]
      if (resolved.status === 'cancelled') {
        await supabase
          .from('citas')
          .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
          .eq('id', cita.id)
        if (cita.prospecto_id != null) {
          await supabase
            .from('prospectos')
            .update({ cita_creada: false, fecha_cita: null, estado: 'seguimiento', updated_at: new Date().toISOString() })
            .eq('id', cita.prospecto_id)
        }
        await supabase
          .from('questionnaire_submissions')
          .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
          .in('cal_booking_uid', chain)
        citasById.delete(cita.id)
        await supabase.from('logs_integracion').insert({
          usuario_id: agenteAuthId,
          proveedor: 'calcom',
          operacion: 'planificacion_reconcile_cancelled',
          nivel: 'info',
          detalle: {
            citaId: cita.id,
            originalUid,
            chain,
            finalUid: resolved.booking?.uid ?? null,
            finalStatus: resolved.booking?.status ?? null
          }
        })
        continue
      }

      const booking = resolved.booking
      if (!booking || resolved.status === 'missing') continue

      const nextUid = booking.uid || originalUid
      const nextStart = booking.start || cita.inicio
      const nextEnd = booking.end || cita.fin
      const nextUrl = booking.meetingUrl || booking.location || cita.meeting_url || null
      const changed =
        nextUid !== originalUid ||
        !sameInstant(nextStart, cita.inicio) ||
        !sameInstant(nextEnd, cita.fin)

      if (changed) {
        await supabase
          .from('citas')
          .update({
            external_event_id: nextUid,
            inicio: nextStart,
            fin: nextEnd,
            meeting_url: nextUrl,
            estado: 'confirmada',
            updated_at: new Date().toISOString()
          })
          .eq('id', cita.id)
        await supabase
          .from('questionnaire_submissions')
          .update({
            estado: 'cita_agendada',
            cal_booking_uid: nextUid,
            booking_start: nextStart,
            booking_end: nextEnd,
            updated_at: new Date().toISOString()
          })
          .eq('cal_booking_uid', originalUid)
        citasById.set(cita.id, {
          ...cita,
          external_event_id: nextUid,
          inicio: nextStart,
          fin: nextEnd,
          meeting_url: nextUrl,
          estado: 'confirmada'
        })
        await supabase.from('logs_integracion').insert({
          usuario_id: agenteAuthId,
          proveedor: 'calcom',
          operacion: 'planificacion_reconcile_rescheduled',
          nivel: 'info',
          detalle: {
            citaId: cita.id,
            originalUid,
            finalUid: nextUid,
            chain,
            inicio: nextStart,
            fin: nextEnd
          }
        })
      }
    } catch (error) {
      await logCalcomReconcileError(agenteAuthId, originalUid, error)
    }
  }
}

function sameInstant(a?: string | null, b?: string | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  const left = new Date(a).getTime()
  const right = new Date(b).getTime()
  if (Number.isNaN(left) || Number.isNaN(right)) return a === b
  return left === right
}

async function logCalcomReconcileError(
  agenteAuthId: string,
  bookingUid: string | null,
  error: unknown
) {
  try {
    await supabase.from('logs_integracion').insert({
      usuario_id: agenteAuthId,
      proveedor: 'calcom',
      operacion: 'planificacion_reconcile_error',
      nivel: 'error',
      detalle: {
        bookingUid,
        error: error instanceof Error ? error.message : String(error)
      }
    })
  } catch {}
}

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const semana = Number(url.searchParams.get('semana')) || undefined
  const anio = Number(url.searchParams.get('anio')) || undefined
  let agenteId = Number(url.searchParams.get('agente_id')) || undefined
  
  // Si es agente, forzar su propio ID
  if (usuario.rol === 'agente') {
    if (!usuario.id || !Number.isFinite(usuario.id)) {
      console.error('[planificacion][GET] Agente sin ID válido', { usuario: usuario.email, usuarioId: usuario.id })
      return NextResponse.json({ error: 'Tu usuario no tiene un ID válido. Contacta al administrador.' }, { status: 400 })
    }
    agenteId = usuario.id
  }
  
  if (!agenteId) {
    console.error('[planificacion][GET] agente_id requerido', { usuarioId: usuario.id, rol: usuario.rol, queryAgenteId: url.searchParams.get('agente_id') })
    return NextResponse.json({ error: 'agente_id requerido (solo supervisor puede especificarlo)' }, { status: 400 })
  }
  const w = obtenerSemanaIso(new Date())
  const semanaQ = semana || w.semana
  const anioQ = anio || w.anio
  const { data, error } = await supabase.from('planificaciones').select('*').eq('agente_id', agenteId).eq('semana_iso', semanaQ).eq('anio', anioQ).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const payload = await reconcileAutoCitas(
    data || { bloques: [], agente_id: agenteId, semana_iso: semanaQ, anio: anioQ, prima_anual_promedio: 30000, porcentaje_comision: 35 },
    agenteId,
    semanaQ,
    anioQ
  )
  try {
  const ua = req.headers.get('user-agent') || ''
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  await logAccion('lectura_planificacion', { usuario: usuario.email, tabla_afectada: 'planificaciones', snapshot: { meta: { actor_email: usuario.email, actor_rol: usuario.rol, target_agente_id: agenteId, semana_iso: semanaQ, anio: anioQ, ip, ua } } })
  } catch {}
  return NextResponse.json(payload)
}

export async function POST(req: Request) {



  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json()
  let agente_id: number = body.agente_id
  
  // Si es agente, forzar su propio ID
  if (usuario.rol === 'agente') {
    if (!usuario.id || !Number.isFinite(usuario.id)) {
      console.error('[planificacion][POST] Agente sin ID válido', { usuario: usuario.email, usuarioId: usuario.id })
      return NextResponse.json({ error: 'Tu usuario no tiene un ID válido. Contacta al administrador.' }, { status: 400 })
    }
    agente_id = usuario.id
  }
  
  if (!agente_id) return NextResponse.json({ error: 'agente_id requerido' }, { status: 400 })
  const semana_iso: number = body.semana_iso
  const anio: number = body.anio
  const ua = req.headers.get('user-agent') || ''
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
  // Siempre persistimos todos los bloques (manuales y auto)
  const isBloque = (b: unknown): b is BloquePlanificacion => {
    if (!b || typeof b !== 'object') return false
    const obj = b as Record<string, unknown>
    return typeof obj.day === 'number' && typeof obj.hour === 'string' && typeof obj.activity === 'string'
  }
  let previousPlanBlocks: BloquePlanificacion[] = []
  try {
    const { data: previousPlan, error: previousError } = await supabase
      .from('planificaciones')
      .select('bloques')
      .eq('agente_id', agente_id)
      .eq('semana_iso', semana_iso)
      .eq('anio', anio)
      .maybeSingle()
    if (previousError) {
      return NextResponse.json({ error: previousError.message, detalle: 'fetch_planificacion_actual' }, { status: 500 })
    }
    if (previousPlan && Array.isArray(previousPlan.bloques)) {
      previousPlanBlocks = previousPlan.bloques.filter(isBloque)
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo consultar la planificación actual' }, { status: 500 })
  }

  // Persistimos todos los bloques tal como fueron enviados
  const bloquesAll: BloquePlanificacion[] = Array.isArray(body.bloques) ? body.bloques.filter(isBloque) : []
  const bloques: BloquePlanificacion[] = bloquesAll
  const prima = Number(body.prima_anual_promedio) || 30000
  const comision = Number(body.porcentaje_comision) || 35
  const upsert = { agente_id, semana_iso, anio, bloques, prima_anual_promedio: prima, porcentaje_comision: comision, updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from('planificaciones').upsert(upsert, { onConflict: 'agente_id,anio,semana_iso' }).select().maybeSingle()
  if (error) return NextResponse.json({ error: error.message, detalle: 'upsert_planificacion' }, { status: 500 })
  const result = { ...(data||upsert), debug: { enviados_total: bloquesAll.length, persistidos: bloques.length } }
  try {
    const snapshot = { meta: { actor_email: usuario.email, actor_rol: usuario.rol, target_agente_id: agente_id, semana_iso, anio, ip, ua }, data: result }
    await logAccion('upsert_planificacion', { usuario: usuario.email, tabla_afectada: 'planificaciones', id_registro: Number((data as { id?: number })?.id || 0), snapshot })
    if (usuario.rol !== 'agente' && usuario.id !== agente_id) {
      // Log explícito cuando alguien con rol elevado edita la planificación de otro agente
      await logAccion('superuser_upsert_planificacion', { usuario: usuario.email, tabla_afectada: 'planificaciones', id_registro: Number((data as { id?: number })?.id || 0), snapshot })
    }
  } catch {}
  const previousCitaIds = new Set<number>(
    previousPlanBlocks
      .filter((block) => block.activity === 'CITAS' && block.agenda_cita_id != null)
      .map((block) => Number(block.agenda_cita_id))
      .filter((value) => Number.isFinite(value) && value > 0)
  )
  const currentCitaIds = new Set<number>(
    bloques
      .filter((block) => block.activity === 'CITAS' && block.agenda_cita_id != null)
      .map((block) => Number(block.agenda_cita_id))
      .filter((value) => Number.isFinite(value) && value > 0)
  )

  const cancelledFromPlan: number[] = []
  const cancellationErrors: Array<{ citaId: number; error: string }> = []

  for (const citaId of previousCitaIds) {
    if (!currentCitaIds.has(citaId)) {
      const cancelResult = await cancelAgendaCitaCascade({
        citaId,
        actor: {
          id: usuario.id ?? null,
          id_auth: usuario.id_auth ?? null,
          email: usuario.email ?? null,
          rol: usuario.rol ?? null,
          is_desarrollador: usuario.is_desarrollador ?? null
        },
        origin: 'planificacion',
        motivo: null,
        supabase
      })
      if (!cancelResult.success) {
        cancellationErrors.push({ citaId, error: cancelResult.error || 'Error desconocido' })
      } else if (!cancelResult.alreadyCancelled) {
        cancelledFromPlan.push(citaId)
      }
    }
  }

  // --- Trigger correo si hay 2+ citas confirmadas en un día ---
  const citasConfirmadas: Record<number, number> = {};
  for (const b of bloques) {
    if ((b.activity === 'SMNYL' || b.activity === 'CITAS') && b.confirmada) {
      citasConfirmadas[b.day] = (citasConfirmadas[b.day] || 0) + 1;
    }
  }
  const diasFelicitados = Object.entries(citasConfirmadas).filter(([, count]) => count >= 2);
  const diasSemana = [0,1,2,3,4,5,6];
  const cumpleSemana = diasSemana.every(day => citasConfirmadas[day] && citasConfirmadas[day] >= 2);
  const { data: agenteData } = await supabase.from('usuarios').select('email,nombre').eq('id', agente_id).maybeSingle();
  const { data: superusuarios } = await supabase.from('usuarios').select('email').eq('rol', 'superusuario').eq('activo', true);
  const to = agenteData?.email;
  const nombreAgente = agenteData?.nombre || to || 'Agente';
  const cc = (superusuarios||[]).map(s=>s.email).filter(e=>e && e!==to);
  // Correo diario (ya existente)
  if (diasFelicitados.length > 0) {
    for (const [day, count] of diasFelicitados) {
      const semanaBase = obtenerSemanaIso(new Date(anio, 0, 1 + (semana_iso-1)*7)).inicio;
      const fecha = new Date(semanaBase); fecha.setUTCDate(fecha.getUTCDate() + Number(day));
      const fechaStr = fecha.toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'short', day:'numeric' });
      const { subject, html, text } = buildFelicitacionCitasEmail(nombreAgente, fechaStr, count);
      await sendMail({ to, subject, html, text, ...(cc.length ? {cc} : {}) });
    }
  }
  // Correo semanal (nuevo)
  if (cumpleSemana) {
    // Para evitar duplicados, podrías guardar un registro en la base de datos, pero aquí solo se envía si cumple
    const semanaLabel = `#${semana_iso} (${obtenerSemanaIso(new Date(anio, 0, 1 + (semana_iso-1)*7)).inicio.toLocaleDateString('es-MX')} - ${obtenerSemanaIso(new Date(anio, 0, 1 + (semana_iso-1)*7)).fin.toLocaleDateString('es-MX')})`;
    const { subject, html, text } = buildFelicitacionSemanaCitasEmail(nombreAgente, semanaLabel);
    await sendMail({ to, subject, html, text, ...(cc.length ? {cc} : {}) });
  }
  return NextResponse.json({
    ...result,
    cancellations: {
      cancelled: cancelledFromPlan,
      errors: cancellationErrors
    }
  })
}
