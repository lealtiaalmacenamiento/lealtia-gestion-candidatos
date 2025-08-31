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
  // Validar unicidad de CT si cambia o si viene definido
  if (body.ct && body.ct !== existenteData.ct) {
    const { data: dup } = await supabase
      .from('candidatos')
      .select('id_candidato')
      .eq('ct', body.ct)
      .eq('eliminado', false)
      .neq('id_candidato', id)
      .limit(1)
      .maybeSingle()
    if (dup) {
      return NextResponse.json({ error: 'CT ya está registrado en otro candidato.' }, { status: 409 })
    }
  }

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

  // Si viene un cambio de etapas_completadas desde el cliente, normalizamos metadatos
  if (body.etapas_completadas && typeof body.etapas_completadas === 'object') {
    const nowIso = new Date().toISOString()
    const nombreUsuario = (usuario as any).nombre || undefined
    const prev = (existenteData as any).etapas_completadas || {}
    const merged: Record<string, any> = { ...prev }
    for (const [k, v] of Object.entries(body.etapas_completadas as Record<string, any>)) {
      const completed = !!(v as any)?.completed
      merged[k] = {
        completed,
        by: { email: usuario.email, nombre: nombreUsuario },
        at: nowIso
      }
    }
    ;(body as any).etapas_completadas = merged
  }

  body.usuario_que_actualizo = usuario.email
  // Si se agrega CT por primera vez y no había fecha_creacion_ct, la seteamos
  if (body.ct && !existenteData.ct && !existenteData.fecha_creacion_ct) {
    body.fecha_creacion_ct = new Date().toISOString()
  }

  // Ya no se valida unicidad de fecha_tentativa_de_examen; múltiples candidatos pueden compartirla.

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

  // Sincronizar nombre del usuario agente si existe y se cambió el nombre del candidato original usado para crearlo
  try {
    const nuevoNombre = (body as any).candidato
    const emailAgente = (existenteData as any).email_agente || (body as any).email_agente
    if (emailAgente && nuevoNombre && nuevoNombre !== (existenteData as any).candidato) {
      // Actualizar nombre en usuarios sólo si el usuario agente existe
      const { data: userAg, error: userErr } = await supabase.from('usuarios').select('id,nombre').eq('email', emailAgente).maybeSingle()
      if(!userErr && userAg){
        await supabase.from('usuarios').update({ nombre: nuevoNombre }).eq('id', userAg.id)
      }
    }
  } catch {/* ignore sync errors */}

  await logAccion('edicion_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: Number(id), snapshot: existenteData })

  // Adjuntar meta de agente si aplica sin romper clientes existentes
  if (agenteMeta && agenteMeta.passwordTemporal) {
    // No exponer password temporal al cliente por seguridad
    delete agenteMeta.passwordTemporal
  }
  // Si viene motivo de desmarcado, registrarlo en auditoría
  try {
    const bodyAny = body as any
    if (bodyAny._etapa_uncheck && bodyAny._etapa_uncheck.key) {
      await logAccion('etapa_desmarcada', {
        usuario: usuario.email,
        tabla_afectada: 'candidatos',
        id_registro: Number(id),
        snapshot: {
          etapa: bodyAny._etapa_uncheck.key,
          motivo: String(bodyAny._etapa_uncheck.reason || ''),
          fecha: new Date().toISOString()
        }
      })
    }
  } catch { /* ignore logging errors */ }

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
