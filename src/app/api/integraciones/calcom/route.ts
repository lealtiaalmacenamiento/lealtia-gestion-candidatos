import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getIntegrationToken, updateIntegrationTokenMeta } from '@/lib/integrationTokens'
import { connectCalcom, disconnectCalcom, getCalcomApiKey, getCalcomEventTypes } from '@/lib/integrations/calcom'
import { logAccion } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/integraciones/calcom
 * Body: { api_key: string }
 * Any authenticated user can connect their own Cal.com account.
 * Flow: validate key → call /me → register webhook → save token + meta
 */
export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!actor.id_auth) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })

  const body = await req.json().catch(() => null) as { api_key?: string } | null
  if (!body?.api_key?.trim()) {
    return NextResponse.json({ error: 'api_key es requerida' }, { status: 400 })
  }

  try {
    const { organizer_email } = await connectCalcom(actor.id_auth, body.api_key.trim())
    await logAccion('integracion_conectada', {
      usuario: actor.email,
      tabla_afectada: 'tokens_integracion',
      snapshot: { provider: 'calcom', organizer_email }
    }).catch(() => {})
    return NextResponse.json({ ok: true, organizer_email })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}

/**
 * GET /api/integraciones/calcom
 * Returns connection status for the current user.
 */
export async function GET() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!actor.id_auth) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })

  const oauthConfigured = Boolean(process.env.CALCOM_CLIENT_ID && process.env.CALCOM_CLIENT_SECRET)
  const { token } = await getIntegrationToken(actor.id_auth, 'calcom')
  if (!token?.accessToken) {
    return NextResponse.json({ connected: false, oauth_configured: oauthConfigured })
  }

  const meta = token.meta as Record<string, unknown> | null
  return NextResponse.json({
    connected: true,
    oauth_configured: oauthConfigured,
    auth_method: meta?.auth_method ?? (token.expiresAt ? 'oauth' : 'api_key'),
    organizer_email: meta?.organizer_email ?? null,
    username: meta?.username ?? null,
    default_event_type_id: meta?.default_event_type_id ?? null,
    default_event_title: meta?.default_event_title ?? null
  })
}

export async function PATCH(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor?.activo) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!actor.id_auth) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })
  const body = await req.json().catch(() => null) as { default_event_type_id?: number } | null
  const eventTypeId = Number(body?.default_event_type_id)
  if (!Number.isFinite(eventTypeId) || eventTypeId <= 0) {
    return NextResponse.json({ error: 'Selecciona un evento válido' }, { status: 400 })
  }
  const { token } = await getIntegrationToken(actor.id_auth, 'calcom')
  if (!token?.accessToken) return NextResponse.json({ error: 'Cal.com no conectado' }, { status: 409 })
  let eventTypes
  try {
    eventTypes = await getCalcomEventTypes(token.accessToken)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron consultar los eventos' }, { status: 502 })
  }
  const eventType = eventTypes.find(event => event.id === eventTypeId)
  if (!eventType) return NextResponse.json({ error: 'El evento ya no está disponible' }, { status: 409 })
  const meta = {
    ...(token.meta || {}),
    default_event_type_id: eventType.id,
    default_event_title: eventType.title,
    default_booking_url: eventType.bookingUrl || null
  }
  const { error } = await updateIntegrationTokenMeta(actor.id_auth, 'calcom', meta)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logAccion('calcom_evento_predeterminado', {
    usuario: actor.email,
    tabla_afectada: 'tokens_integracion',
    snapshot: { event_type_id: eventType.id, title: eventType.title }
  }).catch(() => {})
  return NextResponse.json({ ok: true, event_type: eventType })
}

/**
 * DELETE /api/integraciones/calcom
 * Deregisters the Cal.com webhook BEFORE deleting the token.
 */
export async function DELETE() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!actor.id_auth) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })

  const { token } = await getIntegrationToken(actor.id_auth, 'calcom')
  if (!token?.accessToken) {
    return NextResponse.json({ ok: true }) // already disconnected
  }

  const meta = token.meta as Record<string, unknown> | null
  const webhookId = meta?.webhook_id as string | undefined

  try {
    const accessToken = await getCalcomApiKey(actor.id_auth).catch(() => token.accessToken)
    if (webhookId) {
      await disconnectCalcom(actor.id_auth, accessToken || token.accessToken, webhookId)
    } else {
      // No webhook_id in meta — just delete the token
      const { ensureAdminClient } = await import('@/lib/supabaseAdmin')
      const supabase = ensureAdminClient()
      await supabase
        .from('tokens_integracion')
        .delete()
        .eq('usuario_id', actor.id_auth)
        .eq('proveedor', 'calcom')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  await logAccion('integracion_desconectada', {
    usuario: actor.email,
    tabla_afectada: 'tokens_integracion',
    snapshot: { provider: 'calcom' }
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
