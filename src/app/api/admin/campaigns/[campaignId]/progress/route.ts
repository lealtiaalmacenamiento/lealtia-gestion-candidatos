import { NextRequest, NextResponse } from 'next/server'
import { ensureSuper } from '@/lib/apiGuards'
import { fetchCampaignProgressSummary } from '@/lib/campaigns'
import type { CampaignRouteContext } from '../route'

export async function GET(
  request: NextRequest,
  context: CampaignRouteContext
) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const params = await context.params
    const campaignId = params?.campaignId
    if (!campaignId) {
      return NextResponse.json({ error: 'Falta id de campaña' }, { status: 400 })
    }

    const summary = await fetchCampaignProgressSummary(campaignId)
    return NextResponse.json({ summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    if (message.includes('no encontrada')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
