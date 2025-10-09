import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import type { Parametro } from '@/types'
import { logAccion } from '@/lib/logger'

// Listar parámetros
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tipo = searchParams.get('tipo')

  let query = supabase.from('Parametros').select('*')
  if (tipo) {
    query = query.eq('tipo', tipo)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }

  // Log consulta (sin usuario explícito; podría añadirse si se obtiene de sesión)
  await logAccion('listado_parametros', { tabla_afectada: 'parametros', snapshot: { count: (data || []).length, filtro: tipo } })
  return NextResponse.json<{ success: boolean; data: Parametro[] }>({
    success: true,
    data: data as Parametro[]
  })
}

// Actualizar parámetro
export async function PUT(request: Request) {
  try {
    const raw: Partial<Parametro> & { solicitante?: string } = await request.json()
    const { id, valor, descripcion } = raw
    if (!id) {
      return NextResponse.json({ success: false, message: 'Falta el ID del parámetro' }, { status: 400 })
    }
  // Sanitizar payload: ignorar campos no permitidos y mapear solicitante -> actualizado_por
  const updateFields: Partial<Parametro> = {}
  if (valor !== undefined) updateFields.valor = valor
  if (descripcion !== undefined) updateFields.descripcion = descripcion
  if (raw.clave !== undefined) updateFields.clave = raw.clave
  updateFields.actualizado_por = raw.solicitante || raw.actualizado_por || null
  updateFields.actualizado_en = new Date().toISOString()

    const { data, error } = await supabase
      .from('Parametros')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    }

    await logAccion('actualizacion_parametro', { usuario: updateFields.actualizado_por, tabla_afectada: 'parametros', id_registro: id, snapshot: data })

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, message: 'Error al actualizar parámetro' }, { status: 500 })
  }
}

// Crear parámetro (utilizado para seeds faltantes en runtime)
export async function POST(request: Request) {
  try {
    const raw: Partial<Parametro> & { solicitante?: string } = await request.json()
    if (!raw.tipo || !raw.clave) {
      return NextResponse.json({ success: false, message: 'Faltan campos requeridos (tipo, clave)' }, { status: 400 })
    }
    const insert: Partial<Parametro> = {
      tipo: raw.tipo,
      clave: raw.clave,
      valor: raw.valor ?? null,
      descripcion: raw.descripcion ?? null,
      actualizado_por: raw.solicitante || raw.actualizado_por || null,
      actualizado_en: new Date().toISOString()
    }
    const { data, error } = await supabase.from('Parametros').insert(insert).select().single()
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
    await logAccion('creacion_parametro', { usuario: insert.actualizado_por, tabla_afectada: 'parametros', snapshot: data })
    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, message: 'Error al crear parámetro' }, { status: 500 })
  }
}
