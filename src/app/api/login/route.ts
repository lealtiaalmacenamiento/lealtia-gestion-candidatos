import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { logAccion } from '@/lib/logger'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { SESSION_COOKIE_BASE, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/sessionExpiration'
import { getServiceClient } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Extrae access token de múltiples formatos posibles de cookies Supabase (array, objeto, raw)

export async function GET() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: usuarioBD, error } = await supabase.from('usuarios').select('*').eq('email', user.email).maybeSingle()
  if (error) {
    console.warn('[GET /api/login] error select usuarios', error.message)
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!usuarioBD) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!usuarioBD.activo) return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })
  
  // Obtener código de agente si existe - usar service client para evitar problemas de RLS
  const adminClient = getServiceClient()
  const { data: agentCode, error: codeError } = await adminClient
    .from('agent_codes')
    .select('code')
    .eq('agente_id', usuarioBD.id)
    .eq('activo', true)
    .maybeSingle()
  
  return NextResponse.json({ ...usuarioBD, codigo_agente: agentCode?.code })
}

export async function POST(req: Request) {
  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: 'Faltan credenciales' }, { status: 400 })
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
  const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !signIn?.session || !signIn.user?.email) {
    console.error('[POST /api/login] fallo signIn', error)
    return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 })
  }
  const { data: usuarioBD, error: userError } = await supabase.from('usuarios').select('*').eq('email', signIn.user.email).maybeSingle()
  if (userError || !usuarioBD) {
    console.warn('[POST /api/login] usuario no encontrado en tabla usuarios', userError)
    return NextResponse.json({ error: 'Usuario no encontrado en la BD' }, { status: 404 })
  }
  if (!usuarioBD.activo) {
    console.warn('[POST /api/login] usuario inactivo')
    return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })
  }
  
  // Obtener código de agente si existe
  const { data: agentCode, error: codeError } = await supabase
    .from('agent_codes')
    .select('code')
    .eq('agente_id', usuarioBD.id)
    .eq('activo', true)
    .maybeSingle()
  
  await logAccion('login_ok', { usuario: usuarioBD.email })
  const res = NextResponse.json({ ...usuarioBD, codigo_agente: agentCode?.code }, { headers: { 'Cache-Control': 'no-store' } })
  res.cookies.set(SESSION_COOKIE_NAME, String(Date.now()), {
    ...SESSION_COOKIE_BASE,
    maxAge: SESSION_MAX_AGE_SECONDS
  })
  return res
}
