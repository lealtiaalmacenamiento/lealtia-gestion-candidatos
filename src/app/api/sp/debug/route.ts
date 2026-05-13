import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getSendPilotApiKey } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

/** GET /api/sp/debug?path=/campaigns/ID/leads — dump raw SP response for any path */
export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const apiKey = await getSendPilotApiKey()
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 422 })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path') ?? '/campaigns'

  const raw = await fetch(`https://api.sendpilot.ai/v1${path}`, {
    headers: { 'X-API-Key': apiKey }
  })

  const text = await raw.text()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { parsed = text }

  return NextResponse.json({ httpStatus: raw.status, path, body: parsed })
}
