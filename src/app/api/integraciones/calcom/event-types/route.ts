import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getCalcomApiKey, getCalcomEventTypes } from '@/lib/integrations/calcom'
import { ensureAdminClient } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/integraciones/calcom/event-types
 * Returns the recruiter's Cal.com event types for the campaign assignment UI.
 */
export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let targetAuthId = actor.id_auth
  const requestedUserId = Number(new URL(req.url).searchParams.get('usuario_id'))
  if (Number.isFinite(requestedUserId) && requestedUserId > 0 && requestedUserId !== actor.id) {
    if (actor.rol !== 'admin' && actor.rol !== 'supervisor') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const supabase = ensureAdminClient()
    const { data: target } = await supabase
      .from('usuarios')
      .select('id_auth')
      .eq('id', requestedUserId)
      .maybeSingle()
    targetAuthId = target?.id_auth ?? null
  }
  if (!targetAuthId) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })

  const apiKey = await getCalcomApiKey(targetAuthId)
  if (!apiKey) {
    return NextResponse.json({ error: 'Cal.com no conectado' }, { status: 404 })
  }

  try {
    const supabase = ensureAdminClient()
    const { data: tokenRow } = await supabase
      .from('tokens_integracion')
      .select('meta')
      .eq('usuario_id', targetAuthId)
      .eq('proveedor', 'calcom')
      .maybeSingle()
    const meta = tokenRow?.meta && typeof tokenRow.meta === 'object'
      ? tokenRow.meta as Record<string, unknown>
      : {}
    const defaultEventTypeId = Number(meta.default_event_type_id)
    const eventTypes = await getCalcomEventTypes(apiKey)
    const defaultEventType = Number.isFinite(defaultEventTypeId)
      ? eventTypes.find(event => event.id === defaultEventTypeId) ?? null
      : null
    return NextResponse.json({
      eventTypes,
      default_event_type: defaultEventType,
      default_event_type_id: defaultEventType?.id ?? null
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
