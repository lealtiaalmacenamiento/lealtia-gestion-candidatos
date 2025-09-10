import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { logAccion } from '@/lib/logger'

const supabase = getServiceClient()

const allowedFields = new Set([
  'nombre_comercial','tipo_producto','moneda','duracion_anios',
  'condicion_sa_tipo','sa_min','sa_max','condicion_edad_tipo','edad_min','edad_max',
  'anio_1_percent','anio_2_percent','anio_3_percent','anio_4_percent','anio_5_percent',
  'anio_6_percent','anio_7_percent','anio_8_percent','anio_9_percent','anio_10_percent','anio_11_plus_percent',
  'puntos_multiplicador','activo'
])

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supa = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
  const { data: { user } } = await supa.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: usuario } = await supa.from('usuarios').select('*').eq('email', user.email).maybeSingle()
  const rol = usuario?.rol ? String(usuario.rol).trim().toLowerCase() : undefined
  const allowedRoles = ['admin','superusuario','super_usuario','supervisor']
  const isProd = (process.env.VERCEL_ENV === 'production') || (process.env.NODE_ENV === 'production')
  const allowed = usuario?.activo && (allowedRoles.includes(rol ?? '') || !isProd)
  if (!allowed) {
    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin permiso', ...(debug ? { rol, activo: usuario?.activo } : {}) }, { status: 403 })
  }

  const existente = await supabase.from('producto_parametros').select('*').eq('id', id).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })

  const body = await req.json()
  // Filtra campos permitidos; ignora el resto para permitir payloads con extras del UI
  const cleaned = Object.fromEntries(
    Object.entries(body).filter(([k]) => (allowedFields as Set<string>).has(k as string))
  )
  if (Object.keys(cleaned).length === 0) {
    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin cambios', ...(debug ? { provided_keys: Object.keys(body) } : {}) }, { status: 400 })
  }
  const { data, error } = await supabase.from('producto_parametros').update(cleaned).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('edicion_producto_parametro', { usuario: usuario.email, tabla_afectada: 'producto_parametros', id_registro: data?.id ?? 0, snapshot: existente.data })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supa = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
    }
  })
  const { data: { user } } = await supa.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: usuario } = await supa.from('usuarios').select('*').eq('email', user.email).maybeSingle()
  const rol = usuario?.rol ? String(usuario.rol).trim().toLowerCase() : undefined
  const allowedRoles = ['admin','superusuario','super_usuario','supervisor']
  const isProd = (process.env.VERCEL_ENV === 'production') || (process.env.NODE_ENV === 'production')
  const allowed = usuario?.activo && (allowedRoles.includes(rol ?? '') || !isProd)
  if (!allowed) {
    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin permiso', ...(debug ? { rol, activo: usuario?.activo } : {}) }, { status: 403 })
  }

  const existente = await supabase.from('producto_parametros').select('*').eq('id', id).single()
  if (existente.error) return NextResponse.json({ error: existente.error.message }, { status: 500 })

  const { error } = await supabase.from('producto_parametros').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('borrado_producto_parametro', { usuario: usuario.email, tabla_afectada: 'producto_parametros', id_registro: 0, snapshot: existente.data })
  return NextResponse.json({ success: true })
}
