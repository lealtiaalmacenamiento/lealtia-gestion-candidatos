import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateCampaignWithRelations, updateCampaignStatus, deleteCampaign } from '@/lib/campaigns'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import type {
  Campaign,
  CampaignReward,
  CampaignRule,
  CampaignSegmentLink,
  CampaignStatus
} from '@/types'

vi.mock('@/lib/supabaseAdmin', () => ({
  ensureAdminClient: vi.fn()
}))

const mockedEnsureAdminClient = vi.mocked(ensureAdminClient)

function buildCampaign(id: string, overrides: Partial<Campaign> = {}): Campaign {
  return {
    id,
    slug: `${id}-slug`,
    name: `Campaña ${id}`,
    status: 'draft',
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

type DBState = {
  campaigns: Map<string, Campaign>
  segments: CampaignSegmentLink[]
  rules: CampaignRule[]
  rewards: CampaignReward[]
  progress: Array<{ campaign_id: string }>
}

function createSupabaseStubForUpdate(db: DBState) {
  let campaignCall = 0
  let segmentCall = 0
  let ruleCall = 0
  let rewardCall = 0
  let ruleIdCounter = 0
  let rewardIdCounter = 0

  return {
    from(table: string) {
      if (table === 'campaigns') {
        if (campaignCall === 0) {
          campaignCall += 1
          return {
            select: () => ({
              eq: (_column: string, value: string) => ({
                maybeSingle: () => Promise.resolve({ data: db.campaigns.get(value) ?? null, error: null })
              })
            })
          }
        }
        campaignCall += 1
        return {
          update: (updates: Record<string, unknown>) => ({
            eq: (_column: string, value: string) => ({
              select: () => ({
                single: () => {
                  const record = db.campaigns.get(value)
                  if (!record) {
                    return Promise.resolve({ data: null, error: { message: 'not found' } })
                  }
                  Object.assign(record, updates)
                  return Promise.resolve({ data: record, error: null })
                }
              })
            })
          })
        }
      }
      if (table === 'campaign_segments') {
        segmentCall += 1
        if (segmentCall === 1) {
          return {
            delete: () => ({
              eq: (_column: string, value: string) => {
                db.segments = db.segments.filter(item => item.campaign_id !== value)
                return Promise.resolve({ error: null })
              }
            })
          }
        }
        return {
          insert: (rows: CampaignSegmentLink[]) => {
            const stored = rows.map(row => ({ ...row }))
            db.segments = stored
            return {
              select: () => ({
                order: () =>
                  Promise.resolve({
                    data: [...stored].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
                    error: null
                  })
              })
            }
          }
        }
      }
      if (table === 'campaign_rules') {
        ruleCall += 1
        if (ruleCall === 1) {
          return {
            delete: () => ({
              eq: (_column: string, value: string) => {
                db.rules = db.rules.filter(item => item.campaign_id !== value)
                return Promise.resolve({ error: null })
              }
            })
          }
        }
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            const stored = rows.map((row, index) => ({
              id: `rule-${ruleIdCounter + index}`,
              campaign_id: row.campaign_id as string,
              scope: row.scope as CampaignRule['scope'],
              rule_kind: row.rule_kind as CampaignRule['rule_kind'],
              config: row.config as Record<string, unknown>,
              priority: row.priority as number,
              description: (row.description ?? null) as string | null,
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-01T00:00:00.000Z'
            }))
            ruleIdCounter += stored.length
            db.rules = stored
            return {
              select: () => ({
                order: () =>
                  Promise.resolve({
                    data: [...stored].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
                    error: null
                  })
              })
            }
          }
        }
      }
      if (table === 'campaign_rewards') {
        rewardCall += 1
        if (rewardCall === 1) {
          return {
            delete: () => ({
              eq: (_column: string, value: string) => {
                db.rewards = db.rewards.filter(item => item.campaign_id !== value)
                return Promise.resolve({ error: null })
              }
            })
          }
        }
        return {
          insert: (rows: Array<Record<string, unknown>>) => {
            const stored = rows.map((row, index) => ({
              id: `reward-${rewardIdCounter + index}`,
              campaign_id: row.campaign_id as string,
              title: row.title as string,
              description: (row.description ?? null) as string | null,
              is_accumulative: Boolean(row.is_accumulative),
              sort_order: row.sort_order as number,
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-01T00:00:00.000Z'
            }))
            rewardIdCounter += stored.length
            db.rewards = stored
            return {
              select: () => ({
                order: () =>
                  Promise.resolve({
                    data: [...stored].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
                    error: null
                  })
              })
            }
          }
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }
  }
}

function createSupabaseStubForStatus(db: DBState) {
  return {
    from() {
      return {
        update: (payload: { status: CampaignStatus }) => ({
          eq: (_column: string, value: string) => ({
            select: () => ({
              single: () => {
                const record = db.campaigns.get(value)
                if (!record) {
                  return Promise.resolve({
                    data: null,
                    error: { message: 'not found', code: 'PGRST116' }
                  })
                }
                Object.assign(record, payload)
                return Promise.resolve({ data: record, error: null })
              }
            })
          })
        })
      }
    }
  }
}

function createSupabaseStubForDelete(db: DBState) {
  return {
    from(table: string) {
      if (table === 'campaign_rules') {
        return {
          delete: () => ({
            eq: (_column: string, value: string) => {
              db.rules = db.rules.filter(item => item.campaign_id !== value)
              return Promise.resolve({ error: null })
            }
          })
        }
      }
      if (table === 'campaign_rewards') {
        return {
          delete: () => ({
            eq: (_column: string, value: string) => {
              db.rewards = db.rewards.filter(item => item.campaign_id !== value)
              return Promise.resolve({ error: null })
            }
          })
        }
      }
      if (table === 'campaign_segments') {
        return {
          delete: () => ({
            eq: (_column: string, value: string) => {
              db.segments = db.segments.filter(item => item.campaign_id !== value)
              return Promise.resolve({ error: null })
            }
          })
        }
      }
      if (table === 'campaign_progress') {
        return {
          delete: () => ({
            eq: (_column: string, value: string) => {
              db.progress = db.progress.filter(item => item.campaign_id !== value)
              return Promise.resolve({ error: null })
            }
          })
        }
      }
      if (table === 'campaigns') {
        return {
          delete: () => ({
            eq: (_column: string, value: string) => ({
              select: () => ({
                maybeSingle: () => {
                  const record = db.campaigns.get(value)
                  if (!record) {
                    return Promise.resolve({ data: null, error: null })
                  }
                  db.campaigns.delete(value)
                  return Promise.resolve({ data: { id: value }, error: null })
                }
              })
            })
          })
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateCampaignWithRelations', () => {
  it('actualiza campaña y sincroniza segmentos, reglas y premios', async () => {
    const campaign = buildCampaign('cmp-1', { status: 'active' })
    const db: DBState = {
      campaigns: new Map([[campaign.id, { ...campaign }]]),
      segments: [
        { campaign_id: campaign.id, segment_id: 'seg-old', sort_order: 0 }
      ],
      rules: [],
      rewards: [],
      progress: []
    }
    mockedEnsureAdminClient.mockReturnValue(createSupabaseStubForUpdate(db) as unknown as ReturnType<typeof ensureAdminClient>)

    const result = await updateCampaignWithRelations('cmp-1', {
      slug: ' nuevo-slug ',
      name: ' Nueva campaña ',
      summary: undefined,
      description: 'Descripción',
      status: 'active',
      active_range: '[2025-02-01,2025-12-31)',
      notes: 'Notas',
      primary_segment_id: null,
      segments: [
        { segment_id: 'seg-1', sort_order: '5' },
        { segment_id: 'seg-1', sort_order: '2' },
        { segment_id: 'seg-2' }
      ],
      rules: [
        { scope: 'ELIGIBILITY', rule_kind: 'ROLE', priority: '5', config: { negate: true } },
        { scope: 'goal', rule_kind: 'TOTAL_PREMIUM', config: { min: 1000 } },
        { scope: 'goal', rule_kind: 'ROLE', deleted: true }
      ],
      rewards: [
        { title: 'Premio A', description: 'desc', is_accumulative: true, sort_order: '3' },
        { title: 'Premio B', is_accumulative: false }
      ]
    })

    expect(result.campaign.slug).toBe('nuevo-slug')
    expect(result.campaign.description).toBe('Descripción')

    expect(result.segments).toEqual([
      { campaign_id: 'cmp-1', segment_id: 'seg-2', sort_order: 2 },
      { campaign_id: 'cmp-1', segment_id: 'seg-1', sort_order: 5 }
    ])
    expect(db.segments).toEqual([
      { campaign_id: 'cmp-1', segment_id: 'seg-1', sort_order: 5 },
      { campaign_id: 'cmp-1', segment_id: 'seg-2', sort_order: 2 }
    ])

    expect(result.rules.map(rule => rule.scope)).toEqual(['goal', 'eligibility'])
    expect(result.rules.map(rule => rule.priority)).toEqual([1, 5])
    expect(result.rules[1].config).toEqual({ negate: true })
    expect(db.rules).toHaveLength(2)

    expect(result.rewards.map(reward => reward.title)).toEqual(['Premio B', 'Premio A'])
    expect(result.rewards[1].is_accumulative).toBe(true)
    expect(db.rewards).toHaveLength(2)
  })
})

describe('updateCampaignStatus', () => {
  it('actualiza status válido', async () => {
    const campaign = buildCampaign('cmp-2', { status: 'draft' })
    const db: DBState = {
      campaigns: new Map([[campaign.id, { ...campaign }]]),
      segments: [],
      rules: [],
      rewards: [],
      progress: []
    }
    mockedEnsureAdminClient.mockReturnValue(createSupabaseStubForStatus(db) as unknown as ReturnType<typeof ensureAdminClient>)

    const updated = await updateCampaignStatus('cmp-2', 'active')

    expect(updated.status).toBe('active')
    expect(db.campaigns.get('cmp-2')?.status).toBe('active')
  })
})

describe('deleteCampaign', () => {
  it('elimina campaña y dependencias', async () => {
    const campaign = buildCampaign('cmp-3', { status: 'archived' })
    const db: DBState = {
      campaigns: new Map([[campaign.id, { ...campaign }]]),
      segments: [
        { campaign_id: campaign.id, segment_id: 'seg-1', sort_order: 0 }
      ],
      rules: [
        {
          id: 'rule-1',
          campaign_id: campaign.id,
          scope: 'eligibility',
          rule_kind: 'ROLE',
          config: {},
          priority: 0,
          description: null,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z'
        }
      ],
      rewards: [
        {
          id: 'reward-1',
          campaign_id: campaign.id,
          title: 'Premio',
          description: null,
          is_accumulative: false,
          sort_order: 0,
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z'
        }
      ],
      progress: [{ campaign_id: campaign.id }]
    }
    mockedEnsureAdminClient.mockReturnValue(createSupabaseStubForDelete(db) as unknown as ReturnType<typeof ensureAdminClient>)

    const removed = await deleteCampaign('cmp-3')

    expect(removed).toBe(true)
    expect(db.campaigns.has('cmp-3')).toBe(false)
    expect(db.segments).toHaveLength(0)
    expect(db.rules).toHaveLength(0)
    expect(db.rewards).toHaveLength(0)
    expect(db.progress).toHaveLength(0)
  })
})
