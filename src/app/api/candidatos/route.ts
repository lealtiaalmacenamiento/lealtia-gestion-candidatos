/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { normalizeDateFields } from '@/lib/dateUtils'
import { calcularDerivados } from '@/lib/proceso'
import { buildAltaUsuarioEmail, sendMail } from '@/lib/mailer'

// Forzar runtime Node.js (necesario para nodemailer / auth admin)
export const runtime = 'nodejs'

// Utilidades para creación automática de usuario agente
function randomTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const specials = '!@$%*?'
  const all = upper+lower+digits+specials
  const pick = (src: string)=> src[Math.floor(Math.random()*src.length)]
  let base = pick(upper)+pick(lower)+pick(digits)+pick(specials)
  for(let i=0;i<8;i++) base += pick(all)
  return base.split('').sort(()=>Math.random()-0.5).join('')
}
function isStrongPassword(pw: string) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)
}

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
  const emailAgenteRaw: unknown = body.email_agente
  const emailAgente = typeof emailAgenteRaw === 'string' ? emailAgenteRaw.trim().toLowerCase() : ''
  delete body.email_agente // evitar insertar columna inexistente en candidatos
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
  const agenteMeta: { created?: boolean; existed?: boolean; error?: string } = {}
  if (emailAgente && /.+@.+\..+/.test(emailAgente)) {
    try {
      const existente = await supabase.from('usuarios').select('id,rol').eq('email', emailAgente).maybeSingle()
      if (existente.error) throw new Error(existente.error.message)
      if (existente.data) {
        agenteMeta.existed = true
      } else {
        const tempPassword = randomTempPassword()
        if(!isStrongPassword(tempPassword)) throw new Error('Password temporal inválida generada')
        const authRes = await (supabase as any).auth.admin.createUser({ email: emailAgente, password: tempPassword, email_confirm: true })
        if (authRes.error) throw new Error('Auth: ' + authRes.error.message)
        const authId = authRes.data?.user?.id
        const ins = await supabase.from('usuarios').insert([{ email: emailAgente, rol: 'agente', activo: true, must_change_password: true, id_auth: authId }]).select('*').single()
        if (ins.error) throw new Error('DB usuarios: ' + ins.error.message)
        agenteMeta.created = true
        await logAccion('alta_usuario_auto_candidato', { usuario: usuario.email, tabla_afectada: 'usuarios', snapshot: { email: emailAgente, rol: 'agente' } })
        // Enviar correo (no aborta si falla)
        try {
          const { subject, html, text } = buildAltaUsuarioEmail(emailAgente, tempPassword)
          await sendMail({ to: emailAgente, subject, html, text })
        } catch (mailErr) {
          agenteMeta.error = 'Fallo envío correo: ' + (mailErr instanceof Error ? mailErr.message : String(mailErr))
        }
      }
    } catch (agErr) {
      agenteMeta.error = agErr instanceof Error ? agErr.message : String(agErr)
      // En este punto seguimos (no abortamos creación de candidato) pero registramos warning
      console.warn('[api/candidatos] usuario agente no creado:', agenteMeta.error)
    }
  }

  // 2) Insertar candidato
  normalizeDateFields(body)
  const { data, error } = await supabase.from('candidatos').insert([body]).select().single()
  if (error) return NextResponse.json({ error: error.message, _agente_meta: agenteMeta }, { status: 500 })

  interface CandidatoInsert { id_candidato?: number }
  const idLog = (data as CandidatoInsert)?.id_candidato
  await logAccion('alta_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: idLog, snapshot: data })

  // 3) Responder incluyendo meta de agente (no rompe consumidores existentes)
  return NextResponse.json({ ...data, _agente_meta: agenteMeta })
}
