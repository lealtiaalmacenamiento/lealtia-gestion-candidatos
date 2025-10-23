import { cookies as nextCookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { getServiceClient } from '@/lib/supabaseAdmin'

export type UsuarioSesion = Database['public']['Tables']['usuarios']['Row']

// Versión simplificada y robusta usando createServerClient (maneja todos los formatos de cookie de Supabase)
export async function getUsuarioSesion(h?: Headers): Promise<UsuarioSesion | null> {
  const store = await nextCookies()
  const cookieNames = store.getAll().map(c => c.name)
  if (process.env.NODE_ENV !== 'production') {
    console.info('[auth] cookies presentes', cookieNames)
  } else if (process.env.AUTH_DEBUG_LOG === '1') {
    console.log('[auth] cookies presentes', cookieNames)
  }
  const cookieAdapter = {
    get(name: string) { return store.get(name)?.value },
    set(name: string, value: string, options: CookieOptions) { store.set({ name, value, ...options }) },
    remove(name: string, options: CookieOptions) { store.set({ name, value: '', ...options }) }
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.SUPABASE_URL
    ?? process.env.SUPABASE_PROJECT_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.SUPABASE_ANON_KEY
    ?? process.env.SUPABASE_PUBLIC_ANON_KEY
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
    if (!res.data?.user && res.error && (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG_LOG === '1')) {
      console.warn('[auth] getUser sin usuario', { error: res.error.message })
    }
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
          if (!user && (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG_LOG === '1')) {
            console.warn('[auth] access token fallback sin usuario')
          }
        }
      } catch {
        // sin cambio
      }
    }
  }
  if (!user && (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG_LOG === '1')) {
    console.warn('[auth] no se obtuvo usuario de cookies/bearer')
  }
  if (!user?.email) return null

  // Traer registro de tabla usuarios intentando por id_auth y por email.
  // Primero con service role (evita RLS); si no se encuentra o no hay service key, usamos SSR.
  // No uses last_login in select to avoid errors if column is missing in some environments
  const selectCols = 'id,email,rol,activo,nombre,id_auth,must_change_password,is_desarrollador'
  const legacySelectCols = 'id,email,rol,activo,nombre,id_auth'

  async function fetchUsuario(
    client: SupabaseClient,
    column: 'id_auth' | 'email',
    value: string
  ) {
    const attempt = await client
      .from('usuarios')
      .select(selectCols)
      .eq(column, value)
      .maybeSingle()
    const needsLegacy = attempt.error && /must_change_password|is_desarrollador/i.test(attempt.error.message || '')
    if (!needsLegacy) return attempt

    const fallback = await client
      .from('usuarios')
      .select(legacySelectCols)
      .eq(column, value)
      .maybeSingle()
    if (fallback.data) {
      fallback.data = {
        ...fallback.data,
        must_change_password: false,
        is_desarrollador: false
      } as unknown as typeof attempt.data
    }
    return fallback
  }

  async function lookupUsuarioBy(client: SupabaseClient): Promise<UsuarioSesion | null> {
    // 1) id_auth si existe
    try {
      if (user && user.id) {
        const { data } = await fetchUsuario(client, 'id_auth', user.id)
        if (data) return data as UsuarioSesion
      }
    } catch {}
    // 2) email exacto
    try {
      if (user && user.email) {
        const { data } = await fetchUsuario(client, 'email', user.email)
        if (data) return data as UsuarioSesion
      }
    } catch {}
    // 3) email trim
    try {
      if (user && user.email) {
        const emailTrim = user.email.trim()
        if (emailTrim !== user.email) {
          const { data } = await fetchUsuario(client, 'email', emailTrim)
          if (data) return data as UsuarioSesion
        }
      }
    } catch {}
    // 4) email case-insensitive exact (ilike sin comodines)
    try {
      if (user && user.email) {
        const attempt = await client
          .from('usuarios')
          .select(selectCols)
          .ilike('email', user.email)
          .maybeSingle()
        const needsLegacy = attempt.error && /must_change_password|is_desarrollador/i.test(attempt.error.message || '')
        if (attempt.data) return attempt.data as UsuarioSesion
        if (needsLegacy) {
          const fallback = await client
            .from('usuarios')
            .select(legacySelectCols)
            .ilike('email', user.email)
            .maybeSingle()
          if (fallback.data) {
            return {
              ...fallback.data,
              must_change_password: false,
              is_desarrollador: false
            } as unknown as UsuarioSesion
          }
        }
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
  // Nota: dejamos de actualizar public.usuarios.last_login.
  // Usa Supabase Auth user.last_sign_in_at para obtener el último acceso.
  return usuarioBD as UsuarioSesion
}
