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

export async function GET(req: Request) {
  const supa = await getSupa()
  const url = new URL(req.url)
  const scope = (url.searchParams.get('scope') || 'mine').toLowerCase()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let q = supa.from('poliza_update_requests')
    .select('id, poliza_id, solicitante_id, estado, motivo_rechazo, creado_at, resuelto_at, resuelto_por, payload_propuesto')
    .order('creado_at', { ascending: false })

  if (scope === 'mine') {
    q = q.eq('solicitante_id', auth.user.id)
  } else if (scope === 'pending') {
    q = q.eq('estado', 'PENDIENTE')
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(req: Request) {
  const supa = await getSupa()
  const { data: auth } = await supa.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json().catch(() => null) as { poliza_id?: string, payload?: Record<string, unknown> }
  if (!body?.poliza_id || !body?.payload) {
    return NextResponse.json({ error: 'Payload inválido (poliza_id, payload)' }, { status: 400 })
  }

  const rpc = await supa.rpc('submit_poliza_update', {
    p_poliza_id: body.poliza_id,
    p_payload: body.payload as Record<string, unknown>
  })
  if (rpc.error) return NextResponse.json({ error: rpc.error.message }, { status: 400 })
  const requestId = rpc.data as string

  // Notificar a supervisores
  try {
    const { data: supers } = await supa
      .from('usuarios')
      .select('email, rol, activo')
      .in('rol', ['superusuario','super_usuario','supervisor'])
      .eq('activo', true)
    const emails = Array.from(new Set((supers || []).map(u => (u.email || '').trim()).filter(e => /.+@.+\..+/.test(e))))
    const subject = `Nueva solicitud de cambio de póliza ${body.poliza_id}`
    const html = `<p>Se registró una solicitud de cambio para la póliza <code>${body.poliza_id}</code>.</p><pre>${JSON.stringify(body.payload, null, 2)}</pre><p>ID solicitud: ${requestId}</p>`
    if (emails.length) await sendMail({ to: emails.join(','), subject, html })
  } catch {}

  await logAccion('submit_poliza_update', { tabla_afectada: 'poliza_update_requests', snapshot: { id: requestId, poliza_id: body.poliza_id } })
  return NextResponse.json({ ok: true, id: requestId })
}
