import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso } from '@/lib/semanaIso'
import type { BloquePlanificacion } from '@/types'

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
  if (!data) return NextResponse.json({ bloques: [], agente_id: agenteId, semana_iso: semanaQ, anio: anioQ, prima_anual_promedio: 30000, porcentaje_comision: 35 })
  return NextResponse.json(data)
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
  const isBloque = (b: unknown): b is BloquePlanificacion => {
    if (!b || typeof b !== 'object') return false
    const obj = b as Record<string, unknown>
    return typeof obj.day === 'number' && typeof obj.hour === 'string' && typeof obj.activity === 'string'
  }
  const bloques: BloquePlanificacion[] = Array.isArray(body.bloques) ? body.bloques.filter(isBloque) : []
  const prima = Number(body.prima_anual_promedio) || 30000
  const comision = Number(body.porcentaje_comision) || 35
  const upsert = { agente_id, semana_iso, anio, bloques, prima_anual_promedio: prima, porcentaje_comision: comision, updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from('planificaciones').upsert(upsert, { onConflict: 'agente_id,anio,semana_iso' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
