import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso } from '@/lib/semanaIso'
import type { BloquePlanificacion } from '@/types'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const semana = Number(url.searchParams.get('semana')) || undefined
  const anio = Number(url.searchParams.get('anio')) || undefined
  let agenteId = Number(url.searchParams.get('agente_id')) || undefined
  if (usuario.rol === 'agente') agenteId = usuario.id
  if (!agenteId) return NextResponse.json({ error: 'agente_id requerido (solo superusuario puede especificarlo)' }, { status: 400 })
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
  return NextResponse.json(result)
}
