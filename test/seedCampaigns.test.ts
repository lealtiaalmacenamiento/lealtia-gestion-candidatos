import { describe, expect, it } from 'vitest'
import { normalizeSeedCampaign, parseArgs, parseSegmentTokens } from '../scripts/seed-campaigns'

describe('seed-campaigns utilities', () => {
  it('parseArgs soporta banderas conocidas', () => {
    const options = parseArgs(['--file', 'data/campaigns.json', '--dry-run', '--insert-only'])
    expect(options.file).toBe('data/campaigns.json')
    expect(options.dryRun).toBe(true)
    expect(options.insertOnly).toBe(true)
  })

  it('parseSegmentTokens deduplica y soporta orden explícito', () => {
    const tokens = parseSegmentTokens(['seg-a#5', 'seg-b', { segment_id: 'uuid-1', sort_order: 3 }, 'seg-a#1'])
    expect(tokens).toEqual([
      { key: 'seg-a', sort: 5 },
      { key: 'seg-b' },
      { id: 'uuid-1', sort: 3 }
    ])
  })

  it('normalizeSeedCampaign construye payload normalizado', () => {
    const row = {
      slug: 'camp-1',
      name: 'Campaña Uno',
      summary: 'Resumen',
      description: 'Descripción',
      notes: 'Notas',
      status: 'ACTIVE',
      activeRangeStart: '2025-01-01',
      activeRangeEnd: '2025-12-31',
      primary_segment: 'Super Segment',
      segments: 'Super Segment#2|seg-secundario',
      rules: JSON.stringify([
        { scope: 'eligibility', rule_kind: 'ROLE', priority: 5, config: { allow: ['agente'] } },
        { scope: 'goal', rule_kind: 'TOTAL_PREMIUM', config: { min: 1000 } }
      ]),
      rewards: [
        { title: 'Premio base', sort_order: 2 },
        '{"title":"Premio superior","is_accumulative":true}'
      ],
      created_by: 99
    }

    const normalized = normalizeSeedCampaign(row, 0)

    expect(normalized.slug).toBe('camp-1')
    expect(normalized.name).toBe('Campaña Uno')
    expect(normalized.status).toBe('active')
    expect(normalized.activeRange).toBe('[2025-01-01,2025-12-31)')
    expect(normalized.primarySegmentName).toBe('Super Segment')
    expect(normalized.segments).toEqual([
      { key: 'Super Segment', sort: 2 },
      { key: 'seg-secundario' }
    ])
    expect(normalized.rules).toHaveLength(2)
    expect(normalized.rules[0].rule_kind).toBe('ROLE')
    expect(normalized.rewards).toEqual([
      { title: 'Premio base', description: null, is_accumulative: false, sort_order: 2 },
      { title: 'Premio superior', description: null, is_accumulative: true, sort_order: 1 }
    ])
    expect(normalized.created_by).toBe(99)
  })
})
