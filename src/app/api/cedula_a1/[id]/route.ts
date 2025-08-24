import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const usuario = await getUsuarioSesion()
  const rol = usuario?.rol ? String(usuario.rol).trim().toLowerCase() : undefined
  const allowedRoles = ['admin','superusuario']
  if (!usuario?.activo || !rol || !allowedRoles.includes(rol)) {
    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin permiso', ...(debug ? { rol, activo: usuario?.activo } : {}) }, { status: 403 })
  }

  const existente = await supabase.from('cedula_a1').select('*').eq('id', id).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })

  const body = await req.json()
  const allowedFields = new Set(['mes','periodo_para_registro_y_envio_de_documentos','capacitacion_cedula_a1'])
  const incomingKeys = Object.keys(body)
  const invalid = incomingKeys.filter(k => !allowedFields.has(k))
  if (invalid.length) {
    return NextResponse.json({ error: 'Campos no permitidos', invalid, permitidos: Array.from(allowedFields) }, { status: 400 })
  }
  interface CedulaRow { id: number; [key: string]: unknown }
  const { data: updatedRows, error: updError } = await supabase.from('cedula_a1').update(body).eq('id', id).select()
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
  const updated: CedulaRow | undefined = Array.isArray(updatedRows) ? (updatedRows[0] as CedulaRow | undefined) : undefined
  if (!updated) {
    const refetch = await supabase.from('cedula_a1').select('*').eq('id', id).maybeSingle()
    if (refetch.error) return NextResponse.json({ error: 'Registro no encontrado tras actualizar' }, { status: 404 })
    await logAccion('edicion_cedula_a1', { usuario: usuario.email, tabla_afectada: 'cedula_a1', id_registro: Number(id), snapshot: existente.data })
    return NextResponse.json(refetch.data)
  }
  await logAccion('edicion_cedula_a1', { usuario: usuario.email, tabla_afectada: 'cedula_a1', id_registro: Number(id), snapshot: existente.data })
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const usuario = await getUsuarioSesion()
  const rol = usuario?.rol ? String(usuario.rol).trim().toLowerCase() : undefined
  const allowed = ['admin','superusuario']
  if (!usuario?.activo || !rol || !allowed.includes(rol)) {
    const url = new URL(_req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin permiso', ...(debug ? { rol, activo: usuario?.activo } : {}) }, { status: 403 })
  }

  const existente = await supabase.from('cedula_a1').select('*').eq('id', id).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })

  const { error } = await supabase.from('cedula_a1').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('borrado_cedula_a1', { usuario: usuario.email, tabla_afectada: 'cedula_a1', id_registro: Number(id), snapshot: existente.data })

  return NextResponse.json({ success: true })
}
