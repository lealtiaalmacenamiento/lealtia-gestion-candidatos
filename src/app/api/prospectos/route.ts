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
  // Restricción: solo usuarios presentes en el listado de candidatos (por email_agente) pueden crear prospectos
  try {
    const emailLower = (usuario.email || '').trim().toLowerCase()
    const { data: cand, error: candErr } = await supabase
      .from('candidatos')
      .select('id_candidato')
      .eq('email_agente', emailLower)
      .eq('eliminado', false)
      .limit(1)
      .maybeSingle()
    if (candErr && candErr.code && candErr.code !== 'PGRST116') {
      return NextResponse.json({ error: candErr.message }, { status: 500 })
    }
    if (!cand) {
      return NextResponse.json({ error: 'No autorizado para agregar prospectos: el usuario no está en el listado de candidatos.' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Error validando elegibilidad de candidato' }, { status: 500 })
  }
  const nombre: string = (body.nombre||'').trim()
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const telefono: string | undefined = body.telefono?.trim() || undefined
  const emailRaw: string | undefined = body.email?.trim() || undefined
  let email: string | undefined
  if (emailRaw) {
    const normalizedEmail = emailRaw.toLowerCase()
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 })
    }
    email = normalizedEmail
  }
  const notas: string | undefined = body.notas?.trim() || undefined
  let estado: ProspectoEstado = 'pendiente'
  const estadoRaw: string | undefined = body.estado
  if (estadoRaw && ['pendiente','seguimiento','con_cita','descartado','ya_es_cliente'].includes(estadoRaw)) estado = estadoRaw as ProspectoEstado

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

  // Permitir a admin/supervisor asignar a un agente explícito; si no, por defecto al usuario actual
  let agenteAsignado = usuario.id
  if (usuario.rol === 'admin' || usuario.rol === 'supervisor') {
    const aId = Number(body.agente_id)
    if (aId && Number.isFinite(aId)) {
      const { data: agUsr, error: agErr } = await supabase.from('usuarios').select('id,activo').eq('id', aId).maybeSingle()
      if (agErr && agErr.code && agErr.code !== 'PGRST116') {
        return NextResponse.json({ error: agErr.message }, { status: 500 })
      }
      if (agUsr && (agUsr as { activo?: boolean }).activo !== false) {
        agenteAsignado = (agUsr as { id: number }).id
      }
    }
  }

  const insert = {
    agente_id: agenteAsignado,
    anio,
    semana_iso: semana,
    nombre,
    telefono,
    email: email ?? null,
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
