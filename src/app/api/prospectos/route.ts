import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso } from '@/lib/semanaIso'
import type { ProspectoEstado } from '@/types'

const supabase = getServiceClient()

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const semana = url.searchParams.get('semana')
  const anio = url.searchParams.get('anio')
  const estado = url.searchParams.get('estado') as ProspectoEstado | null
  let agenteIdParam = url.searchParams.get('agente_id')

  // Restricción rol agente
  if (usuario.rol === 'agente') agenteIdParam = String(usuario.id)

  let query = supabase.from('prospectos').select('*').order('id', { ascending: true })
  if (agenteIdParam) query = query.eq('agente_id', Number(agenteIdParam))
  if (semana) query = query.eq('semana_iso', Number(semana))
  if (anio) query = query.eq('anio', Number(anio))
  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!usuario.activo) return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })

  const body = await req.json()
  const nombre: string = (body.nombre||'').trim()
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const telefono: string | undefined = body.telefono?.trim() || undefined
  const notas: string | undefined = body.notas?.trim() || undefined
  let estado: ProspectoEstado = 'pendiente'
  const estadoRaw: string | undefined = body.estado
  if (estadoRaw && ['pendiente','seguimiento','con_cita','descartado'].includes(estadoRaw)) estado = estadoRaw as ProspectoEstado

  let fecha_cita: string | undefined = body.fecha_cita
  if (fecha_cita && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_cita)) fecha_cita = undefined

  const { anio, semana } = obtenerSemanaIso(new Date())

  const insert = {
    agente_id: usuario.id,
    anio,
    semana_iso: semana,
    nombre,
    telefono,
    notas,
    estado,
    fecha_cita
  }
  const { data, error } = await supabase.from('prospectos').insert([insert]).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
