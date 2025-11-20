import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import {
  evaluateCampaignCached,
  fetchCampaignMetricsForUser,
  fetchCampaignRulesMap,
  fetchCampaignSegmentsMap,
  fetchCampaigns,
  isCampaignActive
} from '@/lib/campaigns'
import { fetchSegmentsByIds, fetchUserSegmentIds } from '@/lib/segments'
import type { Campaign, CampaignEvaluationMetrics, CampaignEvaluationResult } from '@/types'
import {
  DEFAULT_CACHE_TTL,
  buildSegmentsMeta,
  campaignMatchesSegments,
  collectSegmentIds,
  clone,
  parsePositiveNumber
} from './helpers'
import type { CampaignSegmentsMeta } from './helpers'

export async function GET(request: NextRequest) {
  try {
    const usuario = await getUsuarioSesion(request.headers)
    if (!usuario) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!usuario.activo) {
      return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })
    }

    const ttlSeconds = parsePositiveNumber(request.nextUrl.searchParams.get('ttl')) ?? DEFAULT_CACHE_TTL
    const includeUpcoming = request.nextUrl.searchParams.get('includeUpcoming') === '1'

    const [userSegmentIds, campaigns] = await Promise.all([
      fetchUserSegmentIds(usuario.id),
      fetchCampaigns({ status: 'active' })
    ])

    if (!campaigns.length) {
      return NextResponse.json({ campaigns: [] })
    }

    const campaignIds = campaigns.map(c => c.id)
    const [segmentsLinkMap, rulesMap] = await Promise.all([
      fetchCampaignSegmentsMap(campaignIds),
      fetchCampaignRulesMap(campaignIds)
    ])

    const segmentIdSet = new Set(userSegmentIds)
    const today = new Date()
    const visibleCampaigns = campaigns.filter(campaign => {
      if (!includeUpcoming && !isCampaignActive(campaign, today)) {
        return false
      }
      return campaignMatchesSegments(campaign, segmentIdSet, segmentsLinkMap)
    })

    if (visibleCampaigns.length === 0) {
      return NextResponse.json({ campaigns: [] })
    }

    const segmentIdsNeeded = collectSegmentIds(visibleCampaigns, segmentsLinkMap)
    const segmentsCatalog = await fetchSegmentsByIds(Array.from(segmentIdsNeeded))
    const segmentMap = new Map(segmentsCatalog.map(segment => [segment.id, segment]))

    let metricsPromise: Promise<CampaignEvaluationMetrics> | null = null
    const metricsFetcher = async () => {
      if (!metricsPromise) {
        metricsPromise = fetchCampaignMetricsForUser(usuario.id)
      }
      const metrics = await metricsPromise
      return clone(metrics)
    }

    const responseItems: Array<{
      campaign: Campaign
      segments: CampaignSegmentsMeta
      evaluation: CampaignEvaluationResult
      cache: { fromCache: boolean; snapshotEvaluatedAt: string | null }
    }> = []
    for (const campaign of visibleCampaigns) {
      const rules = rulesMap.get(campaign.id) ?? []
      const { result, fromCache, snapshot } = await evaluateCampaignCached({
        campaign,
        rules,
        usuarioId: usuario.id,
        fetchMetrics: metricsFetcher,
        context: {
          usuarioRol: usuario.rol,
          segmentIds: userSegmentIds,
          segmentSlugs: []
        },
        cache: { ttlSeconds }
      })

      const segments = buildSegmentsMeta(campaign, segmentsLinkMap, segmentMap)

      responseItems.push({
        campaign,
        segments,
        evaluation: result,
        cache: {
          fromCache,
          snapshotEvaluatedAt: snapshot?.evaluated_at ?? null
        }
      })
    }

    return NextResponse.json({
      campaigns: responseItems,
      meta: {
        total: responseItems.length,
        segments: segmentsCatalog.length
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }

}

