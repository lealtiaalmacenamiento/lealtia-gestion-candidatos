import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { normalizeDateFields } from '@/lib/dateUtils'
import { calcularDerivados } from '@/lib/proceso'
import { crearUsuarioAgenteAuto } from '@/lib/autoAgente'
import type { Candidato } from '@/types'
import { sanitizeCandidatoPayload } from '@/lib/sanitize'

// Tipo mínimo para acceder a campos dinámicos sin que TS marque "never"
type CandidatoParcial = Partial<Candidato>

const supabase = getServiceClient()

function normalizeMesConexion(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function extractMesFromDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7)
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    const [, , month, year] = dmy
    return `${year}-${String(Number(month)).padStart(2, '0')}`
  }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
    return `${parsed.getUTCFullYear()}-${month}`
  }
  return null
}

function resolveMesConexion(mesConexion: unknown, fechaCt: unknown, fechaPop: unknown): string | null {
  const normalized = normalizeMesConexion(mesConexion)
  if (normalized) return normalized
  const fromCt = extractMesFromDate(fechaCt)
  if (fromCt) return fromCt
  const fromPop = extractMesFromDate(fechaPop)
  if (fromPop) return fromPop
  return null
}

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

  const body: CandidatoParcial = sanitizeCandidatoPayload(await req.json() as CandidatoParcial)
  if ('mes_conexion' in body) {
    ;(body as any).mes_conexion = normalizeMesConexion((body as any).mes_conexion)
  }
  // Normalizar email_agente (correo candidato) si viene
  if (typeof (body as any).email_agente === 'string') {
    const trimmed = String((body as any).email_agente || '').trim().toLowerCase()
    ;(body as any).email_agente = trimmed ? trimmed : null
  }

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
  // Validación: email del candidato (email_agente) único entre no eliminados (excluyendo el propio)
  if ((body as any).email_agente && (body as any).email_agente !== (existenteData as any).email_agente) {
    const { data: dupEmail, error: errEmail } = await supabase
      .from('candidatos')
      .select('id_candidato, candidato, email_agente')
      .eq('email_agente', (body as any).email_agente)
      .eq('eliminado', false)
      .neq('id_candidato', id)
      .limit(1)
      .maybeSingle()
    if (errEmail && errEmail.code !== 'PGRST116') return NextResponse.json({ error: errEmail.message }, { status: 500 })
    if (dupEmail) {
      return NextResponse.json({ error: `El correo ya pertenece al candidato "${dupEmail.candidato}" (ID ${dupEmail.id_candidato}).` }, { status: 409 })
    }
  }
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

  // Permitir override manual de seg_gmm y seg_vida si vienen en el payload
  // Si no vienen, se mantendrán los valores existentes (que pueden ser calculados o manuales)
  if (typeof (body as any).seg_gmm === 'number') {
    // Validar que sea un número válido para GMM (permite 0.5)
    ;(body as any).seg_gmm = Math.max(0, Number(((body as any).seg_gmm).toFixed(1)))
  }
  if (typeof (body as any).seg_vida === 'number') {
    // Validar que sea un entero válido para VI
    ;(body as any).seg_vida = Math.max(0, Math.round((body as any).seg_vida))
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
    fecha_creacion_ct: body.fecha_creacion_ct ?? (existenteData as any).fecha_creacion_ct,
    fecha_creacion_pop: (body as any).fecha_creacion_pop ?? (existenteData as any).fecha_creacion_pop
  }
  body.proceso = calcularDerivados(snap).proceso
  // fecha_creacion_ct y fecha_tentativa_de_examen: si vienen en body se guardan tal cual (yyyy-mm-dd)
  normalizeDateFields(body)
  const mesConexion = resolveMesConexion(
    (body as any).mes_conexion ?? (existenteData as any).mes_conexion,
    body.fecha_creacion_ct ?? existenteData.fecha_creacion_ct,
    (body as any).fecha_creacion_pop ?? (existenteData as any).fecha_creacion_pop
  )
  if (typeof mesConexion !== 'undefined') {
    ;(body as any).mes_conexion = mesConexion
  }
  // Remover campos meta de cliente que no existen en la tabla antes de actualizar
  const _uncheckMeta = (body as any)._etapa_uncheck
  if (typeof (body as any)._etapa_uncheck !== 'undefined') {
    delete (body as any)._etapa_uncheck
  }
  const { data, error } = await supabase.from('candidatos').update(body).eq('id_candidato', id).select().single()
  if (error) {
    const msg = String(error.message || '')
    if (msg.includes('etapas_completadas')) {
      return NextResponse.json({ error: 'Falta la columna etapas_completadas en BD. Aplica la migración 20250831_add_etapas_completadas_to_candidatos.sql.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

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
    const bodyAny = { _etapa_uncheck: _uncheckMeta } as any
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

  // Si el candidato eliminado tenía usuario vinculado (email_agente) y su rol es 'agente', desactivarlo.
  try {
    const emailAgente = (existente.data as any)?.email_agente as string | undefined
    if (emailAgente) {
      const { data: userAg, error: userErr } = await supabase
        .from('usuarios')
        .select('id, rol, activo')
        .eq('email', emailAgente)
        .maybeSingle()
      if (!userErr && userAg && String(userAg.rol).toLowerCase() === 'agente' && userAg.activo) {
        const { error: updErr } = await supabase.from('usuarios').update({ activo: false }).eq('id', userAg.id)
        if (!updErr) {
          await logAccion('desactivacion_usuario_por_borrado_candidato', {
            usuario: usuario.email,
            tabla_afectada: 'usuarios',
            id_registro: Number(userAg.id),
            snapshot: { motivo: 'borrado_logico_candidato', id_candidato: Number(id), email: emailAgente }
          })
        }
      }
      // Si es supervisor u otro rol, no se desactiva según requerimiento
    }
  } catch { /* ignorar errores de desactivación */ }

  await logAccion('borrado_logico_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: Number(id), snapshot: existente.data })

  return NextResponse.json({ success: true })
}
