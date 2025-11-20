import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAccion } from '@/lib/logger'
import { buildAltaUsuarioEmail, sendMail } from '@/lib/mailer'

const VALID_ROLES = new Set(['admin','supervisor','viewer','agente'])

// Cliente admin (service role) sin dependencia de cookies para evitar errores Next 15
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
// Debe ser la service role key (NUNCA exponerla como NEXT_PUBLIC_). Admitimos compat con SUPABASE_KEY.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
if(!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[api/usuarios] Faltan variables SUPABASE_URL / SUPABASE_KEY (service role)')
}
// Pequeña función para comprobar si el JWT contiene claim service_role
function isServiceRoleKey(key: string | undefined): boolean {
  if(!key) return false
  const parts = key.split('.')
  if(parts.length < 2) return false
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

const hasServiceRole = isServiceRoleKey(SUPABASE_SERVICE_KEY)
const adminClient = (SUPABASE_URL && SUPABASE_SERVICE_KEY && hasServiceRole)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null

function isStrongPassword(pw: string) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)
}

function randomTempPassword() {
  // 12 chars: upper lower digit special
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

export async function GET() {
  if(!adminClient) return NextResponse.json({ error: 'Config Supabase incompleta o la key NO es service_role (defina SUPABASE_SERVICE_ROLE_KEY en el servidor)' }, { status: 500 })
  const { data, error } = await adminClient
    .from('usuarios')
    .select('*')
    .order('id', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data)
}

export async function POST(req: Request) {
  try {
  if(!adminClient) return NextResponse.json({ error: 'Config Supabase incompleta o la key NO es service_role (SUPABASE_SERVICE_ROLE_KEY)' }, { status: 500 })

  const body = await req.json()
  const email: string = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const nombre: string | undefined = body.nombre
  const requestedRolRaw: string | null = typeof body.rol === 'string' ? body.rol.trim().toLowerCase() : null
  const rol: string = requestedRolRaw ?? 'supervisor'
  const activo: boolean = body.activo === undefined ? true : !!body.activo
  let password: string | undefined = body.password
  const generarPasswordTemporal: boolean = !!body.generarPasswordTemporal

    if (!email || !rol) {
      return NextResponse.json({ error: 'Email y rol son obligatorios' }, { status: 400 })
    }
    if (rol !== 'supervisor') {
      return NextResponse.json({ error: 'Actualmente solo puedes crear usuarios con rol Supervisor.' }, { status: 400 })
    }
    if (!VALID_ROLES.has(rol)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    }

    // Password handling
    if (generarPasswordTemporal) {
      password = randomTempPassword()
    }
    if (!password) {
      return NextResponse.json({ error: 'Password requerido' }, { status: 400 })
    }
    if (!isStrongPassword(password)) {
      return NextResponse.json({ error: 'Password débil (min 8, mayúscula, minúscula y número)' }, { status: 400 })
    }

    // Unicidad email en tabla usuarios
  const existing = await adminClient.from('usuarios').select('id').eq('email', email).maybeSingle()
    if (existing.error) {
      return NextResponse.json({ error: existing.error.message }, { status: 400 })
    }
    if (existing.data) {
      return NextResponse.json({ error: 'Email ya registrado' }, { status: 409 })
    }

    // 1️⃣ Crear usuario en Auth (manejo de errores detallado)
    let authCreated: { user: { id?: string } | null } | null = null
    if(!hasServiceRole) {
      return NextResponse.json({ error: 'Service role key inválida: revise SUPABASE_SERVICE_ROLE_KEY (mensaje original: User not allowed)' }, { status: 500 })
    }
    try {
  const result = await adminClient.auth.admin.createUser({
        email,
        password: password!,
        email_confirm: true
      })
  authCreated = result.data as { user: { id?: string } | null }
      if (result.error) {
        return NextResponse.json({ error: `Auth create error: ${result.error.message}` }, { status: 400 })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: `Excepción creando usuario auth: ${msg}` }, { status: 400 })
    }

    // 2️⃣ Insertar en tabla usuarios (columas id_auth y must_change_password ya existen)
    const { data: inserted, error: dbError } = await adminClient
      .from('usuarios')
      .insert([{ email, nombre, rol: 'supervisor', activo, must_change_password: true, id_auth: authCreated?.user?.id }])
      .select('*')
      .single()
    if (dbError || !inserted) {
      // Intento de rollback: borrar usuario auth recién creado
      if (authCreated?.user?.id) {
  try { await adminClient.auth.admin.deleteUser(authCreated.user.id) } catch {}
      }
      return NextResponse.json({ error: dbError ? dbError.message : 'Fallo al insertar usuario' }, { status: 400 })
    }

    await logAccion('alta_usuario', { usuario: email, tabla_afectada: 'usuarios', snapshot: { email, nombre, rol, activo } })

    let correoEnviado: boolean | undefined
    let correoError: string | undefined
    if (generarPasswordTemporal) {
      try {
        const { subject, html, text } = buildAltaUsuarioEmail(email, password!)
        await sendMail({ to: email, subject, html, text })
        correoEnviado = true
      } catch (e) {
        correoEnviado = false
        correoError = e instanceof Error ? e.message : 'error desconocido'
        console.warn('[api/usuarios] fallo envío correo:', correoError)
      }
    }

  return NextResponse.json({ success: true, user: inserted, passwordTemporal: generarPasswordTemporal ? password : undefined, correoEnviado, correoError }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
