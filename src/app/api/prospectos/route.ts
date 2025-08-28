import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso, semanaDesdeNumero } from '@/lib/semanaIso'
import type { ProspectoEstado } from '@/types'

const supabase = getServiceClient()

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const semana = url.searchParams.get('semana') // puede estar vacío para "todo el año"
  const anio = url.searchParams.get('anio')
  const estado = url.searchParams.get('estado') as ProspectoEstado | null
  const soloConCita = url.searchParams.get('solo_con_cita') === '1'
  let agenteIdParam = url.searchParams.get('agente_id')

  // Restricción rol agente
  if (usuario.rol === 'agente') agenteIdParam = String(usuario.id)

  let query = supabase.from('prospectos').select('*').order('id', { ascending: true })
  if (agenteIdParam) query = query.eq('agente_id', Number(agenteIdParam))
  if (anio) query = query.eq('anio', Number(anio))
  if (estado) query = query.eq('estado', estado)
  if (soloConCita) query = query.not('fecha_cita','is',null)

  // Filtrado semana:
  // - Si no se envía semana => todas las semanas del año (ya filtrado por anio si se dio)
  // - Si se envía semana => incluir prospectos cuya semana_iso==semana OR cuya fecha_cita caiga dentro del rango de esa semana
  if (semana) {
    const anioNum = anio ? Number(anio) : obtenerSemanaIso(new Date()).anio
    const semNum = Number(semana)
    const rango = semanaDesdeNumero(anioNum, semNum)
    const inicioISO = rango.inicio.toISOString()
    const finPlus1 = new Date(rango.fin); finPlus1.setUTCDate(finPlus1.getUTCDate()+1)
    const finISO = finPlus1.toISOString()
    // Supabase or filter
    query = query.or(
      `and(semana_iso.eq.${semNum},anio.eq.${anioNum}),and(fecha_cita.gte.${inicioISO},fecha_cita.lt.${finISO})`
    )
  }

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
  // Aceptar 'YYYY-MM-DD' o 'YYYY-MM-DDTHH:mm'
  if (fecha_cita) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha_cita)) {
      // Normalizar sin hora a inicio de día UTC para consistencia
      fecha_cita = new Date(fecha_cita + 'T00:00:00Z').toISOString()
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fecha_cita)) {
      fecha_cita = new Date(fecha_cita + ':00Z').toISOString()
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(fecha_cita)) {
      // ya ISO completo
    } else {
      fecha_cita = undefined
    }
  }

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
