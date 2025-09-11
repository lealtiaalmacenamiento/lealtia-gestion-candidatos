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

  let sel = supa.from('clientes').select('id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, email').order('created_at', { ascending: false }).limit(100)
  if (q) {
    sel = sel.or(`email.ilike.%${q}%,primer_nombre.ilike.%${q}%,segundo_nombre.ilike.%${q}%,primer_apellido.ilike.%${q}%,segundo_apellido.ilike.%${q}%`)
  }
  const { data, error } = await sel
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ items: data || [] })
}
