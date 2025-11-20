import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { GET as listCampaigns } from '@/app/api/campaigns/route'
import { GET as campaignDetail } from '@/app/api/campaigns/[slug]/route'
import { getUsuarioSesion } from '@/lib/auth'
import {
  evaluateCampaignCached,
  fetchCampaignBySlug,
  fetchCampaignMetricsForUser,
  fetchCampaignRewards,
  fetchCampaignRulesMap,
  fetchCampaignSegmentsMap,
  fetchCampaigns,
  isCampaignActive
} from '@/lib/campaigns'
import { fetchSegmentsByIds, fetchUserSegmentIds } from '@/lib/segments'
import type {
  Campaign,
  CampaignProgressSnapshot,
  CampaignEvaluationMetrics,
  CampaignEvaluationResult,
  CampaignReward,
  CampaignSegmentLink,
  CampaignRule,
  Segment,
  Usuario
} from '@/types'

vi.mock('@/lib/auth', () => ({
  getUsuarioSesion: vi.fn()
}))

vi.mock('@/lib/campaigns', () => ({
  evaluateCampaignCached: vi.fn(),
  fetchCampaignBySlug: vi.fn(),
  fetchCampaignMetricsForUser: vi.fn(),
  fetchCampaignRewards: vi.fn(),
  fetchCampaignRulesMap: vi.fn(),
  fetchCampaignSegmentsMap: vi.fn(),
  fetchCampaigns: vi.fn(),
  isCampaignActive: vi.fn()
}))

vi.mock('@/lib/segments', () => ({
  fetchSegmentsByIds: vi.fn(),
  fetchUserSegmentIds: vi.fn()
}))

const mockedGetUsuarioSesion = vi.mocked(getUsuarioSesion)
const mockedFetchCampaigns = vi.mocked(fetchCampaigns)
const mockedFetchCampaignSegmentsMap = vi.mocked(fetchCampaignSegmentsMap)
const mockedFetchCampaignRulesMap = vi.mocked(fetchCampaignRulesMap)
const mockedFetchCampaignMetricsForUser = vi.mocked(fetchCampaignMetricsForUser)
const mockedEvaluateCampaignCached = vi.mocked(evaluateCampaignCached)
const mockedFetchSegmentsByIds = vi.mocked(fetchSegmentsByIds)
const mockedFetchUserSegmentIds = vi.mocked(fetchUserSegmentIds)
const mockedIsCampaignActive = vi.mocked(isCampaignActive)
const mockedFetchCampaignBySlug = vi.mocked(fetchCampaignBySlug)
const mockedFetchCampaignRewards = vi.mocked(fetchCampaignRewards)

function buildCampaign(id: string, overrides: Partial<Campaign> = {}): Campaign {
  return {
    id,
    slug: `${id}-slug`,
    name: `Campaña ${id}`,
    status: 'active',
    active_range: '[2025-01-01,2025-12-31)',
    summary: null,
    description: null,
    primary_segment_id: null,
    notes: null,
    created_by: 1,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

function buildSegment(id: string, overrides: Partial<Segment> = {}): Segment {
  return {
    id,
    name: `Segmento ${id}`,
    description: null,
    active: true,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

function buildLink(campaign_id: string, segment_id: string): CampaignSegmentLink {
  return {
    campaign_id,
    segment_id,
    sort_order: 0
  }
}

function buildEvaluation(metrics: CampaignEvaluationMetrics): CampaignEvaluationResult {
  return {
    eligible: true,
    progress: 1,
    status: 'completed',
    metrics,
    ruleResults: []
  }
}

function buildRequest(url: string): NextRequest {
  return {
    headers: new Headers(),
    nextUrl: new URL(url)
  } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('API campañas públicas', () => {
  it('lista campañas visibles para el usuario autenticado', async () => {
  const user: Usuario = { id: 1, email: 'agente@example.com', rol: 'agente', activo: true }
  mockedGetUsuarioSesion.mockResolvedValue(user)
    mockedFetchUserSegmentIds.mockResolvedValue(['seg-a'])

    const campaignVisible = buildCampaign('cmp-1', { primary_segment_id: 'seg-a' })
    const campaignHidden = buildCampaign('cmp-2', { primary_segment_id: 'seg-b' })

    mockedFetchCampaigns.mockResolvedValue([campaignVisible, campaignHidden])
    mockedFetchCampaignSegmentsMap.mockResolvedValue(
      new Map<string, CampaignSegmentLink[]>([
        ['cmp-1', [buildLink('cmp-1', 'seg-a')]],
        ['cmp-2', [buildLink('cmp-2', 'seg-b')]]
      ])
    )
    mockedFetchCampaignRulesMap.mockResolvedValue(
      new Map<string, CampaignRule[]>([
        ['cmp-1', [] as CampaignRule[]],
        ['cmp-2', [] as CampaignRule[]]
      ])
    )
    mockedFetchSegmentsByIds.mockResolvedValue([
      buildSegment('seg-a'),
      buildSegment('seg-b')
    ])
    mockedFetchCampaignMetricsForUser.mockResolvedValue({ polizas: { total: 3 } })
    mockedIsCampaignActive.mockImplementation(() => true)
    mockedEvaluateCampaignCached.mockImplementation(async ({ fetchMetrics }) => {
      const metrics = await fetchMetrics()
      return {
        result: buildEvaluation(metrics),
        fromCache: false,
        snapshot: null
      }
    })

    const response = await listCampaigns(buildRequest('http://localhost/api/campaigns'))
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.campaigns).toHaveLength(1)
    expect(body.campaigns[0].campaign.id).toBe('cmp-1')
    expect(body.campaigns[0].evaluation.metrics).toEqual({ polizas: { total: 3 } })
    expect(mockedFetchCampaignMetricsForUser).toHaveBeenCalledTimes(1)
    expect(mockedEvaluateCampaignCached).toHaveBeenCalledTimes(1)
  })

  it('devuelve detalle de campaña por slug', async () => {
  const user: Usuario = { id: 5, email: 'supervisor@example.com', rol: 'supervisor', activo: true }
  mockedGetUsuarioSesion.mockResolvedValue(user)
    mockedFetchUserSegmentIds.mockResolvedValue(['seg-x'])

    const campaign = buildCampaign('cmp-detail', {
      slug: 'campania-detalle',
      primary_segment_id: 'seg-x'
    })

    mockedFetchCampaignBySlug.mockResolvedValue(campaign)
    mockedFetchCampaignSegmentsMap.mockResolvedValue(
      new Map<string, CampaignSegmentLink[]>([['cmp-detail', []]])
    )
    mockedFetchCampaignRulesMap.mockResolvedValue(
      new Map<string, CampaignRule[]>([['cmp-detail', [] as CampaignRule[]]])
    )
    const rewards: CampaignReward[] = [
      {
        id: 'reward-1',
        campaign_id: 'cmp-detail',
        title: 'Reconocimiento',
        description: null,
        is_accumulative: false,
        sort_order: 1,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z'
      }
    ]
    mockedFetchCampaignRewards.mockResolvedValue(rewards)
    mockedFetchSegmentsByIds.mockResolvedValue([buildSegment('seg-x')])
    mockedFetchCampaignMetricsForUser.mockResolvedValue({ rc: { prospectos_total: 2 } })
    mockedIsCampaignActive.mockReturnValue(true)
    mockedEvaluateCampaignCached.mockImplementation(async ({ fetchMetrics }) => {
      const metrics = await fetchMetrics()
      const snapshot: CampaignProgressSnapshot = {
        id: 'snapshot-1',
        campaign_id: 'cmp-detail',
        usuario_id: user.id,
        eligible: true,
        progress: 1,
        status: 'completed',
        metrics: null,
        evaluated_at: '2025-02-01T00:00:00.000Z'
      }
      return {
        result: buildEvaluation(metrics),
        fromCache: false,
        snapshot
      }
    })

    const response = await campaignDetail(
      buildRequest('http://localhost/api/campaigns/campania-detalle'),
      { params: Promise.resolve({ slug: 'campania-detalle' }) }
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.campaign.id).toBe('cmp-detail')
    expect(body.rewards).toHaveLength(1)
    expect(body.evaluation.metrics).toEqual({ rc: { prospectos_total: 2 } })
    expect(body.cache.snapshotEvaluatedAt).toBe('2025-02-01T00:00:00.000Z')
    expect(mockedFetchCampaignMetricsForUser).toHaveBeenCalledTimes(1)
    expect(mockedEvaluateCampaignCached).toHaveBeenCalledTimes(1)
  })
})
