import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { upsertIntegrationToken } from '@/lib/integrationTokens'
import { getSendPilotApiKey } from '@/lib/integrations/sendpilot'
import { logAccion } from '@/lib/logger'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/integraciones/sendpilot — save org-level SendPilot API key (admin/supervisor only) */
export async function POST(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!actor.id_auth) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })
  if (actor.rol !== 'admin' && actor.rol !== 'supervisor') {
    return NextResponse.json({ error: 'Solo admin o supervisor pueden configurar SendPilot' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { api_key?: string; webhook_secret?: string } | null
  if (!body?.api_key?.trim()) {
    return NextResponse.json({ error: 'api_key es requerida' }, { status: 400 })
  }
  // Validate the API key works before saving
  try {
    const res = await fetch('https://api.sendpilot.ai/v1/campaigns', {
      headers: { 'X-API-Key': body.api_key.trim() }
    })
    if (!res.ok) throw new Error(`SendPilot respondió ${res.status}`)
  } catch (err) {
    return NextResponse.json(
      { error: `API key inválida: ${err instanceof Error ? err.message : 'error desconocido'}` },
      { status: 422 }
    )
  }

  const webhookSecret = body.webhook_secret?.trim() || null
  const { error } = await upsertIntegrationToken(actor.id_auth, 'sendpilot', {
    accessToken: body.api_key.trim(),
    meta: webhookSecret ? { webhook_secret: webhookSecret } : {}
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('integracion_conectada', {
    usuario: actor.email,
    tabla_afectada: 'tokens_integracion',
    snapshot: { provider: 'sendpilot' }
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

/** GET /api/integraciones/sendpilot — connection status (admin/supervisor only) */
export async function GET() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (actor.rol !== 'admin' && actor.rol !== 'supervisor') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const apiKey = await getSendPilotApiKey()
  return NextResponse.json({ connected: Boolean(apiKey) })
}

/** DELETE /api/integraciones/sendpilot — disconnect (admin/supervisor only) */
export async function DELETE() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!actor.id_auth) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })
  if (actor.rol !== 'admin' && actor.rol !== 'supervisor') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const supabase = ensureAdminClient()
  const { error } = await supabase
    .from('tokens_integracion')
    .delete()
    .eq('proveedor', 'sendpilot')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion('integracion_desconectada', {
    usuario: actor.email,
    tabla_afectada: 'tokens_integracion',
    snapshot: { provider: 'sendpilot' }
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
