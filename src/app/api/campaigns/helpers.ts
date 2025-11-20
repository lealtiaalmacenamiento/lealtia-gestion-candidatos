import type { Campaign, CampaignSegmentLink, Segment } from '@/types'

type CampaignSegmentsMetaInternal = {
  primary: Segment | null
  additional: Segment[]
}

const EMPTY_SEGMENTS: CampaignSegmentsMetaInternal = { primary: null, additional: [] }

export const DEFAULT_CACHE_TTL = 300

export type CampaignSegmentsMeta = CampaignSegmentsMetaInternal

export function campaignMatchesSegments(
  campaign: Campaign,
  userSegments: Set<string>,
  linkMap: Map<string, CampaignSegmentLink[]>
): boolean {
  const required = new Set<string>()
  if (campaign.primary_segment_id) {
    required.add(campaign.primary_segment_id)
  }
  const links = linkMap.get(campaign.id) ?? []
  for (const link of links) {
    required.add(link.segment_id)
  }
  if (required.size === 0) return true
  for (const segmentId of required) {
    if (userSegments.has(segmentId)) {
      return true
    }
  }
  return false
}

export function collectSegmentIds(
  campaigns: Campaign[],
  linkMap: Map<string, CampaignSegmentLink[]>
): Set<string> {
  const ids = new Set<string>()
  for (const campaign of campaigns) {
    if (campaign.primary_segment_id) {
      ids.add(campaign.primary_segment_id)
    }
    const links = linkMap.get(campaign.id) ?? []
    for (const link of links) {
      ids.add(link.segment_id)
    }
  }
  return ids
}

export function buildSegmentsMeta(
  campaign: Campaign,
  linkMap: Map<string, CampaignSegmentLink[]>,
  segmentMap: Map<string, Segment>
): CampaignSegmentsMetaInternal {
  if (!linkMap.size && !campaign.primary_segment_id) {
    return EMPTY_SEGMENTS
  }
  const primary = campaign.primary_segment_id ? segmentMap.get(campaign.primary_segment_id) ?? null : null
  const additional: Segment[] = []
  const links = linkMap.get(campaign.id) ?? []
  for (const link of links) {
    const seg = segmentMap.get(link.segment_id)
    if (!seg) continue
    if (primary && seg.id === primary.id) continue
    additional.push(seg)
  }
  return { primary, additional }
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function parsePositiveNumber(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.floor(parsed)
}
