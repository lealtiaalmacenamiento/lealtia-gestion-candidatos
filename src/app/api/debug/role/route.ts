import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getSupa() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
}

export async function GET() {
  const supa = await getSupa()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // jwt_role() no es accesible directo, pero el claim role puede venir en el JWT de service/anon; para usuarios típicos será 'authenticated'
  // Supabase getUser() no devuelve session aquí; el claim de rol JWT típico para usuarios será 'authenticated'
  const jwtRole = 'authenticated'

  const { data: usuarioRow } = await supa.from('usuarios').select('id,id_auth,rol,activo,email').eq('id_auth', auth.user.id).maybeSingle()
  let isSuperWrapper: boolean | null = null
  try {
    const { data } = await supa.rpc('is_super_role_wrapper')
    if (typeof data === 'boolean') isSuperWrapper = data
  } catch {}

  return NextResponse.json({
    auth_uid: auth.user.id,
    jwt_role_claim: jwtRole,
    usuario_row: usuarioRow,
    is_super_role: isSuperWrapper,
    hints: {
      needs_usuario_row: !usuarioRow ? 'Crear fila en usuarios con id_auth = auth_uid y rol=supervisor (o superusuario) y activo=true' : null,
      inactive: usuarioRow && usuarioRow.activo === false ? 'Marcar activo=true' : null,
      role_value: usuarioRow ? `rol actual: ${usuarioRow.rol}` : null
    }
  })
}
