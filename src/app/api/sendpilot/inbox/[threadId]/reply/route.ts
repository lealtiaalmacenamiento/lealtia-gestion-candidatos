import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { replyToThread } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ threadId: string }> }

/**
 * POST /api/sendpilot/inbox/[threadId]/reply
 * Body: { message: string }
 */
export async function POST(req: Request, context: RouteContext) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { threadId } = await context.params

  let body: { message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const message = (body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'message es obligatorio' }, { status: 400 })

  try {
    await replyToThread(threadId, message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error SP' }, { status: 502 })
  }
}
