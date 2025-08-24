import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { buildAltaUsuarioEmail, sendMail } from '@/lib/mailer'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

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

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if(!email) return NextResponse.json({ error: 'Email requerido' }, { status:400 })
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
        remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
      }
    })

    // Verificar usuario interno
  // Verificar que quien hace el reset está autenticado y tiene rol permitido
  const { data: { user: sessionUser }, error: sessionErr } = await supabase.auth.getUser()
  if (sessionErr || !sessionUser?.email) return NextResponse.json({ error: 'No autenticado' }, { status:401 })
  const { data: currentUser } = await supabase.from('usuarios').select('rol').eq('email', sessionUser.email).maybeSingle()
  const allowedRoles = new Set(['admin','superusuario'])
  if (!currentUser || !allowedRoles.has((currentUser.rol||'').toLowerCase())) return NextResponse.json({ error: 'No autorizado' }, { status:403 })

  const { data: userRow, error: userErr } = await supabase.from('usuarios').select('*').eq('email', email.toLowerCase()).single()
    if (userErr || !userRow) return NextResponse.json({ error: 'Usuario no encontrado' }, { status:404 })

    // Generar nueva password temporal
    const nueva = randomTempPassword()
    // Resolver id_auth válido (UUID). userRow.id ahora es numérico PK; no sirve para admin.updateUserById
  interface UserRowAuth { id_auth?: string; id: number }
  const typedUser = userRow as unknown as UserRowAuth
  let authId = typedUser.id_auth
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!authId || !uuidRegex.test(authId)) {
      // Buscar en auth por email
      const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (list.error) return NextResponse.json({ error: 'No se pudo listar usuarios auth: '+list.error.message }, { status:500 })
      const found = list.data.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (!found) return NextResponse.json({ error: 'Usuario auth no encontrado' }, { status:404 })
      authId = found.id
      // Persistir id_auth si no estaba
  if (!typedUser.id_auth) {
        await supabase.from('usuarios').update({ id_auth: authId }).eq('id', userRow.id)
      }
    }
  // Cliente admin con service role (solo en servidor). No usar cookies aquí.
  const adminClient = getServiceClient()
  const { error: updAuth } = await adminClient.auth.admin.updateUserById(authId, { password: nueva })
  if (updAuth) return NextResponse.json({ error: updAuth.message }, { status:400 })

    // Flag must_change_password
  await supabase.from('usuarios').update({ must_change_password: true }).eq('id', userRow.id)

    try {
      const { subject, html, text } = buildAltaUsuarioEmail(email, nueva)
      await sendMail({ to: email, subject: '[Reset] ' + subject, html, text })
    } catch {}

    await logAccion('reset_password', { usuario: email, tabla_afectada: 'usuarios', snapshot: { email } })
    return NextResponse.json({ success:true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status:500 })
  }
}