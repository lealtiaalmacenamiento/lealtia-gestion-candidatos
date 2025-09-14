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
  const body = await req.json().catch(() => null) as { request_id?: string, debug?: boolean }
  if (!body?.request_id) return NextResponse.json({ error: 'Falta request_id' }, { status: 400 })

  // Debug logs (se activan si body.debug=true o NODE_ENV=development)
  const debugOn = body.debug || process.env.NODE_ENV === 'development'
  if (debugOn) {
    // Info de usuario y payload previo a la llamada RPC
    console.debug('[apply_poliza_update][debug] user.id', auth.user.id)
    console.debug('[apply_poliza_update][debug] request_id', body.request_id)
    try {
      const { data: usuarioRow } = await supa.from('usuarios').select('id,id_auth,rol,activo').eq('id_auth', auth.user.id).maybeSingle()
      console.debug('[apply_poliza_update][debug] usuarios row', usuarioRow)
      const { data: reqRow } = await supa.from('poliza_update_requests').select('id,estado,poliza_id,solicitante_id').eq('id', body.request_id).maybeSingle()
      console.debug('[apply_poliza_update][debug] update_request row', reqRow)
    } catch (e) {
      console.debug('[apply_poliza_update][debug] error fetching pre-data', e)
    }
  }

  const rpc = await supa.rpc('apply_poliza_update', { p_request_id: body.request_id })
  if (rpc.error) {
    if (debugOn) {
      console.debug('[apply_poliza_update][debug] rpc.error', rpc.error)
      // Intento adicional: evaluar is_super_role a través de un pequeño SELECT
      try {
        const { data: isSuper } = await supa.rpc('is_super_role_wrapper')
        console.debug('[apply_poliza_update][debug] is_super_role_wrapper()', isSuper)
      } catch (e) {
        console.debug('[apply_poliza_update][debug] fallo wrapper is_super_role', e)
      }
      // Llamar helper de depuración si existe
      try {
        const dbg = await supa.rpc('apply_poliza_update_dbg', { p_request_id: body.request_id })
        if (dbg.error) {
          console.debug('[apply_poliza_update][debug] dbg.error', dbg.error)
        } else {
          console.debug('[apply_poliza_update][debug] dbg.data', dbg.data)
        }
      } catch (e) {
        console.debug('[apply_poliza_update][debug] fallo apply_poliza_update_dbg', e)
      }
    }
    let pending: unknown = null
    if (body.debug) {
      const { data: row } = await supa
        .from('poliza_update_requests')
        .select('*')
        .eq('id', body.request_id)
        .maybeSingle()
      pending = row
    }
    return NextResponse.json({ error: rpc.error.message, details: rpc.error.details, hint: rpc.error.hint, code: rpc.error.code, pending }, { status: 400 })
  }

  let polizaId: string | null = null
  let updatedPoliza: { id: string; prima_input?: number|null; prima_moneda?: string|null } | null = null
  try {
    const { data: reqRow } = await supa
      .from('poliza_update_requests')
      .select('solicitante_id, poliza_id')
      .eq('id', body.request_id)
      .maybeSingle()
    polizaId = reqRow?.poliza_id || null
    if (polizaId) {
      const { data: pRow } = await supa
        .from('polizas')
        .select('id, prima_input, prima_moneda')
        .eq('id', polizaId)
        .maybeSingle()
  if (pRow) updatedPoliza = { id: pRow.id, prima_input: (pRow as { prima_input?: number|null }).prima_input ?? null, prima_moneda: (pRow as { prima_moneda?: string|null }).prima_moneda ?? null }
    }
    if (process.env.NOTIFY_CHANGE_REQUESTS === '1' && reqRow?.solicitante_id) {
      const { data: user } = await supa.from('usuarios').select('email').eq('id', reqRow.solicitante_id).maybeSingle()
      if (user?.email) {
        await sendMail({ to: user.email, subject: 'Solicitud de póliza aprobada', html: `<p>Tu solicitud fue aprobada para la póliza ${reqRow.poliza_id}.</p>` })
      }
    }
  } catch {}

  await logAccion('apply_poliza_update', { tabla_afectada: 'poliza_update_requests', snapshot: { id: body.request_id } })
  return NextResponse.json({ ok: true, poliza_id: polizaId, poliza: updatedPoliza })
}
