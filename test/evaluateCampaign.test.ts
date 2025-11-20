import { describe, expect, it } from 'vitest'
import { evaluateCampaign } from '@/lib/campaigns'
import type {
  Campaign,
  CampaignRule,
  CampaignEvaluationMetrics,
  CampaignEvaluationResult
} from '@/types'

function buildCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'cmp-test',
    slug: 'campania-test',
    name: 'Campaña Test',
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

function rule(partial: Partial<CampaignRule> & Pick<CampaignRule, 'id' | 'scope' | 'rule_kind'>): CampaignRule {
  return {
    campaign_id: 'cmp-test',
    config: {},
    priority: 0,
    description: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    ...partial
  }
}

function evaluate(
  rules: CampaignRule[],
  metrics: CampaignEvaluationMetrics,
  context?: Parameters<typeof evaluateCampaign>[0]['context']
): CampaignEvaluationResult {
  return evaluateCampaign({ campaign: buildCampaign(), rules, metrics, context })
}

describe('evaluateCampaign', () => {
  it('marca elegible cuando cumple reglas de rol y segmentación', () => {
    const rules: CampaignRule[] = [
      rule({
        id: 'role-rule',
        scope: 'eligibility',
        rule_kind: 'ROLE',
        config: { allow: ['admin', 'supervisor'] },
        priority: 1
      }),
      rule({
        id: 'segment-rule',
        scope: 'eligibility',
        rule_kind: 'SEGMENT',
        config: { include: ['seg-1'], matchBy: 'id' },
        priority: 2
      })
    ]

    const result = evaluate(rules, {}, {
      usuarioRol: 'admin',
      segmentIds: ['seg-1'],
      segmentSlugs: []
    })

    expect(result.eligible).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.ruleResults).toHaveLength(2)
    expect(result.ruleResults.every(r => r.passed)).toBe(true)
  })

  it('calcula progreso parcial cuando sólo se cumplen algunas metas', () => {
    const rules: CampaignRule[] = [
      rule({
        id: 'goal-policies',
        scope: 'goal',
        rule_kind: 'COUNT_POLICIES',
        config: { field: 'vigentes', min: 3 },
        priority: 1
      }),
      rule({
        id: 'goal-premium',
        scope: 'goal',
        rule_kind: 'TOTAL_PREMIUM',
        config: { min: 5000 },
        priority: 2
      })
    ]

    const metrics: CampaignEvaluationMetrics = {
      polizas: {
        vigentes: 4,
        prima_total_mxn: 3000
      }
    }

    const result = evaluate(rules, metrics)
    expect(result.eligible).toBe(true)
    expect(result.status).toBe('eligible')
    expect(result.progress).toBe(0.5)
    expect(result.ruleResults.map(r => r.passed)).toEqual([true, false])
  })

  it('cumple reglas numéricas para RC, índices y tenure', () => {
    const rules: CampaignRule[] = [
      rule({
        id: 'rc-count',
        scope: 'goal',
        rule_kind: 'RC_COUNT',
        config: { field: 'reclutas_calidad', min: 2 },
        priority: 1
      }),
      rule({
        id: 'index-threshold',
        scope: 'goal',
        rule_kind: 'INDEX_THRESHOLD',
        config: { source: 'cancelaciones', field: 'indice_limra', min: 0.8 },
        priority: 2
      }),
      rule({
        id: 'tenure',
        scope: 'goal',
        rule_kind: 'TENURE_MONTHS',
        config: { min: 6 },
        priority: 3
      })
    ]

    const metrics: CampaignEvaluationMetrics = {
      rc: {
        reclutas_calidad: 3
      },
      cancelaciones: {
        indice_limra: 0.92
      },
      tenure_meses: 7
    }

    const result = evaluate(rules, metrics)
    expect(result.eligible).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.progress).toBe(1)
  })

  it('respeta reglas negadas y resultados personalizados', () => {
    const rules: CampaignRule[] = [
      rule({
        id: 'deny-role',
        scope: 'eligibility',
        rule_kind: 'ROLE',
        config: { deny: ['agente'] },
        priority: 1
      }),
      rule({
        id: 'negated-count',
        scope: 'goal',
        rule_kind: 'COUNT_POLICIES',
        config: { field: 'total', lt: 5, negate: true },
        priority: 2
      }),
      rule({
        id: 'custom',
        scope: 'goal',
        rule_kind: 'CUSTOM_SQL',
        config: { passed: false },
        priority: 3
      })
    ]

    const metrics: CampaignEvaluationMetrics = {
      polizas: {
        total: 6
      }
    }

    const result = evaluate(rules, metrics, {
      usuarioRol: 'supervisor'
    })

    expect(result.eligible).toBe(true)
    expect(result.ruleResults.find(r => r.id === 'negated-count')?.passed).toBe(true)
    expect(result.ruleResults.find(r => r.id === 'custom')?.passed).toBe(false)
  })

  it('evalúa reglas METRIC_CONDITION con datasets personalizados', () => {
    const rules: CampaignRule[] = [
      rule({
        id: 'ranking-posicion',
        scope: 'goal',
        rule_kind: 'METRIC_CONDITION',
        config: {
          dataset: 'ranking_r1',
          field: 'posicion',
          operator: 'lte',
          valueType: 'number',
          value: 5
        },
        priority: 1
      }),
      rule({
        id: 'ranking-estatus',
        scope: 'goal',
        rule_kind: 'METRIC_CONDITION',
        config: {
          dataset: 'ranking_r1',
          field: 'estatus',
          operator: 'eq',
          valueType: 'text',
          value: 'oro'
        },
        priority: 2
      })
    ]

    const metrics: CampaignEvaluationMetrics = {
      datasets: {
        ranking_r1: {
          posicion: 3,
          estatus: 'Oro'
        }
      }
    }

    const result = evaluate(rules, metrics)

    expect(result.eligible).toBe(true)
    expect(result.status).toBe('completed')
    expect(result.ruleResults.map(r => r.passed)).toEqual([true, true])
    expect(result.ruleResults.every(r => r.details?.dataset === 'ranking_r1')).toBe(true)
  })
})
