import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getConversationMessages } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ threadId: string }> }

/**
 * GET /api/sendpilot/inbox/[conversationId]/messages
 * Query params:
 *   account_id (required): LinkedIn sender account ID that owns the conversation
 *   continuationToken?   : for pagination
 */
export async function GET(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { threadId } = await context.params
  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('account_id') ?? ''
  const continuationToken = searchParams.get('continuationToken') ?? undefined

  if (!accountId) return NextResponse.json({ error: 'account_id es obligatorio' }, { status: 400 })

  try {
    const result = await getConversationMessages(threadId, accountId, 50, continuationToken)
    return NextResponse.json({ messages: result.messages, pagination: result.pagination })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error SP' }, { status: 502 })
  }
}
