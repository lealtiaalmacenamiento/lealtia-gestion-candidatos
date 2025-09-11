import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { sendMail } from '@/lib/mailer'
import { logAccion } from '@/lib/logger'

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

export async function POST(req: Request) {
  const supa = await getSupa()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json().catch(() => null) as { request_id?: string }
  if (!body?.request_id) return NextResponse.json({ error: 'Falta request_id' }, { status: 400 })

  const rpc = await supa.rpc('apply_cliente_update', { p_request_id: body.request_id })
  if (rpc.error) return NextResponse.json({ error: rpc.error.message }, { status: 400 })

  try {
    // Notificar al solicitante si se puede obtener su email
    const { data: reqRow } = await supa
      .from('cliente_update_requests')
      .select('solicitante_id, cliente_id')
      .eq('id', body.request_id)
      .maybeSingle()
  if (process.env.NOTIFY_CHANGE_REQUESTS === '1' && reqRow?.solicitante_id) {
      const { data: user } = await supa.from('usuarios').select('email').eq('id', reqRow.solicitante_id).maybeSingle()
      if (user?.email) {
        await sendMail({ to: user.email, subject: 'Solicitud aprobada', html: `<p>Tu solicitud fue aprobada para el cliente ${reqRow.cliente_id}.</p>` })
      }
    }
  } catch {}

  await logAccion('apply_cliente_update', { tabla_afectada: 'cliente_update_requests', snapshot: { id: body.request_id } })
  return NextResponse.json({ ok: true })
}
