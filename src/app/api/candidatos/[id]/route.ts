/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { normalizeDateFields } from '@/lib/dateUtils'
import { calcularDerivados } from '@/lib/proceso'
import { crearUsuarioAgenteAuto } from '@/lib/autoAgente'
import type { Candidato } from '@/types'

// Tipo mínimo para acceder a campos dinámicos sin que TS marque "never"
type CandidatoParcial = Partial<Candidato>

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

  const body: CandidatoParcial = await req.json()

  const existenteData: CandidatoParcial = existente.data || {}

  // Normalizar email_agente si viene (después de cargar existenteData)
  let agenteMeta: any = undefined
  if (typeof body.email_agente === 'string') {
    const email = body.email_agente.trim().toLowerCase()
    const existenteEmail = (existenteData as any).email_agente as string | undefined
    if (existenteEmail) {
      // No permitir cambio; ignorar y no tocar body.email_agente
      delete (body as any).email_agente
    } else if (email) {
      try {
        agenteMeta = await crearUsuarioAgenteAuto({ email, nombre: body.candidato || (existenteData as any).candidato })
      } catch (e) {
        agenteMeta = { error: e instanceof Error ? e.message : 'Error desconocido creando usuario agente' }
      }
      body.email_agente = email
    }
  }

  if (body.mes && body.mes !== existenteData.mes) {
    const { data: cedula } = await supabase.from('cedula_a1').select('*').eq('mes', body.mes).single()
    if (cedula) {
      const c: any = cedula
      Object.assign(body, {
        periodo_para_registro_y_envio_de_documentos: c.periodo_para_registro_y_envio_de_documentos,
        capacitacion_cedula_a1: c.capacitacion_cedula_a1
      })
    }
  }

  if (body.efc && body.efc !== existenteData.efc) {
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

  body.usuario_que_actualizo = usuario.email
  // Si se agrega CT por primera vez y no había fecha_creacion_ct, la seteamos
  if (body.ct && !existenteData.ct && !existenteData.fecha_creacion_ct) {
    body.fecha_creacion_ct = new Date().toISOString()
  }

  // Validación de empalme de fecha_tentativa_de_examen (mismo día)
  if (body.fecha_tentativa_de_examen) {
    const { data: conflictos, error: errConf } = await supabase.from('candidatos')
      .select('id_candidato, fecha_tentativa_de_examen')
      .eq('fecha_tentativa_de_examen', body.fecha_tentativa_de_examen)
      .eq('eliminado', false)
      .neq('id_candidato', id)
    if (!errConf && conflictos && conflictos.length > 0) {
      return NextResponse.json({ error: 'Empalme: fecha tentativa de examen ya asignada a otro candidato.' }, { status: 400 })
    }
  }

  // Si no existe trigger en BD que actualice ultima_actualizacion, lo hacemos aquí
  body.ultima_actualizacion = new Date().toISOString()
  // Recalcular proceso ignorando lo que venga del cliente
  const snap = {
    periodo_para_registro_y_envio_de_documentos: body.periodo_para_registro_y_envio_de_documentos ?? existenteData.periodo_para_registro_y_envio_de_documentos,
    capacitacion_cedula_a1: body.capacitacion_cedula_a1 ?? existenteData.capacitacion_cedula_a1,
    periodo_para_ingresar_folio_oficina_virtual: body.periodo_para_ingresar_folio_oficina_virtual ?? existenteData.periodo_para_ingresar_folio_oficina_virtual,
    periodo_para_playbook: body.periodo_para_playbook ?? existenteData.periodo_para_playbook,
    pre_escuela_sesion_unica_de_arranque: body.pre_escuela_sesion_unica_de_arranque ?? existenteData.pre_escuela_sesion_unica_de_arranque,
    fecha_limite_para_presentar_curricula_cdp: body.fecha_limite_para_presentar_curricula_cdp ?? existenteData.fecha_limite_para_presentar_curricula_cdp,
    inicio_escuela_fundamental: body.inicio_escuela_fundamental ?? existenteData.inicio_escuela_fundamental,
    fecha_tentativa_de_examen: body.fecha_tentativa_de_examen ?? existenteData.fecha_tentativa_de_examen,
    fecha_creacion_ct: body.fecha_creacion_ct ?? (existenteData as any).fecha_creacion_ct
  }
  body.proceso = calcularDerivados(snap).proceso
  // fecha_creacion_ct y fecha_tentativa_de_examen: si vienen en body se guardan tal cual (yyyy-mm-dd)
  normalizeDateFields(body)
  const { data, error } = await supabase.from('candidatos').update(body).eq('id_candidato', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('edicion_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: Number(id), snapshot: existenteData })

  // Adjuntar meta de agente si aplica sin romper clientes existentes
  if (agenteMeta && agenteMeta.passwordTemporal) {
    // No exponer password temporal al cliente por seguridad
    delete agenteMeta.passwordTemporal
  }
  const responsePayload = agenteMeta ? { ...data, _agente_meta: agenteMeta } : data
  return NextResponse.json(responsePayload)
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
