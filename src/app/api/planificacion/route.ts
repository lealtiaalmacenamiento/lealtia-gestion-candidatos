import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso } from '@/lib/semanaIso'
import type { BloquePlanificacion } from '@/types'
import { logAccion } from '@/lib/logger'
import { sendMail, buildFelicitacionCitasEmail, buildFelicitacionSemanaCitasEmail } from '@/lib/mailer'
import { cancelAgendaCitaCascade } from '../agenda/citas/cancel/cascade'




const supabase = getServiceClient()

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const semana = Number(url.searchParams.get('semana')) || undefined
  const anio = Number(url.searchParams.get('anio')) || undefined
  let agenteId = Number(url.searchParams.get('agente_id')) || undefined
  if (usuario.rol === 'agente') agenteId = usuario.id
  if (!agenteId) return NextResponse.json({ error: 'agente_id requerido (solo supervisor puede especificarlo)' }, { status: 400 })
  const w = obtenerSemanaIso(new Date())
  const semanaQ = semana || w.semana
  const anioQ = anio || w.anio
  const { data, error } = await supabase.from('planificaciones').select('*').eq('agente_id', agenteId).eq('semana_iso', semanaQ).eq('anio', anioQ).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const payload = data || { bloques: [], agente_id: agenteId, semana_iso: semanaQ, anio: anioQ, prima_anual_promedio: 30000, porcentaje_comision: 35 }
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
  if (usuario.rol === 'agente') agente_id = usuario.id
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
