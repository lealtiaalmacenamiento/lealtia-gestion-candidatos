import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { Database } from '@/types/supabase'

export type UsuarioSesion = Database['public']['Tables']['usuarios']['Row']

// Versión simplificada y robusta usando createServerClient (maneja todos los formatos de cookie de Supabase)
export async function getUsuarioSesion(h?: Headers): Promise<UsuarioSesion | null> {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnon) return null

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })

  // Soporte de Authorization: Bearer <access_token> (cuando no haya cookies de SSR)
  let user: { email?: string | null } | null = null
  let userErr: unknown = null
  const bearer = h?.get('authorization') || h?.get('Authorization')
  if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
    const token = bearer.slice(7).trim()
    try {
      const { data, error } = await supabase.auth.getUser(token)
      user = data?.user ?? null
      userErr = error ?? null
    } catch (e) {
      user = null
      userErr = e
    }
  } else {
    const res = await supabase.auth.getUser()
    user = res.data?.user ?? null
    userErr = res.error ?? null
  }
  if (userErr) return null
  if (!user?.email) return null

  // Traer registro de tabla usuarios (rol, activo)
  const { data: usuarioBD } = await supabase
    .from('usuarios')
    .select('id,email,rol,activo,nombre,last_login')
    .eq('email', user.email)
    .maybeSingle()
  if (!usuarioBD) return null
  // Actualizar last_login si la columna existe y han pasado >=5 min desde el último (para reducir escrituras)
  interface UsuarioRow { id: number; last_login?: string | null }
  const row = usuarioBD as unknown as UsuarioRow
  const last = row.last_login ? new Date(row.last_login) : null
  const now = new Date()
  if (!last || (now.getTime() - last.getTime()) > 5*60*1000) {
    // Intentar actualización; si la columna no existe, Supabase retornará error ignorado
    await supabase
      .from('usuarios')
      .update({ last_login: now.toISOString() } as Partial<Database['public']['Tables']['usuarios']['Update']>)
      .eq('id', row.id)
    row.last_login = now.toISOString()
  }
  return usuarioBD as UsuarioSesion
}
