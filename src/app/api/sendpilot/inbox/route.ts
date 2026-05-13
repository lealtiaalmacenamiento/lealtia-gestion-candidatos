import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getConversations } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sendpilot/inbox
 * Returns inbox conversations from SendPilot.
 * Query params:
 *   page?       : page number (default 1)
 *   limit?      : conversations per page (default 50, max 100)
 *   account_id? : filter by LinkedIn sender account ID
 */
export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
  const accountId = searchParams.get('account_id') ?? undefined

  try {
    const result = await getConversations(accountId, page, limit)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error SP' }, { status: 502 })
  }
}

