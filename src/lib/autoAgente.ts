import { createClient } from '@supabase/supabase-js'
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

export async function crearUsuarioAgenteAuto({ email, nombre }: CrearAgenteOpts): Promise<CrearAgenteResultado> {
  const out: CrearAgenteResultado = {}
  if(!email || !/.+@.+\..+/.test(email)) { out.error = 'Email inválido'; return out }
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
  if(!SUPABASE_URL || !SERVICE_KEY || !isServiceRoleKey(SERVICE_KEY)) { out.error = 'Service role key faltante o inválida'; return out }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  // ¿Existe ya? (usuarios)
  const existente = await admin.from('usuarios').select('id,rol').eq('email', email).maybeSingle()
  if (existente.error) { out.error = existente.error.message; return out }
  if (existente.data) { out.existed = true; return out }
  // Crear
  const tempPassword = randomTempPassword()
  if(!isStrongPassword(tempPassword)) { out.error = 'Password generada inválida'; return out }
  const authRes = await admin.auth.admin.createUser({ email, password: tempPassword, email_confirm: true })
  if (authRes.error) { out.error = 'Auth: ' + authRes.error.message; return out }
  const authId = authRes.data?.user?.id
  const ins = await admin.from('usuarios').insert([{ email, nombre, rol: 'agente', activo: true, must_change_password: true, id_auth: authId }]).select('*').single()
  if (ins.error) { out.error = 'DB usuarios: ' + ins.error.message; return out }
  out.created = true
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
