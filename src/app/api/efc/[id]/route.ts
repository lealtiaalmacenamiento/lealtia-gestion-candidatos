import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { normalizeDateFields } from '@/lib/dateUtils'

const supabase = getServiceClient()

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const usuario = await getUsuarioSesion()
  const rol = usuario?.rol ? String(usuario.rol).trim().toLowerCase() : undefined
  const allowed = ['admin','superusuario']
  if (!usuario?.activo || !rol || !allowed.includes(rol)) {
    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin permiso', ...(debug ? { rol, activo: usuario?.activo } : {}) }, { status: 403 })
  }

  const existente = await supabase.from('efc').select('*').eq('id', id).single()
  if (existente.error) {
    return NextResponse.json({ error: existente.error.message }, { status: 500 })
  }

  const body = await req.json()
  const allowedFields = new Set(['efc','periodo_para_ingresar_folio_oficina_virtual','periodo_para_playbook','pre_escuela_sesion_unica_de_arranque','fecha_limite_para_presentar_curricula_cdp','inicio_escuela_fundamental'])
  const incomingKeys = Object.keys(body)
  const invalid = incomingKeys.filter(k => !allowedFields.has(k))
  if (invalid.length) {
    return NextResponse.json({ error: 'Campos no permitidos', invalid, permitidos: Array.from(allowedFields) }, { status: 400 })
  }
  // (sin modo debug) procedemos directo al update; si nada cambia Supabase devolverá fila igual
  // Evitar fallo "Cannot coerce the result to a single JSON object" cuando no hay filas o RLS impide retorno
  interface EFCRow { id: number; [key: string]: unknown }
  normalizeDateFields(body)
  const { data: updatedRows, error: updError } = await supabase.from('efc').update(body).eq('id', id).select()
  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
  if (process.env.NODE_ENV !== 'production') console.log('[EFC PUT] id', id, 'keys', Object.keys(body), 'updatedRows.len', Array.isArray(updatedRows)? updatedRows.length : 'n/a')
  const updated: EFCRow | undefined = Array.isArray(updatedRows) ? (updatedRows[0] as EFCRow | undefined) : undefined
  if (!updated) {
    const refetch = await supabase.from('efc').select('*').eq('id', id).maybeSingle()
    if (refetch.error) return NextResponse.json({ error: 'Registro no encontrado tras actualizar' }, { status: 404 })
    await logAccion('edicion_efc', { usuario: usuario.email, tabla_afectada: 'efc', id_registro: Number(id), snapshot: existente.data })
    return NextResponse.json(refetch.data)
  }
  await logAccion('edicion_efc', { usuario: usuario.email, tabla_afectada: 'efc', id_registro: Number(id), snapshot: existente.data })
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

  const existente = await supabase.from('efc').select('*').eq('id', id).single()
  if (existente.error) {
    return NextResponse.json({ error: existente.error.message }, { status: 500 })
  }

  const { error } = await supabase.from('efc').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAccion('borrado_efc', { usuario: usuario.email, tabla_afectada: 'efc', id_registro: Number(id), snapshot: existente.data })

  return NextResponse.json({ success: true })
}
