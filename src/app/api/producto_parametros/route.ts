import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabaseAdmin'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { logAccion } from '@/lib/logger'
import { canReadProductoParametros, canWriteProductoParametros, isActiveUser } from '@/lib/roles'

const supabase = getServiceClient()

const allowedFields = new Set([
  'nombre_comercial','tipo_producto','moneda','duracion_anios',
  'condicion_sa_tipo','sa_min','sa_max','condicion_edad_tipo','edad_min','edad_max',
  'anio_1_percent','anio_2_percent','anio_3_percent','anio_4_percent','anio_5_percent',
  'anio_6_percent','anio_7_percent','anio_8_percent','anio_9_percent','anio_10_percent','anio_11_plus_percent',
  'puntos_multiplicador','activo','product_type_id'
])

const PRODUCT_TYPE_SELECT = 'id,code,name,description,active,created_at,updated_at'
const PRODUCTO_PARAMETRO_SELECT = `*, product_type:product_types(${PRODUCT_TYPE_SELECT})`

export async function GET(req: Request) {
  // Auth via SSR cookies
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
  const { data: usuario } = user?.email ? await supa.from('usuarios').select('*').eq('email', user.email).maybeSingle() : { data: null }
  const rol = usuario?.rol ? String(usuario.rol).trim().toLowerCase() : undefined
  const isProd = (process.env.VERCEL_ENV === 'production') || (process.env.NODE_ENV === 'production')
  const allowed = isActiveUser(usuario) && (canReadProductoParametros(rol) || !isProd)
  if (!allowed) {
    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin permiso', ...(debug ? { rol, activo: usuario?.activo } : {}) }, { status: 403 })
  }
  const url = new URL(req.url)
  const includeInactive = url.searchParams.get('include_inactivos') === '1'
  let query = supabase
    .from('producto_parametros')
    .select(PRODUCTO_PARAMETRO_SELECT)
    .order('nombre_comercial', { ascending: true })
  if (!includeInactive) {
    query = query.eq('activo', true)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  // Obtener usuario al estilo /api/login para evitar discrepancias RLS
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
  const { data: usuario, error: uerr } = await supa.from('usuarios').select('*').eq('email', user.email).maybeSingle()
  if (uerr || !usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const rol = usuario?.rol ? String(usuario.rol).trim().toLowerCase() : undefined
  const isProd = (process.env.VERCEL_ENV === 'production') || (process.env.NODE_ENV === 'production')
  const allowed = isActiveUser(usuario) && (canWriteProductoParametros(rol) || !isProd)
  if (!allowed) {
    const url = new URL(req.url)
    const debug = url.searchParams.get('debug') === '1'
    return NextResponse.json({ error: 'Sin permiso', ...(debug ? { rol, activo: usuario?.activo } : {}) }, { status: 403 })
  }

  const body = await req.json()
  // Filtra solo campos permitidos; ignora el resto para evitar errores innecesarios
  const cleaned = Object.fromEntries(
    Object.entries(body).filter(([k]) => (allowedFields as Set<string>).has(k as string))
  ) as Record<string, unknown>
  const insertBody = { activo: true, puntos_multiplicador: 1, ...cleaned }
  const { data, error } = await supabase
    .from('producto_parametros')
    .insert([insertBody])
    .select(PRODUCTO_PARAMETRO_SELECT)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('alta_producto_parametro', { usuario: usuario.email, tabla_afectada: 'producto_parametros', id_registro: null, snapshot: data })
  return NextResponse.json(data)
}
