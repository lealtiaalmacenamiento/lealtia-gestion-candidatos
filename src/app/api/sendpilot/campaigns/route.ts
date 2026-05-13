import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getCampaigns, getSendPilotApiKey } from '@/lib/integrations/sendpilot'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sendpilot/campaigns
 * Proxies SP campaigns list (admin/supervisor only).
 */
export async function GET(req: Request) {
  const actor = await getUsuarioSesion()
  if (!actor) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['admin', 'supervisor'].includes(actor.rol)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // ?debug=1 — return raw SP response to diagnose structure
  const { searchParams } = new URL(req.url)
  if (searchParams.get('debug') === '1') {
    const apiKey = await getSendPilotApiKey()
    if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 422 })
    const raw = await fetch('https://api.sendpilot.ai/v1/campaigns', {
      headers: { 'X-API-Key': apiKey }
    })
    const json = await raw.json()
    return NextResponse.json({ status: raw.status, body: json })
  }

  try {
    const campaigns = await getCampaigns()
    return NextResponse.json(campaigns)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error SP' }, { status: 502 })
  }
}
