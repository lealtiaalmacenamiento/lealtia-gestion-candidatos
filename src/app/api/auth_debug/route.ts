import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getServiceClient } from '@/lib/supabaseAdmin'

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

  return NextResponse.json({ user, error: error?.message, cookieNames, usuarioBD, dbError, projectRefs: { ssrProjectRef, serviceRef } })
}