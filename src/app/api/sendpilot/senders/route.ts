import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getSenders } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sendpilot/senders
 * Returns LinkedIn sender accounts configured in SendPilot.
 */
export async function GET() {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  try {
    const senders = await getSenders()
    return NextResponse.json({ senders })
  } catch (err) {
    // Return empty list instead of error so clients degrade gracefully
    return NextResponse.json({ senders: [], error: err instanceof Error ? err.message : 'Error SP' })
  }
}
