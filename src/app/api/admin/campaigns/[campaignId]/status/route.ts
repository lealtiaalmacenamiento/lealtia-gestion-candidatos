import { NextRequest, NextResponse } from 'next/server'
import { ensureSuper } from '@/lib/apiGuards'
import { updateCampaignStatus, normalizeCampaignStatus } from '@/lib/campaigns'
import { logAccion } from '@/lib/logger'
import type { CampaignRouteContext } from '../route'

export async function POST(
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

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const statusValue = typeof body.status === 'string' ? body.status : undefined
    const normalized = normalizeCampaignStatus(statusValue)
    if (!normalized) {
      return NextResponse.json({ error: 'Status de campaña inválido' }, { status: 400 })
    }

    const campaign = await updateCampaignStatus(campaignId, normalized)

    const usuarioRef = guard.usuario.email ?? guard.usuario.nombre ?? `usuario:${guard.usuario.id}`
    void logAccion('CAMPAIGN_STATUS_CHANGE', {
      usuario: usuarioRef,
      tabla_afectada: 'campaigns',
      snapshot: { campaignId, status: normalized }
    })

    return NextResponse.json({ campaign })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    if (message.includes('no encontrada')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
