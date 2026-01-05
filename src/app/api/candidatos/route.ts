import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'
import { logAccion } from '@/lib/logger'
import { normalizeDateFields } from '@/lib/dateUtils'
import { calcularDerivados } from '@/lib/proceso'
import { crearUsuarioAgenteAuto } from '@/lib/autoAgente'
import { sanitizeCandidatoPayload } from '@/lib/sanitize'

// Forzar runtime Node.js (necesario para nodemailer / auth admin)
export const runtime = 'nodejs'


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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const verEliminados = url.searchParams.get('eliminados') === '1'
  const ct = url.searchParams.get('ct')
  const emailCand = url.searchParams.get('email_agente')
  
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
    if (!data) return NextResponse.json(null)
    
    // Enriquecer con conteo de pólizas
    const enriched = await enrichCandidatoWithPolizas(data)
    return NextResponse.json(enriched)
  }
  
  if (emailCand) {
    // Búsqueda por email (normalizado a minúsculas) en no eliminados
    const email = emailCand.trim().toLowerCase()
    const { data, error } = await supabase
      .from('candidatos')
      .select('*')
      .eq('email_agente', email)
      .eq('eliminado', false)
      .limit(1)
      .maybeSingle()
    if (error && error.code !== 'PGRST116') return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json(null)
    
    // Enriquecer con conteo de pólizas
    const enriched = await enrichCandidatoWithPolizas(data)
    return NextResponse.json(enriched)
  }
  
  const query = supabase
    .from('candidatos')
    .select('*')
    .eq('eliminado', verEliminados ? true : false)
    .order('id_candidato', { ascending: true })
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  // Enriquecer todos los candidatos con conteo de pólizas
  const enriched = await enrichCandidatosWithPolizas(data || [])
  return NextResponse.json(enriched)
}

/**
 * Enriquece un candidato con los conteos de pólizas GMM y VI desde la base de datos
 */
async function enrichCandidatoWithPolizas(candidato: any): Promise<any> {
  if (!candidato.email_agente) {
    // Si no tiene email_agente, retornar sin modificar
    return candidato
  }
  
  const email = candidato.email_agente.toLowerCase()
  
  // Buscar usuario por email para obtener id_auth
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id_auth')
    .eq('email', email)
    .eq('activo', true)
    .maybeSingle()
  
  if (!usuario?.id_auth) {
    // Usuario no existe o no tiene id_auth, retornar sin modificar
    return candidato
  }
  
  // Obtener pólizas del agente agrupadas por tipo de producto
  const { data: polizas } = await supabase
    .from('polizas')
    .select('puntos_actuales, producto_parametros!inner(product_types!inner(code)), clientes!inner(asesor_id, activo)')
    .eq('clientes.asesor_id', usuario.id_auth)
    .eq('clientes.activo', true)
    .eq('estatus', 'EN_VIGOR')
  
  let seg_gmm = 0
  let seg_vida = 0
  
  for (const poliza of polizas || []) {
    const puntos = typeof poliza.puntos_actuales === 'number' ? poliza.puntos_actuales : 0
    const productCode = (poliza as any)?.producto_parametros?.product_types?.code?.toUpperCase() || ''
    
    if (productCode === 'GMM') {
      seg_gmm += puntos
    } else if (productCode === 'VI') {
      seg_vida += puntos
    }
  }
  
  // Retornar candidato enriquecido
  // Los valores calculados se prefieren sobre los almacenados, pero se permiten overrides manuales
  // Si el usuario editó manualmente, esos valores prevalecen (verificado en el PUT)
  return {
    ...candidato,
    seg_gmm: Number(seg_gmm.toFixed(1)), // GMM permite 0.5
    seg_vida: Math.round(seg_vida) // VI solo enteros
  }
}

/**
 * Enriquece múltiples candidatos con los conteos de pólizas de forma eficiente
 */
async function enrichCandidatosWithPolizas(candidatos: any[]): Promise<any[]> {
  if (!candidatos.length) return candidatos
  
  // Obtener todos los emails de agentes únicos
  const emails = [...new Set(candidatos.map(c => c.email_agente).filter(Boolean).map(e => e.toLowerCase()))]
  if (!emails.length) return candidatos
  
  // Buscar usuarios por emails
  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('id_auth, email')
    .in('email', emails)
    .eq('activo', true)
  
  if (!usuarios?.length) return candidatos
  
  const emailToIdAuth = new Map(usuarios.map(u => [u.email.toLowerCase(), u.id_auth]))
  const idAuthList = usuarios.map(u => u.id_auth).filter(Boolean)
  
  if (!idAuthList.length) return candidatos
  
  // Obtener todas las pólizas de estos agentes
  const { data: polizas } = await supabase
    .from('polizas')
    .select('puntos_actuales, producto_parametros!inner(product_types!inner(code)), clientes!inner(asesor_id, activo)')
    .in('clientes.asesor_id', idAuthList)
    .eq('clientes.activo', true)
    .eq('estatus', 'EN_VIGOR')
  
  // Agrupar puntos por id_auth y tipo de producto
  const puntosMap = new Map<string, { gmm: number; vi: number }>()
  
  for (const poliza of polizas || []) {
    const asesorId = (poliza as any)?.clientes?.asesor_id
    if (!asesorId) continue
    
    const puntos = typeof poliza.puntos_actuales === 'number' ? poliza.puntos_actuales : 0
    const productCode = (poliza as any)?.producto_parametros?.product_types?.code?.toUpperCase() || ''
    
    if (!puntosMap.has(asesorId)) {
      puntosMap.set(asesorId, { gmm: 0, vi: 0 })
    }
    
    const current = puntosMap.get(asesorId)!
    if (productCode === 'GMM') {
      current.gmm += puntos
    } else if (productCode === 'VI') {
      current.vi += puntos
    }
  }
  
  // Enriquecer candidatos
  return candidatos.map(candidato => {
    if (!candidato.email_agente) return candidato
    
    const email = candidato.email_agente.toLowerCase()
    const idAuth = emailToIdAuth.get(email)
    
    if (!idAuth) return candidato
    
    const puntos = puntosMap.get(idAuth) || { gmm: 0, vi: 0 }
    
    return {
      ...candidato,
      seg_gmm: Number(puntos.gmm.toFixed(1)),
      seg_vida: Math.round(puntos.vi)
    }
  })
}

export async function POST(req: Request) {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!usuario.activo) return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })

  const raw = await req.json()
  const body = sanitizeCandidatoPayload(raw)
  body.mes_conexion = normalizeMesConexion(raw?.mes_conexion ?? body?.mes_conexion)
  const emailAgenteRaw: unknown = body.email_agente
  const emailAgente = typeof emailAgenteRaw === 'string' ? emailAgenteRaw.trim().toLowerCase() : ''
  // email_agente se conserva para insertar en columna (asegúrate de haber agregado la columna en BD)
  // Validación mínima de campos requeridos
  const requeridos: Array<keyof typeof body> = ['candidato', 'mes', 'efc']
  const faltan = requeridos.filter(k => !body[k] || (typeof body[k] === 'string' && body[k].trim() === ''))
  if (faltan.length) return NextResponse.json({ error: `Faltan campos: ${faltan.join(', ')}` }, { status: 400 })

  // Validación: email (email_agente) único (entre no eliminados)
  if (emailAgente) {
    const { data: dupEmail, error: errEmail } = await supabase
      .from('candidatos')
      .select('id_candidato, candidato, email_agente')
      .eq('email_agente', emailAgente)
      .eq('eliminado', false)
      .limit(1)
      .maybeSingle()
    if (errEmail && errEmail.code !== 'PGRST116') return NextResponse.json({ error: errEmail.message }, { status: 500 })
    if (dupEmail) {
      return NextResponse.json({ error: `El correo ya pertenece al candidato "${dupEmail.candidato}" (ID ${dupEmail.id_candidato}).` }, { status: 409 })
    }
  }

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
    fecha_creacion_ct: body.fecha_creacion_ct,
    fecha_creacion_pop: body.fecha_creacion_pop
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
  body.mes_conexion = resolveMesConexion(body.mes_conexion, body.fecha_creacion_ct, body.fecha_creacion_pop)
  // aseguramos que email_agente se guarde normalizado
  if (emailAgente) {
    body.email_agente = emailAgente
  } else {
    body.email_agente = null
  }
  const { data, error } = await supabase.from('candidatos').insert([body]).select().single()
  if (error) return NextResponse.json({ error: error.message, _agente_meta: agenteMeta }, { status: 500 })

  interface CandidatoInsert { id_candidato?: number }
  const idLog = (data as CandidatoInsert)?.id_candidato
  await logAccion('alta_candidato', { usuario: usuario.email, tabla_afectada: 'candidatos', id_registro: idLog, snapshot: data })

  // 3) Responder incluyendo meta de agente (no rompe consumidores existentes)
  if (agenteMeta.passwordTemporal) delete agenteMeta.passwordTemporal
  return NextResponse.json({ ...data, _agente_meta: agenteMeta })
}
