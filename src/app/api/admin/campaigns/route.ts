import { NextRequest, NextResponse } from 'next/server'
import { createCampaign, fetchCampaigns, normalizeCampaignStatus } from '@/lib/campaigns'
import { ensureSuper } from '@/lib/apiGuards'
import type { CampaignStatus } from '@/types'

function parseStatusParam(value: string | null): CampaignStatus | CampaignStatus[] | undefined {
  if (!value) return undefined
  const parts = value
    .split(',')
    .map(part => normalizeCampaignStatus(part))
    .filter((part): part is CampaignStatus => Boolean(part))
  if (parts.length === 0) return undefined
  if (parts.length === 1) return parts[0]
  return parts
}

export async function GET(request: NextRequest) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const statusParam = request.nextUrl.searchParams.get('status')
    const includeArchived = request.nextUrl.searchParams.get('includeArchived') === '1'
    const campaigns = await fetchCampaigns({
      status: parseStatusParam(statusParam),
      includeArchived
    })
    return NextResponse.json({ campaigns })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await ensureSuper(request)
    if (guard.kind === 'error') return guard.response

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const payload = {
      slug: typeof body.slug === 'string' ? body.slug : '',
      name: typeof body.name === 'string' ? body.name : '',
      summary: typeof body.summary === 'string' ? body.summary : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      status: normalizeCampaignStatus(typeof body.status === 'string' ? body.status : undefined),
      active_range: typeof body.active_range === 'string' ? body.active_range : undefined,
      activeRangeStart: typeof body.activeRangeStart === 'string' ? body.activeRangeStart : undefined,
      activeRangeEnd: typeof body.activeRangeEnd === 'string' ? body.activeRangeEnd : undefined,
      primary_segment_id: typeof body.primary_segment_id === 'string' ? body.primary_segment_id : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      created_by: guard.usuario.id
    }

    const campaign = await createCampaign(payload)
    return NextResponse.json({ campaign }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    const status = message.includes('obligatorio') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
