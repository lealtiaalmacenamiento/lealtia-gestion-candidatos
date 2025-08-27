/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { normalizeDateFields } from '@/lib/dateUtils'

const supabase = getServiceClient()

export async function GET(req: Request) {
  const url = new URL(req.url)
  const verEliminados = url.searchParams.get('eliminados') === '1'
  const query = supabase
    .from('candidatos')
    .select('*')
    .eq('eliminado', verEliminados ? true : false)
    .order('id_candidato', { ascending: true })
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!usuario.activo) return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })

  const body = await req.json()
  // Validación mínima de campos requeridos
  const requeridos: Array<keyof typeof body> = ['candidato', 'mes', 'efc']
  const faltan = requeridos.filter(k => !body[k] || (typeof body[k] === 'string' && body[k].trim() === ''))
  if (faltan.length) return NextResponse.json({ error: `Faltan campos: ${faltan.join(', ')}` }, { status: 400 })

  // Autocompletar desde cedula_a1
  if (body.mes) {
    const { data: cedula } = await supabase.from('cedula_a1').select('*').eq('mes', body.mes).single()
    if (cedula) {
      const c: any = cedula
      Object.assign(body, {
        periodo_para_registro_y_envio_de_documentos: c.periodo_para_registro_y_envio_de_documentos,
        capacitacion_cedula_a1: c.capacitacion_cedula_a1
      })
    }
  }

  // Autocompletar desde efc
  if (body.efc) {
    const { data: efc } = await supabase.from('efc').select('*').eq('efc', body.efc).single()
    if (efc) {
      const e: any = efc
      Object.assign(body, {
        periodo_para_ingresar_folio_oficina_virtual: e.periodo_para_ingresar_folio_oficina_virtual,
        periodo_para_playbook: e.periodo_para_playbook,
        pre_escuela_sesion_unica_de_arranque: e.pre_escuela_sesion_unica_de_arranque,
        fecha_limite_para_presentar_curricula_cdp: e.fecha_limite_para_presentar_curricula_cdp,
        inicio_escuela_fundamental: e.inicio_escuela_fundamental
      })
    }
  }

  body.usuario_creador = usuario.email
  // Registrar fecha_creacion_ct si existe CT y no viene ya (primer registro)
  if (body.ct && !body.fecha_creacion_ct) body.fecha_creacion_ct = new Date().toISOString()

  // Validar que fecha_tentativa_de_examen no empalme (ejemplo simple: no permitir misma fecha exacta que otro candidato no eliminado)
  if (body.fecha_tentativa_de_examen) {
    const { data: conflictos, error: errConf } = await supabase.from('candidatos')
      .select('id_candidato, fecha_tentativa_de_examen')
      .eq('fecha_tentativa_de_examen', body.fecha_tentativa_de_examen)
      .eq('eliminado', false)
    if (!errConf && conflictos && conflictos.length > 0) {
      return NextResponse.json({ error: 'Empalme: la fecha tentativa de examen ya está asignada a otro candidato.' }, { status: 400 })
    }
  }

  // fecha_tentativa_de_examen se recibe directa del formulario (formato yyyy-mm-dd)

  // fecha_de_creacion se asume default NOW() en BD
  normalizeDateFields(body)
  const { data, error } = await supabase.from('candidatos').insert([body]).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  interface CandidatoInsert { id_candidato?: number }
  const idLog = (data as CandidatoInsert)?.id_candidato
  await logAccion('alta_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: idLog, snapshot: data })

  return NextResponse.json(data)
}
