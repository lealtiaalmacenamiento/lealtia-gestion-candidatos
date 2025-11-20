import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { PATCH, DELETE } from '@/app/api/admin/campaigns/[campaignId]/route'
import { POST as POSTStatus } from '@/app/api/admin/campaigns/[campaignId]/status/route'
import { ensureSuper } from '@/lib/apiGuards'
import {
  updateCampaignWithRelations,
  deleteCampaign,
  fetchCampaignById,
  updateCampaignStatus,
  normalizeCampaignStatus
} from '@/lib/campaigns'
import { logAccion } from '@/lib/logger'
import type { UsuarioSesion } from '@/lib/auth'
import type { Campaign, CampaignReward, CampaignRule, CampaignSegmentLink, CampaignStatus } from '@/types'

type UpdateCampaignResult = {
  campaign: Campaign
  segments: CampaignSegmentLink[]
  rules: CampaignRule[]
  rewards: CampaignReward[]
}

vi.mock('@/lib/apiGuards', () => ({
  ensureSuper: vi.fn()
}))

vi.mock('@/lib/campaigns', () => ({
  updateCampaignWithRelations: vi.fn(),
  deleteCampaign: vi.fn(),
  fetchCampaignById: vi.fn(),
  updateCampaignStatus: vi.fn(),
  normalizeCampaignStatus: vi.fn()
}))

vi.mock('@/lib/logger', () => ({
  logAccion: vi.fn()
}))

const mockedEnsureSuper = vi.mocked(ensureSuper)
const mockedNormalizeCampaignStatus = vi.mocked(normalizeCampaignStatus)
const mockedUpdateCampaignWithRelations = vi.mocked(updateCampaignWithRelations)
const mockedDeleteCampaign = vi.mocked(deleteCampaign)
const mockedFetchCampaignById = vi.mocked(fetchCampaignById)
const mockedUpdateCampaignStatus = vi.mocked(updateCampaignStatus)
const mockedLogAccion = vi.mocked(logAccion)

function buildRequest(body: unknown): NextRequest {
  return {
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body)
  } as unknown as NextRequest
}

function buildGuardOk() {
  mockedEnsureSuper.mockResolvedValue({
    kind: 'ok',
    usuario: {
      id: 9,
      email: 'supervisor@example.com',
      rol: 'supervisor',
      activo: true
    } as UsuarioSesion
  })
}

describe('Admin campaign routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildGuardOk()
    mockedNormalizeCampaignStatus.mockImplementation(value =>
      value ? (value.trim().toLowerCase() as CampaignStatus) : undefined
    )
  })

  it('PATCH actualiza campaña y normaliza payload', async () => {
    const body = {
      slug: 'new-campaign',
      name: ' Campaña Nueva ',
      summary: null,
      description: 'Descripción',
      notes: 'Notas',
      primary_segment_id: null,
      active_range: '[2025-01-01,2025-12-31)',
      activeRangeStart: '2025-01-01',
      activeRangeEnd: '2025-12-31',
      status: 'ACTIVE',
      segments: [
        { segment_id: 'SEG-1', sort_order: '2', deleted: false },
        { segment_id: 'seg-2' },
        { segment_id: 'seg-1', sort_order: '4' }
      ],
      rules: [
        { id: 'rule-1', scope: 'ELIGIBILITY', rule_kind: 'ROLE', priority: '5', config: { negate: true }, description: 'desc' },
        { scope: 'goal', rule_kind: 'TOTAL_PREMIUM', config: { min: 1000 } },
        { scope: 'goal', rule_kind: 'ROLE', deleted: true }
      ],
      rewards: [
        { id: 'reward-1', title: 'Regalo', description: 'desc', is_accumulative: 'true', sort_order: '3' },
        { title: 'Segundo premio', deleted: true }
      ]
    }

    const request = buildRequest(body)

    const responsePayload: UpdateCampaignResult = {
      campaign: {
        id: 'cmp-1',
        slug: 'cmp-1',
        name: 'Campaña',
        status: 'draft',
        active_range: '[2025-01-01,2025-12-31)',
        summary: null,
        description: null,
        primary_segment_id: null,
        notes: null,
        created_by: 1,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z'
      },
      segments: [],
      rules: [],
      rewards: []
    }
    mockedUpdateCampaignWithRelations.mockResolvedValue(responsePayload as UpdateCampaignResult)

    const response = await PATCH(request, { params: Promise.resolve({ campaignId: 'cmp-1' }) })

    expect(response.status).toBe(200)
    expect(mockedUpdateCampaignWithRelations).toHaveBeenCalledTimes(1)
    const args = mockedUpdateCampaignWithRelations.mock.calls[0]
    expect(args[0]).toBe('cmp-1')
    expect(args[1]).toMatchObject({
      slug: 'new-campaign',
      name: ' Campaña Nueva ',
      summary: null,
      description: 'Descripción',
      notes: 'Notas',
      primary_segment_id: null,
      active_range: '[2025-01-01,2025-12-31)',
      activeRangeStart: '2025-01-01',
      activeRangeEnd: '2025-12-31',
      status: 'active'
    })
    expect(args[1].segments).toEqual([
      { segment_id: 'SEG-1', sort_order: '2', deleted: false },
      { segment_id: 'seg-2' },
      { segment_id: 'seg-1', sort_order: '4' }
    ])
    expect(args[1].rules).toEqual([
      { id: 'rule-1', scope: 'ELIGIBILITY', rule_kind: 'ROLE', priority: '5', config: { negate: true }, description: 'desc' },
      { scope: 'goal', rule_kind: 'TOTAL_PREMIUM', config: { min: 1000 } },
      { scope: 'goal', rule_kind: 'ROLE', deleted: true }
    ])
    expect(args[1].rewards).toEqual([
      { id: 'reward-1', title: 'Regalo', description: 'desc', is_accumulative: true, sort_order: '3' },
      { title: 'Segundo premio', deleted: true }
    ])
    expect(mockedLogAccion).toHaveBeenCalledWith('CAMPAIGN_UPDATE', expect.objectContaining({
      usuario: 'supervisor@example.com',
      tabla_afectada: 'campaigns'
    }))
    const bodyResponse = await response.json()
    expect(bodyResponse).toEqual(responsePayload)
  })

  it('PATCH rechaza status inválido', async () => {
    mockedNormalizeCampaignStatus.mockReturnValueOnce(undefined)
    const response = await PATCH(buildRequest({ status: 'unknown' }), {
      params: Promise.resolve({ campaignId: 'cmp-1' })
    })
    expect(response.status).toBe(400)
    expect(mockedUpdateCampaignWithRelations).not.toHaveBeenCalled()
  })

  it('PATCH reusa respuesta de ensureSuper cuando no autorizado', async () => {
    const forbidden = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    mockedEnsureSuper.mockResolvedValueOnce({ kind: 'error', response: forbidden })
    const response = await PATCH(buildRequest({}), { params: Promise.resolve({ campaignId: 'cmp-1' }) })
    expect(response).toBe(forbidden)
  })

  it('DELETE elimina campaña existente', async () => {
    mockedFetchCampaignById.mockResolvedValue({ id: 'cmp-1' } as Campaign)
    mockedDeleteCampaign.mockResolvedValue(true)

    const response = await DELETE(buildRequest(null), { params: Promise.resolve({ campaignId: 'cmp-1' }) })

    expect(response.status).toBe(200)
    expect(mockedFetchCampaignById).toHaveBeenCalledWith('cmp-1')
    expect(mockedDeleteCampaign).toHaveBeenCalledWith('cmp-1')
    expect(mockedLogAccion).toHaveBeenCalledWith('CAMPAIGN_DELETE', expect.objectContaining({
      snapshot: { campaignId: 'cmp-1' }
    }))
    expect(await response.json()).toEqual({ ok: true })
  })

  it('DELETE devuelve 404 cuando la campaña no existe', async () => {
    mockedFetchCampaignById.mockResolvedValue(null)
    const response = await DELETE(buildRequest(null), { params: Promise.resolve({ campaignId: 'cmp-1' }) })
    expect(response.status).toBe(404)
    expect(mockedDeleteCampaign).not.toHaveBeenCalled()
  })

  it('POST status actualiza y registra cambio', async () => {
    mockedUpdateCampaignStatus.mockResolvedValue({ id: 'cmp-1', status: 'paused' } as Campaign)

    const response = await POSTStatus(buildRequest({ status: 'PAUSED' }), {
      params: Promise.resolve({ campaignId: 'cmp-1' })
    })

    expect(response.status).toBe(200)
    expect(mockedNormalizeCampaignStatus).toHaveBeenCalledWith('PAUSED')
    expect(mockedUpdateCampaignStatus).toHaveBeenCalledWith('cmp-1', 'paused')
    expect(mockedLogAccion).toHaveBeenCalledWith('CAMPAIGN_STATUS_CHANGE', expect.objectContaining({
      snapshot: { campaignId: 'cmp-1', status: 'paused' }
    }))
    expect(await response.json()).toEqual({ campaign: { id: 'cmp-1', status: 'paused' } })
  })

  it('POST status rechaza status inválido', async () => {
    mockedNormalizeCampaignStatus.mockReturnValueOnce(undefined)
    const response = await POSTStatus(buildRequest({ status: 'INVALID' }), {
      params: Promise.resolve({ campaignId: 'cmp-1' })
    })
    expect(response.status).toBe(400)
    expect(mockedUpdateCampaignStatus).not.toHaveBeenCalled()
  })
})
