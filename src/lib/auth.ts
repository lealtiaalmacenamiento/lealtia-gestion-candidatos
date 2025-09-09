import { cookies as nextCookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { getServiceClient } from '@/lib/supabaseAdmin'

export type UsuarioSesion = Database['public']['Tables']['usuarios']['Row']

// Versión simplificada y robusta usando createServerClient (maneja todos los formatos de cookie de Supabase)
export async function getUsuarioSesion(h?: Headers): Promise<UsuarioSesion | null> {
  const store = await nextCookies()
  const cookieAdapter = {
    get(name: string) { return store.get(name)?.value },
    set(name: string, value: string, options: CookieOptions) { store.set({ name, value, ...options }) },
    remove(name: string, options: CookieOptions) { store.set({ name, value: '', ...options }) }
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnon) return null

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnon, { cookies: cookieAdapter })

  // Soporte de Authorization: Bearer <access_token> (cuando no haya cookies de SSR)
  type UserMinimal = { id?: string | null; email?: string | null }
  let user: UserMinimal | null = null
  const bearer = h?.get('authorization') || h?.get('Authorization')
  if (bearer && bearer.toLowerCase().startsWith('bearer ')) {
    const token = bearer.slice(7).trim()
    try {
      const { data } = await supabase.auth.getUser(token)
      user = (data?.user as UserMinimal) ?? null
  } catch {
      user = null
    }
  } else {
  const res = await supabase.auth.getUser()
    user = (res.data?.user as UserMinimal) ?? null
    // Fallback: extraer access_token directo de cookies sb-<projectRef>-auth-token o sb-access-token
    if (!user) {
      try {
        const projectRef = process.env.SUPABASE_PROJECT_REF
          || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//,'').split('.')[0]
          || ''
    const all = store.getAll().map(c => ({ name: c.name, value: c.value }))
        const compositeName = projectRef ? `sb-${projectRef}-auth-token` : null
        let accessToken: string | null = null
        const findAccessTokenInJson = (obj: unknown): string | null => {
          if (!obj || typeof obj !== 'object') return null
          const anyObj = obj as Record<string, unknown>
          if (typeof anyObj['access_token'] === 'string') return anyObj['access_token'] as string
          // Common shapes: { currentSession: { access_token } } or { data: { session: { access_token } } }
          for (const key of Object.keys(anyObj)) {
            const val = anyObj[key]
            const found = findAccessTokenInJson(val)
            if (found) return found
          }
          return null
        }
        // Buscar cookie compuesta
        if (compositeName) {
          const c = all.find(x => x.name === compositeName || x.name.startsWith(compositeName + '.'))
          if (c?.value) {
            try {
              const parsed = JSON.parse(c.value)
              const found = findAccessTokenInJson(parsed)
              if (found) accessToken = found
            } catch {
              // Ignorar
            }
          }
        }
        // Fallback a sb-access-token (flujo antiguo)
        if (!accessToken) {
          const a = all.find(x => x.name === 'sb-access-token')
          if (a?.value) accessToken = a.value
        }
        if (accessToken) {
          const { data } = await supabase.auth.getUser(accessToken)
          user = (data?.user as UserMinimal) ?? null
        }
      } catch {
        // sin cambio
      }
    }
  }
  if (!user?.email) return null

  // Traer registro de tabla usuarios intentando por id_auth y por email.
  // Primero con service role (evita RLS); si no se encuentra o no hay service key, usamos SSR.
  const selectCols = 'id,email,rol,activo,nombre,last_login,id_auth'
  async function lookupUsuarioBy(client: SupabaseClient): Promise<UsuarioSesion | null> {
    // 1) id_auth si existe
    try {
      if (user && user.id) {
        const { data } = await client
          .from('usuarios')
          .select(selectCols)
          .eq('id_auth', user.id)
          .maybeSingle()
        if (data) return data as UsuarioSesion
      }
    } catch {}
    // 2) email exacto
    try {
      if (user && user.email) {
        const { data } = await client
          .from('usuarios')
          .select(selectCols)
          .eq('email', user.email)
          .maybeSingle()
        if (data) return data as UsuarioSesion
      }
    } catch {}
    // 3) email trim
    try {
      if (user && user.email) {
        const emailTrim = user.email.trim()
        if (emailTrim !== user.email) {
          const { data } = await client
            .from('usuarios')
            .select(selectCols)
            .eq('email', emailTrim)
            .maybeSingle()
          if (data) return data as UsuarioSesion
        }
      }
    } catch {}
    // 4) email case-insensitive exact (ilike sin comodines)
    try {
      if (user && user.email) {
        const { data } = await client
          .from('usuarios')
          .select(selectCols)
          .ilike('email', user.email)
          .maybeSingle()
        if (data) return data as UsuarioSesion
      }
    } catch {}
    return null
  }

  let usuarioBD: UsuarioSesion | null = null
  try {
    const admin = getServiceClient()
    usuarioBD = await lookupUsuarioBy(admin)
  } catch {
    // ignore
  }
  if (!usuarioBD) {
    usuarioBD = await lookupUsuarioBy(supabase as unknown as SupabaseClient)
  }
  if (!usuarioBD) return null
  // Actualizar last_login si la columna existe y han pasado >=5 min desde el último (para reducir escrituras)
  interface UsuarioRow { id: number; last_login?: string | null }
  const row = usuarioBD as unknown as UsuarioRow
  const last = row.last_login ? new Date(row.last_login) : null
  const now = new Date()
  if (!last || (now.getTime() - last.getTime()) > 5*60*1000) {
    // Intentar actualización con admin si existe; si no, con SSR. Si falla, ignorar.
    try {
      const admin = getServiceClient()
      if (typeof row.id === 'number' && row.id > 0) {
        await admin
          .from('usuarios')
          .update({ last_login: now.toISOString() } as Partial<Database['public']['Tables']['usuarios']['Update']>)
          .eq('id', row.id)
      }
    } catch {
      try {
        if (typeof row.id === 'number' && row.id > 0) {
          await supabase
            .from('usuarios')
            .update({ last_login: now.toISOString() } as Partial<Database['public']['Tables']['usuarios']['Update']>)
            .eq('id', row.id)
        }
      } catch {}
    }
    row.last_login = now.toISOString()
  }
  return usuarioBD as UsuarioSesion
}
