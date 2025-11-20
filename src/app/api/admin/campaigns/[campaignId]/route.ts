import { NextRequest, NextResponse } from 'next/server'
import { ensureSuper } from '@/lib/apiGuards'
import {
  deleteCampaign,
  fetchCampaignById,
  fetchCampaignWithRelations,
  type CampaignRewardInput,
  type CampaignRuleInput,
  type CampaignSegmentInput,
  type UpdateCampaignPayload,
  updateCampaignWithRelations,
  normalizeCampaignStatus
} from '@/lib/campaigns'
import { logAccion } from '@/lib/logger'

export type CampaignRouteContext = { params: Promise<{ campaignId: string }> }

function parseString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function parseStringOrNull(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'si', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }
  return undefined
}

function parseSegments(value: unknown): CampaignSegmentInput[] | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!Array.isArray(value)) return undefined
  const parsed: CampaignSegmentInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const segmentId = parseString(record.segment_id)
    const deleted = parseBoolean(record.deleted)
    if (!segmentId && deleted !== true) continue
    const payload: CampaignSegmentInput = {
      segment_id: segmentId ?? ''
    }
    if (record.sort_order !== undefined) {
      payload.sort_order = record.sort_order as CampaignSegmentInput['sort_order']
    }
    if (deleted !== undefined) {
      payload.deleted = deleted
    }
    parsed.push(payload)
  }
  return parsed
}

function parseRules(value: unknown): CampaignRuleInput[] | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!Array.isArray(value)) return undefined
  const parsed: CampaignRuleInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const scope = typeof record.scope === 'string' ? record.scope : undefined
    const ruleKind = typeof record.rule_kind === 'string' ? record.rule_kind : undefined
    if (!scope || !ruleKind) continue
    const entry: CampaignRuleInput = {
      id: parseString(record.id),
      scope: scope ?? '',
      rule_kind: ruleKind ?? ''
    }
    if (record.config && typeof record.config === 'object') {
      entry.config = record.config as Record<string, unknown>
    }
    if (record.priority !== undefined) {
      entry.priority = record.priority as CampaignRuleInput['priority']
    }
    if (record.description === null || typeof record.description === 'string') {
      entry.description = record.description as string | null
    }
    if (record.logical_group !== undefined && typeof record.logical_group === 'number') {
      entry.logical_group = record.logical_group
    }
    if (record.logical_operator !== undefined && typeof record.logical_operator === 'string') {
      const operator = record.logical_operator
      if (operator === 'AND' || operator === 'OR') {
        entry.logical_operator = operator
      }
    }
    const deleted = parseBoolean(record.deleted)
    if (deleted !== undefined) {
      entry.deleted = deleted
    }
    parsed.push(entry)
  }
  return parsed
}

function parseRewards(value: unknown): CampaignRewardInput[] | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (!Array.isArray(value)) return undefined
  const parsed: CampaignRewardInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const title = parseString(record.title)
    const deleted = parseBoolean(record.deleted)
    if (!title && deleted !== true) continue
    const entry: CampaignRewardInput = {
      id: parseString(record.id),
      title: title ?? ''
    }
    if (record.description === null || typeof record.description === 'string') {
      entry.description = record.description as string | null
    }
    const isAccumulative = parseBoolean(record.is_accumulative)
    if (isAccumulative !== undefined) {
      entry.is_accumulative = isAccumulative
    }
    if (record.sort_order !== undefined) {
      entry.sort_order = record.sort_order as CampaignRewardInput['sort_order']
    }
    if (deleted !== undefined) {
      entry.deleted = deleted
    }
    parsed.push(entry)
  }
  return parsed
}

function buildUpdatePayload(body: Record<string, unknown>): UpdateCampaignPayload {
  const payload: UpdateCampaignPayload = {}

  if ('slug' in body) payload.slug = parseString(body.slug)
  if ('name' in body) payload.name = parseString(body.name)
  if ('summary' in body) payload.summary = parseStringOrNull(body.summary)
  if ('description' in body) payload.description = parseStringOrNull(body.description)
  if ('notes' in body) payload.notes = parseStringOrNull(body.notes)
  if ('primary_segment_id' in body) payload.primary_segment_id = parseStringOrNull(body.primary_segment_id)
  if ('active_range' in body) payload.active_range = parseStringOrNull(body.active_range)
  if ('activeRangeStart' in body) payload.activeRangeStart = parseStringOrNull(body.activeRangeStart)
  if ('activeRangeEnd' in body) payload.activeRangeEnd = parseStringOrNull(body.activeRangeEnd)

  if ('status' in body) {
    const normalized = normalizeCampaignStatus(parseString(body.status) ?? undefined)
    if (!normalized) {
      throw new Error('Status de campaña inválido')
    }
    payload.status = normalized
  }

  const segments = parseSegments(body.segments)
  if (segments !== undefined) payload.segments = segments

  const rules = parseRules(body.rules)
  if (rules !== undefined) payload.rules = rules

  const rewards = parseRewards(body.rewards)
  if (rewards !== undefined) payload.rewards = rewards

  return payload
}

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

    const detail = await fetchCampaignWithRelations(campaignId)
    return NextResponse.json(detail)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    if (message.includes('no encontrada')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
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

    const payload = buildUpdatePayload(body)
    const result = await updateCampaignWithRelations(campaignId, payload)

    const usuarioRef = guard.usuario.email ?? guard.usuario.nombre ?? `usuario:${guard.usuario.id}`

    void logAccion('CAMPAIGN_UPDATE', {
      usuario: usuarioRef,
      tabla_afectada: 'campaigns',
      snapshot: { campaignId, payload }
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    if (message.includes('no encontrada')) {
      return NextResponse.json({ error: message }, { status: 404 })
    }
    if (message.includes('obligatorio') || message.includes('inválido')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
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

    const existing = await fetchCampaignById(campaignId)
    if (!existing) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    const removed = await deleteCampaign(campaignId)
    if (!removed) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    const usuarioRef = guard.usuario.email ?? guard.usuario.nombre ?? `usuario:${guard.usuario.id}`

    void logAccion('CAMPAIGN_DELETE', {
      usuario: usuarioRef,
      tabla_afectada: 'campaigns',
      snapshot: { campaignId }
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
