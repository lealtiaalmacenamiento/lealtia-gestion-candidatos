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

export async function GET(req: Request) {
  const supa = await getSupa()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const clienteId = (url.searchParams.get('cliente_id') || '').trim()

  let sel = supa
    .from('polizas')
    .select('id, cliente_id, numero_poliza, estatus, forma_pago, prima_input, prima_moneda, sa_input, sa_moneda')
    .order('fecha_alta_sistema', { ascending: false })
    .limit(100)
  if (q) {
    sel = sel.or(`numero_poliza.ilike.%${q}%,estatus.ilike.%${q}%`)
  }
  if (clienteId) {
    sel = sel.eq('cliente_id', clienteId)
  }
  const { data, error } = await sel
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ items: data || [] })
}
