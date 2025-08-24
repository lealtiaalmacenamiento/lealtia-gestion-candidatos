import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// Versión simplificada y robusta usando createServerClient (maneja todos los formatos de cookie de Supabase)
export async function getUsuarioSesion() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnon) return null

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr) return null
  if (!user?.email) return null

  // Traer registro de tabla usuarios (rol, activo)
  const { data: usuarioBD } = await supabase.from('usuarios').select('*').eq('email', user.email).single()
  if (!usuarioBD) return { email: user.email, rol: null, activo: false }
  return usuarioBD
}
