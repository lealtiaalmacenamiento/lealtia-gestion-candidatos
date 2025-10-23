import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import type { ProspectoEstado } from '@/types'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

export async function PATCH(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const idStr = segments[segments.length - 1]
  const id = Number(idStr)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const body = await req.json()

  const fields: Record<string, unknown> = {}
  if (body.nombre !== undefined) {
    const n = String(body.nombre).trim(); if (n) fields.nombre = n
  }
  if (body.telefono !== undefined) fields.telefono = String(body.telefono).trim() || null
  if (body.email !== undefined) {
    const rawEmail = String(body.email).trim()
    if (!rawEmail) {
      fields.email = null
    } else {
      const normalizedEmail = rawEmail.toLowerCase()
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(normalizedEmail)) {
        return NextResponse.json({ error: 'Correo electrónico inválido' }, { status: 400 })
      }
      fields.email = normalizedEmail
    }
  }
  if (body.notas !== undefined) fields.notas = String(body.notas).trim() || null
  if (body.estado !== undefined) {
    const e = String(body.estado)
  if (['pendiente','seguimiento','con_cita','descartado','ya_es_cliente'].includes(e)) fields.estado = e as ProspectoEstado
  }
  if (body.fecha_cita !== undefined) {
    const fc = String(body.fecha_cita)
    if (!fc) fields.fecha_cita = null
    else if (/^\d{4}-\d{2}-\d{2}$/.test(fc)) {
      const [y,m,d] = fc.split('-').map(Number)
      fields.fecha_cita = new Date(Date.UTC(y,m-1,d,6,0,0)).toISOString()
    }
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(fc)) fields.fecha_cita = fc
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fc)) {
      const [fecha, hm] = fc.split('T')
      const [y,m,d] = fecha.split('-').map(Number)
      const h = Number(hm.slice(0,2))
      fields.fecha_cita = new Date(Date.UTC(y,m-1,d,h+6,0,0)).toISOString()
    }
    else fields.fecha_cita = null
  }
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
  fields.updated_at = new Date().toISOString()

  // Restringir propiedad si rol agente
  if (usuario.rol === 'agente') {
    const { data: existing, error: errExisting } = await supabase.from('prospectos').select('agente_id').eq('id', id).single()
    if (errExisting || !existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (existing.agente_id !== usuario.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Obtener snapshot anterior para historial
  const { data: before, error: errBefore } = await supabase.from('prospectos').select('id,agente_id,estado,notas').eq('id', id).single()
  if (errBefore || !before) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Validaciones de cita: hora cerrada y evitar empalmes (solo si se actualiza la fecha_cita no nula)
  if (fields.fecha_cita) {
    const dt = new Date(String(fields.fecha_cita))
    if (dt.getUTCMinutes() !== 0 || dt.getUTCSeconds() !== 0) {
      return NextResponse.json({ error: 'La cita debe ser en una hora cerrada (minutos 00).' }, { status: 400 })
    }
    const startHour = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), dt.getUTCHours(), 0, 0))
    const endHour = new Date(startHour); endHour.setUTCHours(endHour.getUTCHours() + 1)
    const { data: overlaps, error: overlapError } = await supabase.from('prospectos')
      .select('id')
      .eq('agente_id', usuario.id)
      .gte('fecha_cita', startHour.toISOString())
      .lt('fecha_cita', endHour.toISOString())
      .neq('id', id)
    if (overlapError) return NextResponse.json({ error: overlapError.message }, { status: 500 })
    if (overlaps && overlaps.length > 0) {
      return NextResponse.json({ error: 'Ya existe una cita agendada en ese horario.' }, { status: 409 })
    }
  }

  const { data, error } = await supabase.from('prospectos').update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Insertar historial si cambió estado o se agregó nota
  try {
    const estadoAnterior = before.estado as string | null
    const estadoNuevo = (data as { estado?: string }).estado ?? estadoAnterior
    const notasAntes = (before as { notas?: string | null }).notas ?? null
    const notasDespues = (data as { notas?: string | null }).notas ?? notasAntes
    const notaAgregada = Boolean((notasDespues || '').trim()) && ((notasAntes || '').trim() !== (notasDespues || '').trim())
    const cambioEstado = estadoAnterior !== estadoNuevo
    if (cambioEstado || notaAgregada) {
      await supabase.from('prospectos_historial').insert({
        prospecto_id: id,
        agente_id: before.agente_id,
        usuario_email: usuario.email,
        estado_anterior: estadoAnterior,
        estado_nuevo: estadoNuevo,
        nota_agregada: notaAgregada,
        notas_anteriores: notasAntes,
        notas_nuevas: notasDespues
      })
    }
  } catch {}
  try {
    await logAccion('edicion_prospecto', { usuario: usuario.email, tabla_afectada: 'prospectos', id_registro: id, snapshot: data })
  } catch {}
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const idStr = segments[segments.length - 1]
  const id = Number(idStr)
  if (!id) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  if (usuario.rol === 'agente') {
    const { data: existing, error: errExisting } = await supabase.from('prospectos').select('agente_id').eq('id', id).single()
    if (errExisting || !existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (existing.agente_id !== usuario.id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  const { data: existente, error: errE } = await supabase.from('prospectos').select('*').eq('id', id).single()
  if (errE) return NextResponse.json({ error: errE.message }, { status: 500 })
  const { error } = await supabase.from('prospectos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try {
    await logAccion('borrado_prospecto', { usuario: usuario.email, tabla_afectada: 'prospectos', id_registro: id, snapshot: existente })
  } catch {}
  return NextResponse.json({ success: true })
}