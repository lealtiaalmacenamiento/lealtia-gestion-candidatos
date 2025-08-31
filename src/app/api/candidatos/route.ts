/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { normalizeDateFields } from '@/lib/dateUtils'
import { calcularDerivados } from '@/lib/proceso'
import { crearUsuarioAgenteAuto } from '@/lib/autoAgente'

// Forzar runtime Node.js (necesario para nodemailer / auth admin)
export const runtime = 'nodejs'


const supabase = getServiceClient()

export async function GET(req: Request) {
  const url = new URL(req.url)
  const verEliminados = url.searchParams.get('eliminados') === '1'
  const ct = url.searchParams.get('ct')
  if (ct) {
    // Búsqueda rápida por CT (no eliminado)
    const { data, error } = await supabase
      .from('candidatos')
      .select('*')
      .eq('ct', ct)
      .eq('eliminado', false)
      .limit(1)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || null)
  }
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
  const emailAgenteRaw: unknown = body.email_agente
  const emailAgente = typeof emailAgenteRaw === 'string' ? emailAgenteRaw.trim().toLowerCase() : ''
  // email_agente se conserva para insertar en columna (asegúrate de haber agregado la columna en BD)
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
  // Ya no se auto-asigna fecha_creacion_ct cuando viene CT; el cliente debe enviarla explícitamente.
  // También se elimina la restricción de unicidad de fecha_tentativa_de_examen entre candidatos.

  // Validar unicidad de CT (si viene informado)
  if (body.ct && String(body.ct).trim() !== '') {
    const { data: dup } = await supabase
      .from('candidatos')
      .select('id_candidato')
      .eq('ct', body.ct)
      .eq('eliminado', false)
      .limit(1)
      .maybeSingle()
    if (dup) {
      return NextResponse.json({ error: 'CT ya está registrado en otro candidato.' }, { status: 409 })
    }
  }

  // fecha_creacion_ct y fecha_tentativa_de_examen se reciben directas del formulario (formato yyyy-mm-dd)
  // Recalcular siempre proceso en backend ignorando valor cliente
  const deriv = calcularDerivados({
    periodo_para_registro_y_envio_de_documentos: body.periodo_para_registro_y_envio_de_documentos,
    capacitacion_cedula_a1: body.capacitacion_cedula_a1,
    periodo_para_ingresar_folio_oficina_virtual: body.periodo_para_ingresar_folio_oficina_virtual,
    periodo_para_playbook: body.periodo_para_playbook,
    pre_escuela_sesion_unica_de_arranque: body.pre_escuela_sesion_unica_de_arranque,
    fecha_limite_para_presentar_curricula_cdp: body.fecha_limite_para_presentar_curricula_cdp,
    inicio_escuela_fundamental: body.inicio_escuela_fundamental,
    fecha_tentativa_de_examen: body.fecha_tentativa_de_examen,
    fecha_creacion_ct: body.fecha_creacion_ct
  })
  body.proceso = deriv.proceso

  // 1) Intentar creación de usuario agente (antes de insertar candidato) para poder abortar si falla gravemente
  const agenteMeta: { created?: boolean; existed?: boolean; passwordTemporal?: string; correoEnviado?: boolean; correoError?: string; error?: string } = {}
  if (emailAgente && /.+@.+\..+/.test(emailAgente)) {
  const r = await crearUsuarioAgenteAuto({ email: emailAgente, nombre: body.candidato })
  Object.assign(agenteMeta, r)
  if (r.error) console.warn('[api/candidatos] usuario agente no creado:', r.error)
  }

  // 2) Insertar candidato
  normalizeDateFields(body)
  const { data, error } = await supabase.from('candidatos').insert([body]).select().single()
  if (error) return NextResponse.json({ error: error.message, _agente_meta: agenteMeta }, { status: 500 })

  interface CandidatoInsert { id_candidato?: number }
  const idLog = (data as CandidatoInsert)?.id_candidato
  await logAccion('alta_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: idLog, snapshot: data })

  // 3) Responder incluyendo meta de agente (no rompe consumidores existentes)
  if (agenteMeta.passwordTemporal) delete agenteMeta.passwordTemporal
  return NextResponse.json({ ...data, _agente_meta: agenteMeta })
}
