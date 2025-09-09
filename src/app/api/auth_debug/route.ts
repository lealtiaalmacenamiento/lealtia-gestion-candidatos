import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { getUsuarioSesion } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const ssrProjectRef = supabaseUrl?.replace(/^https?:\/\//,'').split('.')[0]
  const serviceUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRef = serviceUrl?.replace(/^https?:\/\//,'').split('.')[0]
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
  const { data: { user }, error } = await supabase.auth.getUser()
  const cookieNames = cookieStore.getAll().map(c=>c.name)
  const url = new URL(req.url)
  const includeDb = url.searchParams.get('includeDb') === '1'
  const deep = url.searchParams.get('deep') === '1'

  let usuarioBD: unknown = null
  let dbError: string | null = null
  if (includeDb && user?.email) {
    try {
      const admin = getServiceClient()
      const { data, error: dbErr } = await admin
        .from('usuarios')
        .select('id,email,rol,activo,nombre,last_login')
        .eq('email', user.email)
        .maybeSingle()
      usuarioBD = data ?? null
      dbError = dbErr?.message ?? null
    } catch (e) {
      dbError = e instanceof Error ? e.message : 'unknown error'
    }
  }
  let deepDiag: Record<string, { data: unknown; error: string | null } | string> | undefined
  if (deep && user) {
    deepDiag = {}
    try {
      const admin = getServiceClient()
      const r1 = await admin.from('usuarios').select('id,email,rol,activo,nombre,id_auth').eq('id_auth', user.id).maybeSingle()
      deepDiag['admin_by_id_auth'] = { data: r1.data ?? null, error: r1.error?.message ?? null }
      const r2 = await admin.from('usuarios').select('id,email,rol,activo,nombre,id_auth').eq('email', user.email).maybeSingle()
      deepDiag['admin_by_email'] = { data: r2.data ?? null, error: r2.error?.message ?? null }
      const r3 = await admin.from('usuarios').select('count').limit(1)
      deepDiag['admin_probe'] = { data: r3.data ?? null, error: r3.error?.message ?? null }
    } catch (e) {
      deepDiag['admin_client_error'] = e instanceof Error ? e.message : 'unknown'
    }
    try {
      const ssr = supabase
      const s1 = await ssr.from('usuarios').select('id,email,rol,activo,nombre,id_auth').eq('id_auth', user.id).maybeSingle()
      deepDiag['ssr_by_id_auth'] = { data: s1.data ?? null, error: s1.error?.message ?? null }
      const s2 = await ssr.from('usuarios').select('id,email,rol,activo,nombre,id_auth').eq('email', user.email).maybeSingle()
      deepDiag['ssr_by_email'] = { data: s2.data ?? null, error: s2.error?.message ?? null }
      const s3 = await ssr.from('usuarios').select('count').limit(1)
      deepDiag['ssr_probe'] = { data: s3.data ?? null, error: s3.error?.message ?? null }
    } catch (e) {
      deepDiag['ssr_client_error'] = e instanceof Error ? e.message : 'unknown'
    }
  }

  // También probamos nuestra función unificada usada por las rutas protegidas
  let usuarioSesion: unknown = null
  try {
    usuarioSesion = await getUsuarioSesion()
  } catch {}

  return NextResponse.json({ user, error: error?.message, cookieNames, usuarioBD, dbError, projectRefs: { ssrProjectRef, serviceRef }, deepDiag, usuarioSesion })
}