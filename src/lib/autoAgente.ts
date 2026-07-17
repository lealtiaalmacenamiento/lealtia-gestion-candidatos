import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logAccion } from '@/lib/logger'
import { buildAltaUsuarioEmail, sendMail } from '@/lib/mailer'

interface CrearAgenteOpts { email: string; nombre?: string }
export interface CrearAgenteResultado {
  created?: boolean
  existed?: boolean
  passwordTemporal?: string
  correoEnviado?: boolean
  correoError?: string
  error?: string
  usuarioId?: number
}

// Reutilizamos la lógica de api/usuarios
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

function isServiceRoleKey(key: string | undefined): boolean {
  if(!key) return false
  const parts = key.split('.')
  if(parts.length < 2) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    return payload?.role === 'service_role'
  } catch { return false }
}

function getAdminClient(): { client?: SupabaseClient; error?: string } {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
  if(!SUPABASE_URL || !SERVICE_KEY || !isServiceRoleKey(SERVICE_KEY)) {
    return { error: 'Service role key faltante o inválida' }
  }
  return { client: createClient(SUPABASE_URL, SERVICE_KEY) }
}

export function normalizeCodigoAgente(value: unknown): string | null {
  if (value == null) return null
  const normalized = String(value).trim().toUpperCase()
  if (!normalized) return null
  if (!/^[A-Z0-9_-]{3,32}$/.test(normalized)) {
    throw new Error('El código de agente debe tener entre 3 y 32 caracteres y usar solo letras, números, guion o guion bajo')
  }
  return normalized
}

/**
 * Assigns the code explicitly entered by the user. Previous codes are retained
 * as inactive history when the active value changes.
 */
export async function setManualAgentCode(opts: {
  usuarioId?: number | null
  nombre?: string | null
  code: unknown
}): Promise<{ code: string | null; changed: boolean; error?: string }> {
  const { usuarioId, nombre } = opts
  if (!usuarioId) return { code: null, changed: false, error: 'No se encontró el usuario asociado al candidato' }

  let code: string | null
  try {
    code = normalizeCodigoAgente(opts.code)
  } catch (error) {
    return { code: null, changed: false, error: error instanceof Error ? error.message : 'Código de agente inválido' }
  }

  const adminRes = getAdminClient()
  if (!adminRes.client) return { code, changed: false, error: adminRes.error || 'Sin cliente admin' }
  const admin = adminRes.client

  const { data: currentRows, error: currentError } = await admin
    .from('agent_codes')
    .select('code, agente_id, activo')
    .eq('agente_id', usuarioId)
    .eq('activo', true)
  if (currentError) return { code, changed: false, error: currentError.message }

  const current = (currentRows || []).find((row) => row.code === code)
  if (code && current && currentRows?.length === 1) return { code, changed: false }

  if (code) {
    const { data: owner, error: ownerError } = await admin
      .from('agent_codes')
      .select('agente_id')
      .eq('code', code)
      .maybeSingle()
    if (ownerError) return { code, changed: false, error: ownerError.message }
    if (owner && Number(owner.agente_id) !== Number(usuarioId)) {
      return { code, changed: false, error: 'El código de agente ya está asignado a otro usuario' }
    }
  }

  const { error: deactivateError } = await admin
    .from('agent_codes')
    .update({ activo: false })
    .eq('agente_id', usuarioId)
    .eq('activo', true)
  if (deactivateError) return { code, changed: false, error: deactivateError.message }

  if (!code) return { code: null, changed: (currentRows?.length ?? 0) > 0 }

  const { error: upsertError } = await admin
    .from('agent_codes')
    .upsert(
      {
        code,
        agente_id: usuarioId,
        nombre_agente: nombre?.trim() || 'Agente',
        activo: true,
        expires_at: null
      },
      { onConflict: 'code' }
    )
  if (upsertError) return { code, changed: false, error: upsertError.message }
  return { code, changed: true }
}

export async function crearUsuarioAgenteAuto({ email, nombre }: CrearAgenteOpts): Promise<CrearAgenteResultado> {
  const out: CrearAgenteResultado = {}
  if(!email || !/.+@.+\..+/.test(email)) { out.error = 'Email inválido'; return out }
  const adminRes = getAdminClient()
  if (!adminRes.client) { out.error = adminRes.error; return out }
  const admin = adminRes.client
  // ¿Existe ya? (usuarios)
  const existente = await admin.from('usuarios').select('id,rol').eq('email', email).maybeSingle()
  if (existente.error) { out.error = existente.error.message; return out }
  if (existente.data) { out.existed = true; out.usuarioId = (existente.data as any).id; return out }
  // Crear
  const tempPassword = randomTempPassword()
  if(!isStrongPassword(tempPassword)) { out.error = 'Password generada inválida'; return out }
  const authRes = await admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })
  if (authRes.error) { out.error = 'Auth: ' + authRes.error.message; return out }
  const authId = authRes.data?.user?.id
  const ins = await admin.from('usuarios').insert([{ email, nombre, rol: 'agente', activo: true, must_change_password: true, id_auth: authId }]).select('*').single()
  if (ins.error) {
    // Rollback auth user to evitar huérfanos
    if (authId) {
      try { await admin.auth.admin.deleteUser(authId) } catch {}
    }
    if (ins.error.message && /duplicate key value/.test(ins.error.message)) {
      out.error = 'PK duplicada: posible des-sincronización de la secuencia (reseed).'
    } else {
      out.error = 'DB usuarios: ' + ins.error.message
    }
    return out
  }
  out.created = true
  out.usuarioId = (ins.data as any)?.id
  out.passwordTemporal = tempPassword
  await logAccion('alta_usuario_auto_candidato', { usuario: email, tabla_afectada: 'usuarios', snapshot: { email, nombre, rol: 'agente' } })
  try {
    const { subject, html, text } = buildAltaUsuarioEmail(email, tempPassword)
    await sendMail({ to: email, subject, html, text })
    out.correoEnviado = true
  } catch (e) {
    out.correoEnviado = false
    out.correoError = e instanceof Error ? e.message : 'error desconocido'
  }
  return out
}
