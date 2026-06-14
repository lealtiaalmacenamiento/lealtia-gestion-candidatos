import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { sendDirectMessage } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ threadId: string }> }

/**
 * POST /api/sendpilot/inbox/[conversationId]/reply
 * Body: { senderId: string, recipientLinkedinUrl: string, message: string }
 */
export async function POST(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  void context.params // threadId not needed for /inbox/send

  let body: { senderId?: string; recipientLinkedinUrl?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const message = (body.message ?? '').trim()
  const senderId = (body.senderId ?? '').trim()
  const recipientLinkedinUrl = (body.recipientLinkedinUrl ?? '').trim()

  if (!message) return NextResponse.json({ error: 'message es obligatorio' }, { status: 400 })
  if (!senderId) return NextResponse.json({ error: 'senderId es obligatorio' }, { status: 400 })
  if (!recipientLinkedinUrl) return NextResponse.json({ error: 'recipientLinkedinUrl es obligatorio' }, { status: 400 })

  try {
    const result = await sendDirectMessage(senderId, recipientLinkedinUrl, message)
    return NextResponse.json({ ok: true, messageId: result.messageId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error SP' }, { status: 502 })
  }
}

