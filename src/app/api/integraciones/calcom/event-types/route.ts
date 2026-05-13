import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getCalcomApiKey, getCalcomEventTypes } from '@/lib/integrations/calcom'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/integraciones/calcom/event-types
 * Returns the recruiter's Cal.com event types for the campaign assignment UI.
 */
export async function GET() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!actor.id_auth) return NextResponse.json({ error: 'Usuario sin id_auth' }, { status: 400 })

  const apiKey = await getCalcomApiKey(actor.id_auth)
  if (!apiKey) {
    return NextResponse.json({ error: 'Cal.com no conectado' }, { status: 404 })
  }

  try {
    const eventTypes = await getCalcomEventTypes(apiKey)
    return NextResponse.json({ eventTypes })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
