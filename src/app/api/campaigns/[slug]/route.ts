import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import {
  evaluateCampaignCached,
  fetchCampaignBySlug,
  fetchCampaignMetricsForUser,
  fetchCampaignRewards,
  fetchCampaignRulesMap,
  fetchCampaignSegmentsMap,
  isCampaignActive
} from '@/lib/campaigns'
import { fetchSegmentsByIds, fetchUserSegmentIds } from '@/lib/segments'
import type {
  Campaign,
  CampaignEvaluationMetrics,
  CampaignEvaluationResult,
  CampaignReward
} from '@/types'
import {
  DEFAULT_CACHE_TTL,
  buildSegmentsMeta,
  campaignMatchesSegments,
  collectSegmentIds,
  clone,
  parsePositiveNumber
} from '../helpers'
import type { CampaignSegmentsMeta } from '../helpers'

type CampaignDetailResponse = {
  campaign: Campaign
  segments: CampaignSegmentsMeta
  rewards: CampaignReward[]
  evaluation: CampaignEvaluationResult
  cache: {
    fromCache: boolean
    snapshotEvaluatedAt: string | null
  }
}

type SlugRouteParams = { slug: string }

export async function GET(request: NextRequest, context: { params: Promise<SlugRouteParams> }) {
  try {
    const usuario = await getUsuarioSesion(request.headers)
    if (!usuario) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!usuario.activo) {
      return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })
    }

    const { slug } = await context.params
    if (!slug) {
      return NextResponse.json({ error: 'Slug requerido' }, { status: 400 })
    }

    const ttlSeconds = parsePositiveNumber(request.nextUrl.searchParams.get('ttl')) ?? DEFAULT_CACHE_TTL
    const includeUpcoming = request.nextUrl.searchParams.get('includeUpcoming') === '1'

    const [userSegmentIds, campaign] = await Promise.all([
      fetchUserSegmentIds(usuario.id),
      fetchCampaignBySlug(slug)
    ])

    if (!campaign) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    if (campaign.status !== 'active') {
      return NextResponse.json({ error: 'Campaña no disponible' }, { status: 404 })
    }

    const [segmentsLinkMap, rulesMap, rewards] = await Promise.all([
      fetchCampaignSegmentsMap([campaign.id]),
      fetchCampaignRulesMap([campaign.id]),
      fetchCampaignRewards(campaign.id)
    ])

    const segmentIdSet = new Set(userSegmentIds)
    if (!campaignMatchesSegments(campaign, segmentIdSet, segmentsLinkMap)) {
      return NextResponse.json({ error: 'Campaña no visible para el usuario' }, { status: 403 })
    }

    const now = new Date()
    if (!includeUpcoming && !isCampaignActive(campaign, now)) {
      return NextResponse.json({ error: 'Campaña fuera de vigencia' }, { status: 404 })
    }

    const segmentIdsNeeded = collectSegmentIds([campaign], segmentsLinkMap)
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

    const payload: CampaignDetailResponse = {
      campaign,
      segments,
      rewards,
      evaluation: result,
      cache: {
        fromCache,
        snapshotEvaluatedAt: snapshot?.evaluated_at ?? null
      }
    }

    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
