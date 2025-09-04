import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { obtenerSemanaIso, semanaDesdeNumero } from '@/lib/semanaIso'
import type { ProspectoEstado } from '@/types'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

export async function GET(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const semana = url.searchParams.get('semana') // puede estar vacío para "todo el año"
  const anio = url.searchParams.get('anio')
  const id = url.searchParams.get('id')
  const estado = url.searchParams.get('estado') as ProspectoEstado | null
  const soloConCita = url.searchParams.get('solo_con_cita') === '1'
  const soloSinCita = url.searchParams.get('solo_sin_cita') === '1'
  let agenteIdParam = url.searchParams.get('agente_id')

  // Restricción rol agente
  if (usuario.rol === 'agente') agenteIdParam = String(usuario.id)

  let query = supabase.from('prospectos').select('*').order('id', { ascending: true })
  if (agenteIdParam) query = query.eq('agente_id', Number(agenteIdParam))
  if (id) query = query.eq('id', Number(id))
  if (anio) query = query.eq('anio', Number(anio))
  if (estado) query = query.eq('estado', estado)
  if (soloConCita) query = query.not('fecha_cita','is',null)
  if (soloSinCita && !soloConCita) {
    // Sólo prospectos sin cita, estados permitidos pendiente / seguimiento
    query = query.is('fecha_cita', null).in('estado', ['pendiente','seguimiento'])
  }

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
  // Audit liviano del listado
  try {
    await logAccion('listado_prospectos', {
      tabla_afectada: 'prospectos',
      snapshot: {
        count: (data || []).length,
        filtros: { anio, semana, estado, soloConCita, soloSinCita, agenteIdParam }
      }
    })
  } catch {}
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
  // Normalización: el frontend ahora envía siempre ISO UTC cuando hay fecha+hora.
  // Permitimos también YYYY-MM-DD (se tratará como 00:00 MX)
  if (fecha_cita) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha_cita)) {
      // Interpretar fecha en MX 00:00 => convertir a UTC sumando 6h
      const [y,m,d] = fecha_cita.split('-').map(Number)
      const utc = new Date(Date.UTC(y, m-1, d, 6, 0, 0))
      fecha_cita = utc.toISOString()
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(fecha_cita)) {
      // ya es ISO UTC -> usar tal cual
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fecha_cita)) {
      // asume hora en MX sin Z => parse y sumar offset 6h a UTC
      const [fecha, hm] = fecha_cita.split('T')
      const [y,m,d] = fecha.split('-').map(Number)
      const h = Number(hm.slice(0,2))
      const utc = new Date(Date.UTC(y,m-1,d,h+6,0,0))
      fecha_cita = utc.toISOString()
    } else {
      fecha_cita = undefined
    }
  }

  // Validaciones adicionales fecha_cita: hora cerrada y no solapada con otra cita del mismo agente
  if (fecha_cita) {
    const dt = new Date(fecha_cita)
    if (dt.getUTCMinutes() !== 0 || dt.getUTCSeconds() !== 0) {
      return NextResponse.json({ error: 'La cita debe ser en una hora cerrada (minutos 00).' }, { status: 400 })
    }
    // Normalizar a inicio de hora UTC para búsqueda
    const startHour = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), dt.getUTCHours(), 0, 0))
    const endHour = new Date(startHour); endHour.setUTCHours(endHour.getUTCHours() + 1)
    const { data: overlaps, error: overlapError } = await supabase.from('prospectos')
      .select('id')
      .eq('agente_id', usuario.id)
      .gte('fecha_cita', startHour.toISOString())
      .lt('fecha_cita', endHour.toISOString())
    if (overlapError) return NextResponse.json({ error: overlapError.message }, { status: 500 })
    if (overlaps && overlaps.length > 0) {
      return NextResponse.json({ error: 'Ya existe una cita agendada en ese horario.' }, { status: 409 })
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
  // Historial: registrar alta para que el reporte diario incluya el evento
  try {
    const nuevoId = (data as { id?: number }).id
    if (nuevoId) {
      await supabase.from('prospectos_historial').insert({
        prospecto_id: nuevoId,
        agente_id: usuario.id,
        usuario_email: usuario.email,
        estado_anterior: null,
        estado_nuevo: estado,
        nota_agregada: Boolean((notas || '').trim()),
        notas_anteriores: null,
        notas_nuevas: notas || null
      })
    }
  } catch {}
  // Audit alta
  try {
    await logAccion('alta_prospecto', {
      usuario: usuario.email,
      tabla_afectada: 'prospectos',
      id_registro: Number((data as { id?: number }).id || 0),
      snapshot: data
    })
  } catch {}
  return NextResponse.json(data)
}
