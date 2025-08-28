import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'
import type { ProspectoEstado } from '@/types'

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
  if (body.notas !== undefined) fields.notas = String(body.notas).trim() || null
  if (body.estado !== undefined) {
    const e = String(body.estado)
    if (['pendiente','seguimiento','con_cita','descartado'].includes(e)) fields.estado = e as ProspectoEstado
  }
  if (body.fecha_cita !== undefined) {
    const fc = String(body.fecha_cita)
    if (!fc) fields.fecha_cita = null
    else if (/^\d{4}-\d{2}-\d{2}$/.test(fc)) fields.fecha_cita = new Date(fc + 'T00:00:00Z').toISOString()
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fc)) fields.fecha_cita = new Date(fc).toISOString()
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(fc)) fields.fecha_cita = fc
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

  const { data, error } = await supabase.from('prospectos').update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
  const { error } = await supabase.from('prospectos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}