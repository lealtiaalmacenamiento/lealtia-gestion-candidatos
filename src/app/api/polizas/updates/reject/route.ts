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
  const body = await req.json().catch(() => null) as { request_id?: string, motivo?: string, debug?: boolean }
  if (!body?.request_id) return NextResponse.json({ error: 'Falta request_id' }, { status: 400 })

  const debugOn = body.debug || process.env.NODE_ENV === 'development'
  if (debugOn) {
    try {
      console.debug('[reject_poliza_update][debug] user.id', auth.user.id)
      console.debug('[reject_poliza_update][debug] request_id', body.request_id)
      const { data: usuarioRow } = await supa.from('usuarios').select('id,id_auth,rol,activo').eq('id_auth', auth.user.id).maybeSingle()
      console.debug('[reject_poliza_update][debug] usuarios row', usuarioRow)
      const { data: reqRow } = await supa.from('poliza_update_requests').select('id,estado,poliza_id,solicitante_id').eq('id', body.request_id).maybeSingle()
      console.debug('[reject_poliza_update][debug] update_request row', reqRow)
    } catch (e) {
      console.debug('[reject_poliza_update][debug] error fetching pre-data', e)
    }
  }

  const rpc = await supa.rpc('reject_poliza_update', { p_request_id: body.request_id, p_motivo: body.motivo || '' })
  if (rpc.error) {
    if (debugOn) {
      console.debug('[reject_poliza_update][debug] rpc.error', rpc.error)
      try {
        const { data: isSuper } = await supa.rpc('is_super_role_wrapper')
        console.debug('[reject_poliza_update][debug] is_super_role_wrapper()', isSuper)
      } catch (e) {
        console.debug('[reject_poliza_update][debug] fallo wrapper is_super_role', e)
      }
    }
    return NextResponse.json({ error: rpc.error.message, details: rpc.error.details, hint: rpc.error.hint, code: rpc.error.code }, { status: 400 })
  }

  try {
    const { data: reqRow } = await supa
      .from('poliza_update_requests')
      .select('solicitante_id, poliza_id')
      .eq('id', body.request_id)
      .maybeSingle()
  if (process.env.NOTIFY_CHANGE_REQUESTS === '1' && reqRow?.solicitante_id) {
      const { data: user } = await supa.from('usuarios').select('email').eq('id', reqRow.solicitante_id).maybeSingle()
      if (user?.email) {
        await sendMail({ to: user.email, subject: 'Solicitud de póliza rechazada', html: `<p>Tu solicitud fue rechazada para la póliza ${reqRow.poliza_id}. Motivo: ${body.motivo || ''}</p>` })
      }
      try {
        await supa.from('notificaciones').insert({
          usuario_id: reqRow.solicitante_id,
          tipo: 'sistema',
          titulo: 'Solicitud de póliza rechazada',
          mensaje: `Se rechazó tu solicitud ${body.request_id || ''} para la póliza ${reqRow.poliza_id || ''}. Motivo: ${body.motivo || ''}`.trim(),
          leida: false,
          metadata: { request_id: body.request_id, poliza_id: reqRow.poliza_id, motivo: body.motivo || '' }
        })
      } catch (e) {
        if (debugOn) console.debug('[reject_poliza_update][debug] notificacion solicitante error', e)
      }
    }
  } catch {}

  await logAccion('reject_poliza_update', { usuario: auth.user.email || undefined, tabla_afectada: 'poliza_update_requests', snapshot: { id: body.request_id } })
  return NextResponse.json({ ok: true })
}
