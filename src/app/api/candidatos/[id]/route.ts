import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const { data, error } = await supabase.from('candidatos').select('*').eq('id_candidato', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const usuario = await getUsuarioSesion()
  if (!usuario?.activo) return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })

  const existente = await supabase.from('candidatos').select('*').eq('id_candidato', id).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })

  const body = await req.json()

  if (body.mes && body.mes !== existente.data.mes) {
    const { data: cedula } = await supabase.from('cedula_a1').select('*').eq('mes', body.mes).single()
    if (cedula) Object.assign(body, {
      periodo_para_registro_y_envio_de_documentos: cedula.periodo_para_registro_y_envio_de_documentos,
      capacitacion_cedula_a1: cedula.capacitacion_cedula_a1
    })
  }

  if (body.efc && body.efc !== existente.data.efc) {
    const { data: efc } = await supabase.from('efc').select('*').eq('efc', body.efc).single()
    if (efc) Object.assign(body, {
      periodo_para_ingresar_folio_oficina_virtual: efc.periodo_para_ingresar_folio_oficina_virtual,
      periodo_para_playbook: efc.periodo_para_playbook,
      pre_escuela_sesion_unica_de_arranque: efc.pre_escuela_sesion_unica_de_arranque,
      fecha_limite_para_presentar_curricula_cdp: efc.fecha_limite_para_presentar_curricula_cdp,
      inicio_escuela_fundamental: efc.inicio_escuela_fundamental
    })
  }

  body.usuario_que_actualizo = usuario.email

  // Si no existe trigger en BD que actualice ultima_actualizacion, lo hacemos aquí
  body.ultima_actualizacion = new Date().toISOString()
  // fecha_tentativa_de_examen: si viene en body se guarda tal cual (yyyy-mm-dd)
  const { data, error } = await supabase.from('candidatos').update(body).eq('id_candidato', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('edicion_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: Number(id), snapshot: existente.data })

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const usuario = await getUsuarioSesion()
  if (!usuario?.activo) return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })

  const existente = await supabase.from('candidatos').select('*').eq('id_candidato', id).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })

  const { error } = await supabase.from('candidatos').update({
    eliminado: true,
    fecha_eliminacion: new Date().toISOString(),
    usuario_que_actualizo: usuario.email
  }).eq('id_candidato', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('borrado_logico_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: Number(id), snapshot: existente.data })

  return NextResponse.json({ success: true })
}
