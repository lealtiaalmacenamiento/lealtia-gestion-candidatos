"use client"

import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch, type FieldPath, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import AppModal from '@/components/ui/AppModal'
import {
  createAdminCampaign,
  updateAdminCampaign
} from '@/lib/api'
import {
  BUILTIN_DATASET_KEYS,
  CAMPAIGN_DATASET_DEFINITIONS,
  getCampaignDatasetDefinition as registryGetDatasetDefinition,
  getCampaignDatasetDefinitionsByScope as registryGetDatasetDefinitionsByScope,
  getCampaignDatasetField as registryGetDatasetField,
  isCampaignDatasetKey,
  type CampaignDatasetDefinition,
  type CampaignDatasetField,
  type CampaignDatasetKey
} from '@/lib/campaignDatasetRegistry'
import type {
  Campaign,
  CampaignReward,
  CampaignRule,
  CampaignRuleScope,
  CampaignSegmentLink,
  CampaignStatus,
  Segment
} from '@/types'
import type { CampaignRewardInput, CampaignRuleInput, CampaignSegmentInput } from '@/lib/campaigns'
import {
  campaignWizardSchema,
  createCampaignWizardDefaultValues,
  type CampaignWizardFormValues,
  type EligibilityFormValues,
  type GeneralFormValues,
  type RequirementFormValue,
  type RewardFormValue,
  type RequirementOperator,
  type RequirementValueType
} from '@/lib/validation/campaignSchemas'

type NotifyType = 'success' | 'danger' | 'info' | 'warning'

type RewardDraft = {
  title: string
  description: string
  isAccumulative: boolean
}

type RewardItem = RewardFormValue

type EligibilityState = EligibilityFormValues

type RequirementDatasetKey = CampaignDatasetKey

type RequirementItem = RequirementFormValue

type RequirementMetricItem = RequirementFormValue

type RequirementDatasetField = CampaignDatasetField

type RequirementDatasetDefinition = CampaignDatasetDefinition

type GeneralState = GeneralFormValues
type WizardMode = 'create' | 'edit' | 'duplicate'

interface CampaignWizardInitialData {
  campaign: Campaign
  segments: CampaignSegmentLink[]
  rules: CampaignRule[]
  rewards: CampaignReward[]
}

interface CampaignWizardProps {
  mode?: WizardMode
  segments: Segment[]
  onClose: () => void
  onCreated?: (campaign: Campaign) => void
  onUpdated?: (campaign: Campaign) => void
  onNotify: (message: string, type: NotifyType) => void
  initialData?: CampaignWizardInitialData
}

const STEP_LABELS = ['Datos generales', 'Elegibilidad', 'Requisitos', 'Premios', 'Notas', 'Resumen']
const TOTAL_STEPS = STEP_LABELS.length

const REQUIREMENT_SCOPE_OPTIONS: Array<{ value: CampaignRuleScope; label: string }> = [
  { value: 'eligibility', label: 'Elegibilidad' },
  { value: 'goal', label: 'Objetivo / Meta' }
]

const UNIFIED_OPERATOR_OPTIONS: Array<{ value: RequirementOperator; label: string }> = [
  { value: 'eq', label: 'ES' },
  { value: 'neq', label: 'NO ES' },
  { value: 'gt', label: 'MAYOR QUE' },
  { value: 'gte', label: 'MAYOR O IGUAL QUE' },
  { value: 'lt', label: 'MENOR QUE' },
  { value: 'lte', label: 'MENOR O IGUAL QUE' },
  { value: 'contains', label: 'CONTIENE' },
  { value: 'not_contains', label: 'NO CONTIENE' },
  { value: 'in', label: 'ES UNO DE' }
]

const OPERATOR_LABEL_MAP: Record<RequirementOperator, string> = Object.fromEntries(
  UNIFIED_OPERATOR_OPTIONS.map(option => [option.value, option.label])
) as Record<RequirementOperator, string>


const DATASET_DEFINITIONS: RequirementDatasetDefinition[] = CAMPAIGN_DATASET_DEFINITIONS

const CUSTOM_METRIC_DATASET_DEFINITIONS = DATASET_DEFINITIONS.filter(
  definition => !BUILTIN_DATASET_KEYS.has(definition.key)
)

const MODAL_CONTENT_MAX_HEIGHT = '70vh'

const REQUIREMENT_KIND_LABEL_MAP: Record<'metric', string> = {
  metric: 'Indicador'
}

const SCOPE_LABEL_MAP: Record<CampaignRuleScope, string> = {
  eligibility: 'Elegibilidad',
  goal: 'Objetivo / Meta'
}

// Helper function to convert field type to requirement value type
// Boolean fields are only used as params, never as requirement values
function fieldTypeToRequirementValueType(fieldType: 'number' | 'text' | 'boolean'): RequirementValueType {
  return fieldType === 'boolean' ? 'text' : fieldType
}

const CUSTOM_SELECT_VALUE = '__custom__'

const METRIC_NUMERIC_PRESETS = ['1', '5', '10', '25', '50', '100', '250', '500', '1000']
const METRIC_TEXT_PRESETS = ['Sí', 'No', 'Activo', 'Inactivo', 'Pendiente']
const METRIC_FIELD_PRESET_MAP: Record<string, string[]> = {
  'candidatos.ultimo_mes_conexion': ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  'clasificacion_asesor.permitido': ['true', 'false'],
  'primera_poliza_bonus.cumple': ['true', 'false'],
  'bono_grupo_1.cumple': ['true', 'false'],
  'mix_vida.ratio': ['0.5', '0.6', '0.7', '0.8', '0.9', '1'],
  'prima_minima.cumple': ['true', 'false'],
  'msi_inicial.aplica': ['true', 'false'],
  'msi_renovacion_gmmi.aplica': ['true', 'false'],
  'comisiones_dobles.activo': ['true', 'false'],
  'vida_dolares.cumple': ['true', 'false'],
  'momentum_prima_minima.cumple': ['true', 'false'],
  'region_dcn.es_dcn': ['true', 'false'],
  'meta_comisiones.meta_cumplida': ['true', 'false'],
  'promotor_360_index.cumple': ['true', 'false'],
  'promotor_360_dcn_index.cumple': ['true', 'false'],
  'graduados_por_generacion.cumple': ['true', 'false'],
  'asesores_ganadores.cumple': ['true', 'false'],
  'creciendo_contigo_score.cumple': ['true', 'false'],
  'promotores_asesores_ganadores.cumple': ['true', 'false'],
  'asesores_proactivos.cumple': ['true', 'false'],
  'asesores_conectados.en_rango': ['true', 'false'],
  'msi_promotor_condiciones.cumple': ['true', 'false'],
  'ranking_r1.posicion': ['1', '3', '5', '10'],
  'ranking_r1.estatus': ['Oro', 'Plata', 'Bronce'],
  'ranking_r1.puntos': ['80', '100', '150', '200']
}

function getMetadataPresetValues(dataset?: RequirementDatasetKey, field?: string): string[] {
  if (!dataset || !field) return []
  // Sample values are no longer stored in metadata - they come from the database
  return []
}

function resolveScopeLabel(scope: CampaignRuleScope): string {
  return SCOPE_LABEL_MAP[scope] ?? scope
}

function resolveRequirementKindLabel(kind: 'metric'): string {
  return REQUIREMENT_KIND_LABEL_MAP[kind] ?? kind
}

function getMetricValuePresets(valueType: RequirementValueType, dataset?: RequirementDatasetKey, field?: string): string[] {
  const fieldKey = dataset && field ? `${dataset}.${field}` : undefined
  const specificPresets = fieldKey ? METRIC_FIELD_PRESET_MAP[fieldKey] : undefined
  if (specificPresets && specificPresets.length > 0) {
    return specificPresets
  }
  const metadataPresets = getMetadataPresetValues(dataset, field)
  if (metadataPresets.length > 0) {
    return metadataPresets
  }
  return valueType === 'number' ? METRIC_NUMERIC_PRESETS : METRIC_TEXT_PRESETS
}

function isPresetMetricValue(valueType: RequirementValueType, value: string, dataset?: RequirementDatasetKey, field?: string): boolean {
  const presets = getMetricValuePresets(valueType, dataset, field)
  if (presets.includes(value)) {
    return true
  }
  if (valueType === 'number') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return false
    }
    return presets.some(preset => Number(preset) === numeric)
  }
  return presets.map(entry => entry.toLowerCase()).includes(value.toLowerCase())
}

function applyDefaultMetricValue(valueType: RequirementValueType, dataset?: RequirementDatasetKey, field?: string): { value: string; mode: 'preset' | 'custom' } {
  const presets = getMetricValuePresets(valueType, dataset, field)
  if (presets.length > 0) {
    return { value: presets[0], mode: 'preset' }
  }
  return { value: '', mode: 'custom' }
}

function deriveMetricValueMode(valueType: RequirementValueType, value: string, dataset?: RequirementDatasetKey, field?: string): 'preset' | 'custom' {
  return isPresetMetricValue(valueType, value, dataset, field) ? 'preset' : 'custom'
}

function isMetricRequirement(item: RequirementItem): item is RequirementMetricItem {
  return item.kind === 'metric'
}

function getDatasetDefinition(dataset: RequirementDatasetKey): RequirementDatasetDefinition | undefined {
  return registryGetDatasetDefinition(dataset)
}

function getDatasetDefinitionsByScope(scope: CampaignRuleScope): RequirementDatasetDefinition[] {
  return registryGetDatasetDefinitionsByScope(scope)
}

function getFieldDefinition(dataset: RequirementDatasetKey, field: string): RequirementDatasetField | undefined {
  return registryGetDatasetField(dataset, field)
}

function getOperatorOptions(): Array<{ value: RequirementOperator; label: string }> {
  return UNIFIED_OPERATOR_OPTIONS
}

function normalizeNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function collectNumericComparators(config: Record<string, unknown>): Array<{ operator: RequirementOperator; value: number }> {
  const entries: Array<{ operator: RequirementOperator; value: number }> = []
  const register = (candidate: unknown, operator: RequirementOperator) => {
    const numeric = normalizeNumericValue(candidate)
    if (numeric !== null) {
      entries.push({ operator, value: numeric })
    }
  }

  register(config.min ?? config.minimum ?? config.minValue ?? config.min_months, 'gte')
  register(config.max ?? config.maximum ?? config.maxValue ?? config.max_months, 'lte')
  register(config.gt ?? config.greaterThan, 'gt')
  register(config.lt ?? config.lessThan, 'lt')
  register(config.eq ?? config.equals, 'eq')
  register(config.threshold ?? config.meta ?? config.goal ?? config.target, 'gte')

  return entries
}

function resolveTotalPremiumFieldKey(config: Record<string, unknown>): string {
  const rawField = typeof config.field === 'string' ? config.field.trim() : ''
  if (rawField && getFieldDefinition('polizas', rawField)) {
    return rawField
  }

  const metricRaw = typeof config.metric === 'string' ? config.metric.trim().toLowerCase() : ''
  switch (metricRaw) {
    case 'prima_vigente':
    case 'vigente':
      return 'prima_vigente_mxn'
    case 'prima_promedio':
    case 'average_premium':
      return 'prima_promedio_mxn'
    case 'commission':
    case 'commissions':
    case 'comision':
    case 'comisiones':
      return 'comision_base_mxn'
    case 'income':
    case 'ingreso':
    case 'ingresos':
      return 'ingresos_mxn'
    case 'points':
    case 'puntos':
      return 'puntos_totales'
    case 'momentum':
    case 'momentum_vita':
      return 'momentum_vita'
    case 'vigentes':
    case 'polizas_vigentes':
      return 'polizas_vigentes'
    case 'polizas_total':
    case 'total_policies':
    case 'total':
    case 'polizas':
      return 'polizas_total'
    default:
      return 'prima_total_mxn'
  }
}

function resolveCountPoliciesFieldKey(config: Record<string, unknown>): string {
  const fieldRaw = typeof config.field === 'string' ? config.field.trim() : ''
  if (fieldRaw && getFieldDefinition('polizas', fieldRaw)) {
    return fieldRaw
  }

  const metricRaw = typeof config.metric === 'string' ? config.metric.trim().toLowerCase() : ''
  switch (metricRaw) {
    case 'total':
    case 'polizas_total':
    case 'total_policies':
    case 'polizas':
      return 'polizas_total'
    case 'anuladas':
    case 'polizas_anuladas':
      return 'polizas_anuladas'
    case 'vigentes':
    case 'polizas_vigentes':
    default:
      return 'polizas_vigentes'
  }
}

function resolveRcFieldKey(config: Record<string, unknown>): string {
  const fieldRaw = typeof config.field === 'string' ? config.field.trim() : ''
  if (fieldRaw && getFieldDefinition('rc', fieldRaw)) {
    return fieldRaw
  }

  const metricRaw = typeof config.metric === 'string' ? config.metric.trim().toLowerCase() : ''
  switch (metricRaw) {
    case 'vigencia':
    case 'rc_vigencia':
      return 'rc_vigencia'
    case 'permanencia':
      return 'permanencia'
    case 'ratio':
    case 'reclutas_ratio':
      return 'reclutas_calidad_ratio'
    case 'prospectos':
      return 'prospectos_total'
    default:
      return 'reclutas_calidad'
  }
}

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activa' },
  { value: 'paused', label: 'Pausada' },
  { value: 'archived', label: 'Archivada' }
]

const INITIAL_GENERAL: GeneralState = {
  name: '',
  slug: '',
  summary: '',
  description: '',
  status: 'draft',
  activeRangeStart: '',
  activeRangeEnd: '',
  segmentIds: []
}

const INITIAL_ELIGIBILITY: EligibilityState = {
  requiredSegments: [],
  excludedSegments: [],
  match: 'any'
}

const INITIAL_REWARD_DRAFT: RewardDraft = {
  title: '',
  description: '',
  isAccumulative: false
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

function parseActiveRange(range?: string | null): { start: string; end: string } {
  if (!range) return { start: '', end: '' }
  const matches = range.match(/\[(.*?),(.*?)\)/)
  if (!matches) return { start: '', end: '' }
  const [, startRaw, endRaw] = matches
  const toDateString = (value?: string) => (value ? value.slice(0, 10) : '')
  return { start: toDateString(startRaw), end: toDateString(endRaw) }
}

function isValidDateRange(start: string, end: string): boolean {
  if (!start || !end) return false
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return false
  }
  return startDate <= endDate
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function generateRandomKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `reward-${Math.random().toString(36).slice(2, 10)}`
}

function isDatasetKey(value: string): value is RequirementDatasetKey {
  return isCampaignDatasetKey(value)
}

function isRequirementOperator(value: string): value is RequirementOperator {
  return Boolean(OPERATOR_LABEL_MAP[value as RequirementOperator])
}

function sanitizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

function deriveEligibilityState(rules: CampaignRule[]): EligibilityState {
  const next: EligibilityState = { ...INITIAL_ELIGIBILITY }

  rules.forEach(rule => {
    if (rule.scope !== 'eligibility' || rule.rule_kind !== 'SEGMENT' || !rule.config) return
    const config = rule.config as Record<string, unknown>
    const all = sanitizeStringList(config.all ?? config.allOf ?? config.requireAll)
    const any = sanitizeStringList(config.any ?? config.anyOf ?? config.include ?? config.requireAny)
    const exclude = sanitizeStringList(config.exclude ?? config.block ?? config.disallow)
    if (all.length > 0) {
      next.match = 'all'
      next.requiredSegments = all
    } else if (any.length > 0) {
      next.match = 'any'
      next.requiredSegments = any
    }
    if (exclude.length > 0) {
      next.excludedSegments = exclude
    }
  })

  next.requiredSegments = unique(next.requiredSegments)
  next.excludedSegments = unique(next.excludedSegments.filter(id => !next.requiredSegments.includes(id)))

  return next
}

function createRequirementFromRule(rule: CampaignRule): RequirementItem[] {
  const outputs: RequirementItem[] = []

  if (rule.rule_kind === 'METRIC_CONDITION' && rule.config) {
    const config = rule.config as Record<string, unknown>
    const datasetRaw = typeof config.dataset === 'string' ? config.dataset : typeof config.source === 'string' ? config.source : ''
    const fieldRaw = typeof config.field === 'string' ? config.field : typeof config.metric === 'string' ? config.metric : ''
    if (datasetRaw && fieldRaw && isDatasetKey(datasetRaw)) {
      const dataset = datasetRaw
      const fieldDef = getFieldDefinition(dataset, fieldRaw)
      if (fieldDef) {
        const operatorRaw = typeof config.operator === 'string' ? config.operator : typeof config.comparator === 'string' ? config.comparator : ''
        const operator = isRequirementOperator(operatorRaw) ? operatorRaw : getOperatorOptions()[0]?.value ?? 'eq'
        const valueSource = config.valueRaw ?? config.value ?? config.expected
        const valueString = valueSource === undefined || valueSource === null ? '' : String(valueSource)
        const valueType: RequirementValueType = config.valueType === 'text' ? 'text' : fieldTypeToRequirementValueType(fieldDef.type)
        const valueMode = deriveMetricValueMode(valueType, valueString, dataset, fieldDef.value)
        
        // Extract dataset params (prima_minima_mxn, dias_ventana, etc.)
        const datasetParams: Record<string, string | number> = {}
        const datasetDef = getDatasetDefinition(dataset)
        if (datasetDef) {
          datasetDef.fields.forEach(field => {
            if (field.value !== fieldRaw && config[field.value] !== undefined) {
              const paramValue = config[field.value]
              if (typeof paramValue === 'string' || typeof paramValue === 'number') {
                datasetParams[field.value] = paramValue
              }
            }
          })
        }
        
        const item: RequirementMetricItem = {
          key: generateRandomKey(),
          kind: 'metric',
          scope: rule.scope,
          dataset,
          field: fieldDef.value,
          operator,
          value: valueString,
          valueType,
          valueMode,
          description: typeof rule.description === 'string' ? rule.description : '',
          logicalGroup: rule.logical_group ?? 1,
          logicalOperator: rule.logical_operator ?? 'AND',
          datasetParams
        }
        outputs.push(item)
      }
    }
    return outputs
  }

  if (rule.config && rule.rule_kind !== 'SEGMENT') {
    const config = rule.config as Record<string, unknown>
    if (rule.rule_kind === 'INDEX_THRESHOLD') {
      const rawIndices = Array.isArray(config.indices) ? (config.indices as unknown[]) : []
      const baseDescription = typeof rule.description === 'string' ? rule.description : ''
      rawIndices.forEach((rawIndex, indexPosition) => {
        if (!rawIndex || typeof rawIndex !== 'object') return
        const indexConfig = rawIndex as Record<string, unknown>
        const datasetCandidate = typeof indexConfig.dataset === 'string' ? indexConfig.dataset : typeof indexConfig.source === 'string' ? indexConfig.source : ''
        const dataset = isDatasetKey(datasetCandidate) ? datasetCandidate : 'cancelaciones'
        const fieldCandidate = typeof indexConfig.field === 'string' ? indexConfig.field.trim() : ''
        if (!fieldCandidate) return
        const fieldDef = getFieldDefinition(dataset, fieldCandidate)
        if (!fieldDef) return
        const comparators = collectNumericComparators(indexConfig)
        if (comparators.length === 0) return
        const indexLabel = typeof indexConfig.label === 'string' ? indexConfig.label : typeof indexConfig.name === 'string' ? indexConfig.name : `Índice ${indexPosition + 1}`
        const description = indexLabel ? (baseDescription ? `${indexLabel} • ${baseDescription}` : indexLabel) : baseDescription
        comparators.forEach(entry => {
          const valueString = String(entry.value)
          const valueMode = deriveMetricValueMode(fieldTypeToRequirementValueType(fieldDef.type), valueString, dataset, fieldDef.value)
          outputs.push({
            key: generateRandomKey(),
            kind: 'metric',
            scope: rule.scope,
            dataset,
            field: fieldDef.value,
            operator: entry.operator,
            value: valueString,
            valueType: fieldTypeToRequirementValueType(fieldDef.type),
            valueMode,
            description,
            logicalGroup: rule.logical_group ?? 1,
            logicalOperator: rule.logical_operator ?? 'AND',
            datasetParams: {}
          })
        })
      })
      if (outputs.length > 0) {
        return outputs
      }
    }

    const numericEntries = collectNumericComparators(config)

    const mapLegacyFields = (): Array<{ dataset: RequirementDatasetKey; field: string }> => {
      switch (rule.rule_kind) {
        case 'COUNT_POLICIES':
          return [{ dataset: 'polizas', field: resolveCountPoliciesFieldKey(config) }]
        case 'TOTAL_PREMIUM':
          return [{ dataset: 'polizas', field: resolveTotalPremiumFieldKey(config) }]
        case 'RC_COUNT':
          return [{ dataset: 'rc', field: resolveRcFieldKey(config) }]
        case 'INDEX_THRESHOLD': {
          const datasetCandidate = typeof config.source === 'string' ? config.source : undefined
          const dataset = datasetCandidate && isDatasetKey(datasetCandidate as RequirementDatasetKey)
            ? (datasetCandidate as RequirementDatasetKey)
            : 'cancelaciones'
          const field = typeof config.field === 'string' ? config.field : 'indice_limra'
          return [{ dataset, field }]
        }
        case 'TENURE_MONTHS':
          return [{ dataset: 'tenure', field: 'tenure_meses' }]
        default:
          return []
      }
    }

    const mappings = mapLegacyFields()
    const description = typeof rule.description === 'string' ? rule.description : ''

    if (numericEntries.length === 0) {
      return outputs
    }

    mappings.forEach(mapping => {
      const fieldDef = getFieldDefinition(mapping.dataset, mapping.field)
      if (!fieldDef) {
        return
      }
      numericEntries.forEach(entry => {
        const valueString = String(entry.value)
        const valueMode = deriveMetricValueMode(fieldTypeToRequirementValueType(fieldDef.type), valueString, mapping.dataset, fieldDef.value)
        outputs.push({
          key: generateRandomKey(),
          kind: 'metric',
          scope: rule.scope,
          dataset: mapping.dataset,
          field: fieldDef.value,
          operator: entry.operator,
          value: valueString,
          valueType: fieldTypeToRequirementValueType(fieldDef.type),
          valueMode,
          description,
          logicalGroup: rule.logical_group ?? 1,
          logicalOperator: rule.logical_operator ?? 'AND',
          datasetParams: {}
        })
      })
    })
  }

  return outputs
}

function deriveRequirements(rules: CampaignRule[]): RequirementItem[] {
  const sorted = [...rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  const items: RequirementItem[] = []
  sorted.forEach(rule => {
    createRequirementFromRule(rule).forEach(item => items.push(item))
  })
  return items
}

function deriveRewards(rewards: CampaignReward[]): RewardItem[] {
  return rewards
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(reward => ({
      key: reward.id || generateRandomKey(),
      title: reward.title,
      description: reward.description ?? '',
      isAccumulative: Boolean(reward.is_accumulative)
    }))
}

export default function CampaignWizard({
  mode = 'create',
  segments,
  onClose,
  onCreated,
  onUpdated,
  onNotify,
  initialData
}: CampaignWizardProps) {
  const form = useForm<CampaignWizardFormValues>({
    resolver: zodResolver(campaignWizardSchema) as unknown as Resolver<CampaignWizardFormValues>,
    defaultValues: createCampaignWizardDefaultValues()
  })
  const general = useWatch({ control: form.control, name: 'general' }) ?? INITIAL_GENERAL

  const [step, setStep] = useState(0)
  const [slugDirty, setSlugDirty] = useState(false)
  const [eligibility, setEligibility] = useState<EligibilityState>({ ...INITIAL_ELIGIBILITY })
  const [requirements, setRequirements] = useState<RequirementItem[]>([])
  const [rewards, setRewards] = useState<RewardItem[]>([])
  const [rewardDraft, setRewardDraft] = useState<RewardDraft>({ ...INITIAL_REWARD_DRAFT })
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appliedKey, setAppliedKey] = useState<string | null>(null)
  const [productParameters, setProductParameters] = useState<Array<{ id: string; display_name: string }>>([])

  const sortedSegments = useMemo(() => {
    return [...segments].sort((a, b) => a.name.localeCompare(b.name))
  }, [segments])

  const selectedCampaignSegments = useMemo(() => new Set(general.segmentIds), [general.segmentIds])

  useEffect(() => {
    async function loadProductParameters() {
      try {
        const response = await fetch('/api/admin/product-parameters')
        if (response.ok) {
          const data = await response.json()
          setProductParameters(data)
        }
      } catch (err) {
        console.error('Error loading product parameters:', err)
      }
    }
    loadProductParameters()
  }, [])

  const detailKey = initialData ? `${initialData.campaign.id}:${mode}` : null

  useEffect(() => {
    if (!initialData) {
      if (appliedKey !== null) {
        form.reset(createCampaignWizardDefaultValues())
        setStep(0)
        setEligibility({ ...INITIAL_ELIGIBILITY })
        setRequirements([])
        setRewards([])
        setRewardDraft({ ...INITIAL_REWARD_DRAFT })
        setNotes('')
        setSlugDirty(false)
        setAppliedKey(null)
      }
      return
    }
    if (detailKey === appliedKey) return

    const { campaign, segments: segmentLinks, rules, rewards: rewardList } = initialData
    const { start, end } = parseActiveRange(campaign.active_range)

    const orderedSegmentIds = [...segmentLinks]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(link => link.segment_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    const primaryId = campaign.primary_segment_id ?? ''
    const combinedSegments = primaryId && !orderedSegmentIds.includes(primaryId)
      ? [primaryId, ...orderedSegmentIds]
      : orderedSegmentIds
    const uniqueSegmentIds = unique(combinedSegments)

    let baseGeneral: GeneralState
    if (mode === 'duplicate') {
      const duplicateName = `${campaign.name} (copia)`
      baseGeneral = {
        name: duplicateName,
        slug: slugify(duplicateName),
        summary: campaign.summary ?? '',
        description: campaign.description ?? '',
        status: 'draft',
        activeRangeStart: start,
        activeRangeEnd: end,
        segmentIds: uniqueSegmentIds
      }
    } else {
      baseGeneral = {
        name: campaign.name,
        slug: campaign.slug,
        summary: campaign.summary ?? '',
        description: campaign.description ?? '',
        status: campaign.status,
        activeRangeStart: start,
        activeRangeEnd: end,
        segmentIds: uniqueSegmentIds
      }
    }

    const derivedEligibility = deriveEligibilityState(rules)
    const derivedRequirements = deriveRequirements(rules)
    const derivedRewards = deriveRewards(rewardList)
    const notesValue = mode === 'duplicate' ? '' : campaign.notes ?? ''

    form.reset({
      general: baseGeneral,
      eligibility: derivedEligibility,
      requirements: derivedRequirements,
      rewards: derivedRewards,
      notes: notesValue
    })

    setSlugDirty(mode === 'edit')
    setEligibility(derivedEligibility)
    setRequirements(derivedRequirements)
    setRewards(derivedRewards)
    setRewardDraft({ ...INITIAL_REWARD_DRAFT })
    setNotes(notesValue)
    setStep(0)
    setError(null)
    setAppliedKey(detailKey)
  }, [initialData, detailKey, appliedKey, mode, form])

  const setGeneralFieldValue = <K extends keyof GeneralState>(field: K, value: GeneralState[K]) => {
    form.setValue(`general.${field}` as FieldPath<CampaignWizardFormValues>, value, { shouldDirty: true })
  }

  const handleGeneralChange = <K extends keyof GeneralState>(field: K, value: GeneralState[K]) => {
    setGeneralFieldValue(field, value)
  }

  const handleNameChange = (value: string) => {
    setGeneralFieldValue('name', value)
    if (!slugDirty) {
      form.setValue('general.slug', slugify(value), { shouldDirty: true })
    }
  }

  const handleSlugChange = (value: string) => {
    setSlugDirty(true)
    const sanitized = value.replace(/\s+/g, '-')
    form.setValue('general.slug', sanitized, { shouldDirty: true })
  }

  const toggleCampaignSegment = (segmentId: string) => {
    const currentIds = form.getValues('general.segmentIds') ?? []
    const exists = currentIds.includes(segmentId)
    const nextIds = exists
      ? currentIds.filter(id => id !== segmentId)
      : [...currentIds, segmentId]
    form.setValue('general.segmentIds', nextIds, { shouldDirty: true })
  }

  const addRequirement = (logicalGroup?: number) => {
    const availableDatasets = getDatasetDefinitionsByScope('goal')
    const defaultDataset = availableDatasets[0]
    const defaultField = defaultDataset?.fields[0]
    const valueType: RequirementValueType = defaultField ? fieldTypeToRequirementValueType(defaultField.type) : 'number'
    const defaultOperator = getOperatorOptions()[0]?.value ?? 'eq'
    const defaultValueConfig = applyDefaultMetricValue(valueType, defaultDataset?.key, defaultField?.value)
    
    // Si no se especifica grupo, determinar automáticamente
    let targetGroup = logicalGroup
    if (targetGroup === undefined) {
      // Obtener el grupo más alto existente
      const maxGroup = requirements.reduce((max, req) => Math.max(max, req.logicalGroup ?? 1), 0)
      targetGroup = maxGroup > 0 ? maxGroup : 1
    }
    
    const item: RequirementMetricItem = {
      key: generateRandomKey(),
      kind: 'metric',
      scope: 'goal',
      dataset: defaultDataset?.key ?? 'polizas',
      field: defaultField?.value ?? 'polizas_vigentes',
      operator: defaultOperator,
      value: defaultValueConfig.value,
      valueType,
      valueMode: defaultValueConfig.mode,
      description: '',
      logicalGroup: targetGroup,
      logicalOperator: 'AND',
      datasetParams: {}
    }
    setRequirements(prev => [...prev, item])
  }

  const addRequirementWithAND = () => {
    // Añadir al grupo actual (el más alto)
    const maxGroup = requirements.reduce((max, req) => Math.max(max, req.logicalGroup ?? 1), 1)
    addRequirement(maxGroup)
  }

  const addRequirementWithOR = () => {
    // Añadir a un nuevo grupo
    const maxGroup = requirements.reduce((max, req) => Math.max(max, req.logicalGroup ?? 1), 0)
    addRequirement(maxGroup + 1)
  }

  const updateRequirement = (key: string, updater: (item: RequirementItem) => RequirementItem) => {
    setRequirements(prev => prev.map(item => (item.key === key ? updater(item) : item)))
  }

  const updateMetricRequirement = (key: string, updater: (item: RequirementMetricItem) => RequirementMetricItem) => {
    updateRequirement(key, item => (isMetricRequirement(item) ? updater(item) : item))
  }

  const handleRequirementScopeChange = (key: string, scope: CampaignRuleScope) => {
    setRequirements(prev =>
      prev.map(item => {
        if (item.key !== key) return item
        if (isMetricRequirement(item)) {
          const allowedDatasets = getDatasetDefinitionsByScope(scope)
          let nextDataset = item.dataset
          if (!allowedDatasets.some(def => def.key === nextDataset)) {
            nextDataset = allowedDatasets[0]?.key ?? nextDataset
          }

          const datasetDef = nextDataset ? getDatasetDefinition(nextDataset) : undefined
          const currentFieldDef = datasetDef ? getFieldDefinition(nextDataset, item.field) : undefined
          const fallbackField = datasetDef?.fields[0]

          let nextField = item.field
          let nextValueType: RequirementValueType = item.valueType
          let nextOperator = item.operator
          let nextValue = item.value
          let nextValueMode = item.valueMode

          if (!currentFieldDef && fallbackField) {
            nextField = fallbackField.value
            nextValueType = fieldTypeToRequirementValueType(fallbackField.type)
            nextOperator = getOperatorOptions()[0]?.value ?? nextOperator
            const defaultConfig = applyDefaultMetricValue(nextValueType, nextDataset, nextField)
            nextValue = defaultConfig.value
            nextValueMode = defaultConfig.mode
          } else if (currentFieldDef) {
            nextValueType = fieldTypeToRequirementValueType(currentFieldDef.type)
            if (!getOperatorOptions().some(option => option.value === nextOperator)) {
              nextOperator = getOperatorOptions()[0]?.value ?? nextOperator
            }
            nextValueMode = deriveMetricValueMode(nextValueType, nextValue, nextDataset, nextField)
          }

          return {
            key: item.key,
            kind: 'metric',
            scope,
            dataset: nextDataset,
            field: nextField,
            valueType: nextValueType,
            operator: nextOperator,
            value: nextValue,
            valueMode: nextValueMode,
            description: item.description,
            logicalGroup: item.logicalGroup ?? 1,
            logicalOperator: item.logicalOperator ?? 'AND',
            datasetParams: item.datasetParams ?? {}
          }
        }

        return item
      })
    )
  }

  const handleRequirementDatasetChange = (key: string, dataset: RequirementDatasetKey) => {
    const definition = getDatasetDefinition(dataset)
    const requirement = requirements.find(item => item.key === key)
    if (!definition || !requirement || !isMetricRequirement(requirement)) {
      const numericDefault = applyDefaultMetricValue('number')
      updateMetricRequirement(key, current => ({
        ...current,
        dataset,
        field: '',
        valueType: 'number',
        operator: 'gte',
        value: numericDefault.value,
        valueMode: numericDefault.mode
      }))
      return
    }

    if (!definition.scopes.includes(requirement.scope)) {
      return
    }

    const firstField = definition.fields[0]
    if (!firstField) {
      const numericDefault = applyDefaultMetricValue('number')
      updateMetricRequirement(key, current => ({
        ...current,
        dataset,
        field: '',
        valueType: 'number',
        operator: 'gte',
        value: numericDefault.value,
        valueMode: numericDefault.mode
      }))
      return
    }

    const operator = getOperatorOptions()[0]?.value ?? 'eq'
    const valueType = fieldTypeToRequirementValueType(firstField.type)
    const defaultConfig = applyDefaultMetricValue(valueType, dataset, firstField.value)
    updateMetricRequirement(key, current => ({
      ...current,
      dataset,
      field: firstField.value,
      valueType,
      operator,
      value: defaultConfig.value,
      valueMode: defaultConfig.mode,
      datasetParams: {}
    }))
  }

  const handleRequirementFieldChange = (key: string, dataset: RequirementDatasetKey, fieldValue: string) => {
    const fieldDef = getFieldDefinition(dataset, fieldValue)
    if (!fieldDef) {
      updateMetricRequirement(key, current => ({ ...current, field: fieldValue }))
      return
    }

    const requirement = requirements.find(item => item.key === key)
    const operatorOptionsForField = getOperatorOptions()
    const currentOperator = requirement && isMetricRequirement(requirement) ? requirement.operator : undefined
    const nextOperator = currentOperator && operatorOptionsForField.some(option => option.value === currentOperator)
      ? currentOperator
      : operatorOptionsForField[0]?.value ?? 'gte'
    const valueType = fieldTypeToRequirementValueType(fieldDef.type)
    const defaultConfig = applyDefaultMetricValue(valueType, dataset, fieldDef.value)

    updateMetricRequirement(key, current => ({
      ...current,
      field: fieldDef.value,
      value: defaultConfig.value,
      valueType,
      operator: nextOperator,
      valueMode: defaultConfig.mode
    }))
  }


  const removeRequirement = (key: string) => {
    setRequirements(prev => prev.filter(item => item.key !== key))
  }

  const addReward = () => {
    if (!rewardDraft.title.trim()) {
      setError('Agrega un título para la recompensa antes de guardarla')
      return
    }
    setError(null)
    setRewards(prev => [
      ...prev,
      {
        key: generateRandomKey(),
        title: rewardDraft.title.trim(),
        description: rewardDraft.description.trim(),
        isAccumulative: rewardDraft.isAccumulative
      }
    ])
    setRewardDraft({ ...INITIAL_REWARD_DRAFT })
  }

  const removeReward = (key: string) => {
    setRewards(prev => prev.filter(item => item.key !== key))
  }

  const validateStep = (currentStep: number): string | null => {
    if (currentStep === 0) {
      if (!general.name.trim()) return 'El nombre de la campaña es obligatorio'
      if (!general.slug.trim()) return 'El slug no puede estar vacío'
      if (!/^[a-z0-9-]+$/.test(general.slug)) return 'El slug solo puede contener letras, números y guiones'
      if (!general.activeRangeStart || !general.activeRangeEnd) return 'Captura las fechas de vigencia'
      if (!isValidDateRange(general.activeRangeStart, general.activeRangeEnd)) return 'La fecha de inicio debe ser menor o igual a la fecha fin'
    }
    if (currentStep === 2) {
      for (const requirement of requirements) {
        if (!isMetricRequirement(requirement)) {
          continue
        }
        const datasetDef = getDatasetDefinition(requirement.dataset)
        if (!datasetDef) {
          return 'Selecciona un dataset válido para cada requisito'
        }
        const fieldDef = getFieldDefinition(requirement.dataset, requirement.field)
        if (!fieldDef) {
          return 'Selecciona un indicador válido para cada requisito'
        }
        const trimmedValue = requirement.value.trim()
        const allowEmptyText = fieldDef.type === 'text' && ['eq', 'neq', 'contains', 'not_contains'].includes(requirement.operator)
        if (!allowEmptyText && trimmedValue.length === 0) {
          return `Completa el valor esperado para "${fieldDef.label}"`
        }
        if (fieldDef.type === 'number') {
          const numeric = Number(trimmedValue)
          if (!Number.isFinite(numeric)) {
            return `Ingresa un número válido para "${fieldDef.label}"`
          }
        }
      }
    }
    return null
  }

  const goToStep = (nextStep: number) => {
    setStep(Math.min(Math.max(nextStep, 0), TOTAL_STEPS - 1))
  }

  const handleNext = () => {
    const validation = validateStep(step)
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    goToStep(step + 1)
  }

  const handlePrevious = () => {
    if (saving) return
    setError(null)
    goToStep(step - 1)
  }

  const buildSegmentsPayload = (): CampaignSegmentInput[] => {
    const uniqueIds = unique(general.segmentIds.filter(id => typeof id === 'string' && id.length > 0))
    return uniqueIds.map((segmentId, index) => ({ segment_id: segmentId, sort_order: index }))
  }

  const buildRulesPayload = (): CampaignRuleInput[] => {
    const rules: CampaignRuleInput[] = []
    const required = unique(eligibility.requiredSegments)
    const excluded = unique(eligibility.excludedSegments)

    if (required.length > 0 || excluded.length > 0) {
      const config: Record<string, unknown> = { matchBy: 'id' }
      if (required.length > 0) {
        if (eligibility.match === 'all') {
          config.all = required
        } else {
          config.any = required
        }
      }
      if (excluded.length > 0) {
        config.exclude = excluded
      }
      rules.push({
        scope: 'eligibility',
        rule_kind: 'SEGMENT',
        config
      })
    }

    requirements.forEach(item => {
      if (!isMetricRequirement(item)) {
        return
      }

      const datasetDef = getDatasetDefinition(item.dataset)
      const fieldDef = datasetDef ? getFieldDefinition(datasetDef.key, item.field) : undefined
      if (!datasetDef || !fieldDef) return

      const operatorOptions = getOperatorOptions()
      const operator = operatorOptions.some(option => option.value === item.operator)
        ? item.operator
        : operatorOptions[0]?.value ?? 'gte'

      const trimmedValue = item.value.trim()
      const allowEmptyTextValue = fieldDef.type === 'text' && ['eq', 'neq', 'contains', 'not_contains'].includes(operator)
      if (!allowEmptyTextValue && trimmedValue.length === 0) {
        return
      }

      const numericValue = fieldDef.type === 'number' ? Number(trimmedValue) : null
      if (fieldDef.type === 'number' && !Number.isFinite(numericValue)) {
        return
      }

      const config: Record<string, unknown> = {
        dataset: datasetDef.key,
        field: fieldDef.value,
        path: fieldDef.path,
        operator,
        valueType: fieldDef.type,
        value: fieldDef.type === 'number' ? numericValue : trimmedValue,
        valueRaw: trimmedValue,
        ...item.datasetParams
      }

      const descriptionValue = item.description.trim()

      rules.push({
        scope: item.scope,
        rule_kind: 'METRIC_CONDITION',
        config,
        description: descriptionValue || undefined,
        logical_group: item.logicalGroup ?? 1,
        logical_operator: item.logicalOperator ?? 'AND'
      })
    })

    return rules.map((rule, index) => ({ ...rule, priority: index + 1 }))
  }

  const buildRewardsPayload = (): CampaignRewardInput[] => {
    return rewards.map((reward, index) => ({
      title: reward.title,
      description: reward.description ? reward.description : null,
      is_accumulative: reward.isAccumulative,
      sort_order: index + 1
    }))
  }

  const handleFinish = async () => {
    const validation = validateStep(step)
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const summaryValue = general.summary.trim()
      const descriptionValue = general.description.trim()
      const notesValue = notes.trim()
      const primarySegmentId = general.segmentIds.find(id => id && id.length > 0) ?? ''

      if (mode === 'edit') {
        if (!initialData) {
          throw new Error('No se encontró la campaña a editar')
        }
        const updateResult = await updateAdminCampaign(initialData.campaign.id, {
          slug: general.slug.trim(),
          name: general.name.trim(),
          summary: summaryValue || null,
          description: descriptionValue || null,
          status: general.status,
          activeRangeStart: general.activeRangeStart,
          activeRangeEnd: general.activeRangeEnd,
          primary_segment_id: primarySegmentId || null,
          notes: notesValue || null,
          segments: buildSegmentsPayload(),
          rules: buildRulesPayload(),
          rewards: buildRewardsPayload()
        })
        onNotify('Campaña actualizada correctamente', 'success')
        onUpdated?.(updateResult.campaign)
        onClose()
        return
      }

      const createPayload = {
        slug: general.slug.trim(),
        name: general.name.trim(),
        summary: summaryValue || undefined,
        description: descriptionValue || undefined,
        status: general.status,
        activeRangeStart: general.activeRangeStart,
        activeRangeEnd: general.activeRangeEnd,
        primary_segment_id: primarySegmentId || undefined,
        notes: notesValue || undefined
      }

      const created = await createAdminCampaign(createPayload)

      const segmentsPayload = buildSegmentsPayload()
      const rulesPayload = buildRulesPayload()
      const rewardsPayload = buildRewardsPayload()

      let finalCampaign = created

      if (segmentsPayload.length > 0 || rulesPayload.length > 0 || rewardsPayload.length > 0) {
        const updateResult = await updateAdminCampaign(created.id, {
          segments: segmentsPayload,
          rules: rulesPayload,
          rewards: rewardsPayload
        })
        finalCampaign = updateResult.campaign
      }

      onNotify(mode === 'duplicate' ? 'Campaña duplicada correctamente' : 'Campaña creada correctamente', 'success')
      onCreated?.(finalCampaign)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar la campaña'
      setError(message)
      onNotify(message, 'danger')
    } finally {
      setSaving(false)
    }
  }

  const renderGeneralStep = () => (
    <div className="d-flex flex-column gap-3">
      <div className="row g-3">
        <div className="col-12 col-md-6">
          <label className="form-label">Nombre</label>
          <input
            className="form-control"
            value={general.name}
            onChange={event => handleNameChange(event.target.value)}
            placeholder="Campaña trimestral"
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label">Slug</label>
          <input
            className="form-control"
            value={general.slug}
            onChange={event => handleSlugChange(event.target.value)}
            placeholder="campana-trimestral"
          />
          <div className="form-text">Se utilizará en rutas internas y referencias.</div>
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label">Estado inicial</label>
          <select
            className="form-select"
            value={general.status}
            onChange={event => handleGeneralChange('status', event.target.value as CampaignStatus)}
          >
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label">Vigencia · inicio</label>
          <input
            className="form-control"
            type="date"
            value={general.activeRangeStart}
            onChange={event => handleGeneralChange('activeRangeStart', event.target.value)}
          />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label">Vigencia · fin</label>
          <input
            className="form-control"
            type="date"
            value={general.activeRangeEnd}
            onChange={event => handleGeneralChange('activeRangeEnd', event.target.value)}
          />
        </div>
        <div className="col-12">
          <label className="form-label">Segmentos de la campaña</label>
          <div className="d-flex flex-wrap gap-3">
            {sortedSegments.map(segment => {
              const inputId = `segment-campaign-${segment.id}`
              return (
                <div key={segment.id} className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={inputId}
                    checked={selectedCampaignSegments.has(segment.id)}
                    onChange={() => toggleCampaignSegment(segment.id)}
                  />
                  <label className="form-check-label" htmlFor={inputId}>
                    {segment.name}
                  </label>
                </div>
              )
            })}
            {sortedSegments.length === 0 && <div className="text-muted small">Sin segmentos disponibles.</div>}
          </div>
          <div className="form-text">El primer segmento seleccionado se usará como segmento principal al guardar.</div>
        </div>
        <div className="col-12">
          <label className="form-label">Resumen</label>
          <textarea
            className="form-control"
            value={general.summary}
            onChange={event => handleGeneralChange('summary', event.target.value)}
            rows={2}
          />
        </div>
        <div className="col-12">
          <label className="form-label">Descripción</label>
          <textarea
            className="form-control"
            value={general.description}
            onChange={event => handleGeneralChange('description', event.target.value)}
            rows={3}
          />
        </div>
      </div>
    </div>
  )

  const renderEligibilityStep = () => (
    <div className="d-flex flex-column gap-4">
      <div className="alert alert-info">
        <i className="bi bi-info-circle me-2"></i>
        <strong>Segmentos de campaña:</strong> Los segmentos ya fueron configurados en el Paso 1 (Datos Generales) 
        y aplican a toda la campaña.
      </div>
      <div className="text-muted small">
        En este paso puedes agregar <strong>requisitos de elegibilidad</strong> adicionales en el siguiente paso 
        (por ejemplo: antigüedad mínima, pólizas vigentes, etc.).
      </div>
    </div>
  )

  const renderRequirementsStep = () => {
    // Agrupar requisitos por logical_group
    const groupedRequirements = requirements.reduce((acc, req) => {
      const group = req.logicalGroup ?? 1
      if (!acc[group]) acc[group] = []
      acc[group].push(req)
      return acc
    }, {} as Record<number, typeof requirements>)
    
    const sortedGroupKeys = Object.keys(groupedRequirements).sort((a, b) => Number(a) - Number(b))

    return (
    <div className="d-flex flex-column gap-4">
      {requirements.length === 0 && (
        <div className="text-muted small">Sin requisitos configurados. Agrega reglas para medir progreso o elegibilidad.</div>
      )}
      {requirements.length > 0 && (
        <div className="alert alert-info small mb-0">
          <i className="bi bi-info-circle me-2"></i>
          <strong>Grupos lógicos:</strong> Las reglas en el mismo grupo se evalúan con <strong>AND</strong> (todas deben cumplirse). 
          Los grupos diferentes se evalúan con <strong>OR</strong> (al menos un grupo debe cumplirse).
        </div>
      )}
      
      {/* Renderizar grupos con recuadros */}
      <div className="d-flex flex-column gap-3">
        {sortedGroupKeys.map((groupKey, groupIndex) => {
          const groupRequirements = groupedRequirements[Number(groupKey)]
          const isLastGroup = groupIndex === sortedGroupKeys.length - 1
          
          return (
            <div key={`group-${groupKey}`}>
              {/* Recuadro del grupo */}
              <div className="border-2 border-primary rounded p-3" style={{ backgroundColor: '#f8f9fa', borderStyle: 'solid' }}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="mb-0 text-primary">
                    <i className="bi bi-collection me-2"></i>
                    Todas estas condiciones deben cumplirse
                  </h6>
                </div>
                
                <div className="d-flex flex-column gap-3">
                  {groupRequirements.map((requirement, reqIndex) => {
                    const showAndSeparator = reqIndex > 0
                    const datasetDef = getDatasetDefinition(requirement.dataset)
                    const fieldDef = datasetDef ? getFieldDefinition(datasetDef.key, requirement.field) : undefined
                    const selectedFieldValue = fieldDef ? requirement.field : datasetDef?.fields[0]?.value ?? ''
                    const operatorOptions = getOperatorOptions()
                    const availableDatasets = getDatasetDefinitionsByScope(requirement.scope)
                    const datasetSummary = datasetDef && fieldDef ? `${datasetDef.label} · ${fieldDef.label}` : 'Selecciona el indicador'
                    const valuePlaceholder = requirement.valueType === 'number' ? 'Ej. 5' : 'Texto libre'
                    const isProductIdsField = requirement.dataset === 'polizas_por_producto' && requirement.field === 'producto_ids'
                    const presetOptions = isProductIdsField ? productParameters.map(p => p.id) : getMetricValuePresets(requirement.valueType, requirement.dataset, requirement.field)
                    const showPresetSelect = presetOptions.length > 0
                    const isPresetSelected = isPresetMetricValue(requirement.valueType, requirement.value, requirement.dataset, requirement.field) && requirement.valueMode === 'preset'

                    return (
                      <div key={requirement.key}>
                        {showAndSeparator && (
                          <div className="text-center py-1">
                            <span className="badge bg-secondary">AND</span>
                          </div>
                        )}
                        <div className="border rounded p-3 bg-white shadow-sm">
                          <div className="d-flex justify-content-between align-items-start mb-3">
                            <div className="d-flex flex-column gap-1">
                              <div className="d-flex flex-wrap align-items-center gap-2">
                                <span className="badge text-bg-primary">{resolveRequirementKindLabel('metric')}</span>
                                <span className="badge text-bg-secondary">{resolveScopeLabel(requirement.scope)}</span>
                                <span className="text-muted small">{datasetSummary}</span>
                              </div>
                            </div>
                            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => removeRequirement(requirement.key)}>
                              <i className="bi bi-trash"></i>
                            </button>
                          </div>
              <div className="row g-5 align-items-end">
                <div className="col-12 col-md-6 col-lg-2">
                  <label className="form-label">Aplica a</label>
                  <select
                    className="form-select form-select-sm"
                    value={requirement.scope}
                    onChange={event => handleRequirementScopeChange(requirement.key, event.target.value as CampaignRuleScope)}
                  >
                    {REQUIREMENT_SCOPE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-6 col-lg-3">
                  <label className="form-label">Origen de datos</label>
                  <select
                    className="form-select form-select-sm"
                    value={requirement.dataset}
                    disabled={availableDatasets.length === 0}
                    onChange={event => {
                      const datasetValue = event.target.value
                      if (isDatasetKey(datasetValue)) {
                        handleRequirementDatasetChange(requirement.key, datasetValue)
                      }
                    }}
                  >
                    {availableDatasets.map(option => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-6 col-lg-2">
                  <label className="form-label">Indicador</label>
                  <select
                    className="form-select form-select-sm"
                    value={selectedFieldValue}
                    onChange={event => handleRequirementFieldChange(requirement.key, requirement.dataset, event.target.value)}
                  >
                    {datasetDef?.fields.map(field => (
                      <option key={field.value} value={field.value}>{field.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-6 col-lg-2">
                  <label className="form-label">Operador</label>
                  <select
                    className="form-select form-select-sm"
                    value={requirement.operator}
                    onChange={event => {
                      const opValue = event.target.value
                      if (isRequirementOperator(opValue)) {
                        updateMetricRequirement(requirement.key, current => ({ ...current, operator: opValue }))
                      }
                    }}
                  >
                    {operatorOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-6 col-lg-3">
                  <label className="form-label">Valor{requirement.operator === 'in' ? 'es' : ''}</label>
                  {requirement.operator === 'in' && showPresetSelect ? (
                    <select
                      className="form-select form-select-sm"
                      multiple
                      size={Math.min(presetOptions.length, 5)}
                      value={requirement.value ? requirement.value.split(',') : []}
                      onChange={event => {
                        const selectedOptions = Array.from(event.target.selectedOptions, option => option.value)
                        updateMetricRequirement(requirement.key, current => ({
                          ...current,
                          value: selectedOptions.join(','),
                          valueMode: 'preset'
                        }))
                      }}
                    >
                      {presetOptions.map(optionValue => {
                        if (isProductIdsField) {
                          const product = productParameters.find(p => p.id === optionValue)
                          return (
                            <option key={optionValue} value={optionValue}>
                              {product?.display_name || optionValue}
                            </option>
                          )
                        }
                        return (
                          <option key={optionValue} value={optionValue}>{optionValue}</option>
                        )
                      })}
                    </select>
                  ) : showPresetSelect && requirement.operator !== 'in' ? (
                    <select
                      className="form-select form-select-sm mb-2"
                      value={isPresetSelected ? requirement.value : CUSTOM_SELECT_VALUE}
                      onChange={event => {
                        const selected = event.target.value
                        if (selected === CUSTOM_SELECT_VALUE) {
                          updateMetricRequirement(requirement.key, current => ({
                            ...current,
                            valueMode: 'custom',
                            value: current.valueMode === 'custom' ? current.value : ''
                          }))
                        } else {
                          updateMetricRequirement(requirement.key, current => ({
                            ...current,
                            value: selected,
                            valueMode: 'preset'
                          }))
                        }
                      }}
                    >
                      {presetOptions.map(optionValue => {
                        if (isProductIdsField) {
                          const product = productParameters.find(p => p.id === optionValue)
                          return (
                            <option key={optionValue} value={optionValue}>
                              {product?.display_name || optionValue}
                            </option>
                          )
                        }
                        return (
                          <option key={optionValue} value={optionValue}>{optionValue}</option>
                        )
                      })}
                      <option value={CUSTOM_SELECT_VALUE}>Otro valor…</option>
                    </select>
                  ) : null}
                  {requirement.operator === 'in' && !showPresetSelect && (
                    <input
                      className="form-control form-control-sm"
                      type="text"
                      value={requirement.value}
                      onChange={event => updateMetricRequirement(requirement.key, current => ({
                        ...current,
                        value: event.target.value,
                        valueMode: 'custom'
                      }))}
                      placeholder="Valores separados por comas"
                    />
                  )}
                  {requirement.operator !== 'in' && (!showPresetSelect || requirement.valueMode === 'custom' || !isPresetSelected) && (
                    <input
                      className="form-control form-control-sm"
                      type={requirement.valueType === 'number' ? 'number' : 'text'}
                      value={requirement.value}
                      onChange={event => updateMetricRequirement(requirement.key, current => ({
                        ...current,
                        value: event.target.value,
                        valueMode: 'custom'
                      }))}
                      placeholder={valuePlaceholder}
                    />
                  )}
                  {requirement.operator === 'in' && (
                    <small className="text-muted d-block mt-1">
                      {showPresetSelect ? 'Mantén Ctrl/Cmd para seleccionar múltiples' : 'Separa valores con comas'}
                    </small>
                  )}
                </div>
                
                {/* Dataset Additional Parameters */}
                {datasetDef && datasetDef.fields.filter(f => f.value !== requirement.field).map(paramField => (
                  <div key={paramField.value} className="col-12 col-md-6 col-lg-3">
                    <label className="form-label">{paramField.label}</label>
                    {paramField.type === 'boolean' ? (
                      <select
                        className="form-select form-select-sm"
                        value={requirement.datasetParams?.[paramField.value] === true ? 'true' : requirement.datasetParams?.[paramField.value] === false ? 'false' : ''}
                        onChange={event => {
                          const newValue = event.target.value === 'true' ? true : event.target.value === 'false' ? false : ''
                          updateMetricRequirement(requirement.key, current => ({
                            ...current,
                            datasetParams: {
                              ...current.datasetParams,
                              [paramField.value]: newValue
                            }
                          }))
                        }}
                      >
                        <option value="">Seleccionar...</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    ) : (
                      <input
                        className="form-control form-control-sm"
                        type={paramField.type === 'number' ? 'number' : 'text'}
                        value={((): string | number => {
                          const val = requirement.datasetParams?.[paramField.value]
                          if (val === undefined || val === null) return ''
                          return typeof val === 'boolean' ? '' : val
                        })()}
                        onChange={event => {
                          const newValue = paramField.type === 'number' 
                            ? (event.target.value ? Number(event.target.value) : '')
                            : event.target.value
                          updateMetricRequirement(requirement.key, current => ({
                            ...current,
                            datasetParams: {
                              ...current.datasetParams,
                              [paramField.value]: newValue
                            }
                          }))
                        }}
                        placeholder={paramField.type === 'number' ? 'Número' : 'Texto'}
                      />
                    )}
                  </div>
                ))}
                
                <div className="col-12">
                  <label className="form-label">Descripción</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={3}
                    value={requirement.description}
                    onChange={event => updateRequirement(requirement.key, current => ({ ...current, description: event.target.value }))}
                    placeholder="Visible en reportes y tableros"
                  />
                </div>
              </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* Separador OR entre grupos */}
              {!isLastGroup && (
                <div className="text-center py-3">
                  <span className="badge bg-warning text-dark fs-5 px-3 py-2">OR</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={addRequirementWithAND}>
          <i className="bi bi-plus-circle me-1"></i>
          AND (añadir al grupo actual)
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={addRequirementWithOR}>
          <i className="bi bi-plus-circle me-1"></i>
          OR (nuevo grupo)
        </button>
      </div>
    </div>
    )
  }

  const renderRewardsStep = () => (
    <div className="d-flex flex-column gap-4">
      <div>
        <h6 className="mb-2">Listado de recompensas</h6>
        {rewards.length === 0 ? (
          <div className="text-muted small">Sin recompensas agregadas.</div>
        ) : (
          <ul className="list-group">
            {rewards.map((reward, index) => (
              <li key={reward.key} className="list-group-item d-flex justify-content-between align-items-start gap-3">
                <div>
                  <div className="fw-semibold">{index + 1}. {reward.title}</div>
                  {reward.description && <div className="text-muted small">{reward.description}</div>}
                  {reward.isAccumulative && <span className="badge bg-info-subtle text-info">Acumulativa</span>}
                </div>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => removeReward(reward.key)}
                >
                  <i className="bi bi-trash"></i>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border rounded p-3 bg-light">
        <h6 className="mb-3">Agregar recompensa</h6>
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label">Título</label>
            <input
              className="form-control"
              value={rewardDraft.title}
              onChange={event => setRewardDraft(prev => ({ ...prev, title: event.target.value }))}
              placeholder="Bonificación adicional"
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label">¿Es acumulativa?</label>
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="reward-accumulative"
                checked={rewardDraft.isAccumulative}
                onChange={event => setRewardDraft(prev => ({ ...prev, isAccumulative: event.target.checked }))}
              />
              <label className="form-check-label" htmlFor="reward-accumulative">Aplicable a múltiples logros</label>
            </div>
          </div>
          <div className="col-12">
            <label className="form-label">Descripción</label>
            <textarea
              className="form-control"
              rows={2}
              value={rewardDraft.description}
              onChange={event => setRewardDraft(prev => ({ ...prev, description: event.target.value }))}
            />
          </div>
        </div>
        <div className="mt-3 d-flex justify-content-end">
          <button type="button" className="btn btn-primary btn-sm" onClick={addReward}>
            Añadir recompensa
          </button>
        </div>
      </div>
    </div>
  )

  const renderNotesStep = () => (
    <div className="d-flex flex-column gap-3">
      <label className="form-label">Notas internas</label>
      <textarea
        className="form-control"
        rows={6}
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder="Detalles administrativos, recordatorios o contexto adicional."
      />
      <div className="form-text">Las notas son visibles solo para el equipo administrador.</div>
    </div>
  )

  const renderSummaryStep = () => {
    const numberFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })
    const segmentsPayload = buildSegmentsPayload()
    const rewardsPayload = buildRewardsPayload()
    const requiredNames = eligibility.requiredSegments
      .map(segmentId => sortedSegments.find(segment => segment.id === segmentId)?.name ?? segmentId)
    const excludedNames = eligibility.excludedSegments
      .map(segmentId => sortedSegments.find(segment => segment.id === segmentId)?.name ?? segmentId)
    const requirementSummaries = requirements
      .filter(isMetricRequirement)
      .map(requirement => {
        const scopeLabel = requirement.scope === 'goal' ? 'Meta' : 'Elegibilidad'
        const datasetDef = getDatasetDefinition(requirement.dataset)
        const fieldDef = datasetDef ? getFieldDefinition(datasetDef.key, requirement.field) : undefined
        const operatorLabel = OPERATOR_LABEL_MAP[requirement.operator] ?? requirement.operator
        let valueDisplay = requirement.value.trim()
        if (requirement.valueType === 'number') {
          const numeric = Number(requirement.value)
          if (Number.isFinite(numeric)) {
            valueDisplay = numberFormatter.format(numeric)
          }
        }
        const datasetLabel = datasetDef?.label ?? requirement.dataset
        const fieldLabel = fieldDef?.label ?? requirement.field
        const pieces = [`${scopeLabel}: ${datasetLabel} · ${fieldLabel}`, `${operatorLabel} ${valueDisplay}`]
        if (requirement.description.trim()) {
          pieces.push(requirement.description.trim())
        }
        return pieces.join(' — ')
      })

    return (
      <div className="d-flex flex-column gap-3">
        <div className="border rounded p-3">
          <h6 className="mb-2">Información general</h6>
          <dl className="row mb-0">
            <dt className="col-sm-4">Nombre</dt>
            <dd className="col-sm-8">{general.name || '—'}</dd>
            <dt className="col-sm-4">Slug</dt>
            <dd className="col-sm-8">{general.slug || '—'}</dd>
            <dt className="col-sm-4">Estado</dt>
            <dd className="col-sm-8">{STATUS_OPTIONS.find(option => option.value === general.status)?.label ?? general.status}</dd>
            <dt className="col-sm-4">Vigencia</dt>
            <dd className="col-sm-8">{general.activeRangeStart} → {general.activeRangeEnd}</dd>
          </dl>
        </div>
        <div className="border rounded p-3">
          <h6 className="mb-2">Segmentos</h6>
          {segmentsPayload.length === 0 ? (
            <div className="text-muted small">Sin segmentos asociados.</div>
          ) : (
            <ul className="mb-0">
              {segmentsPayload.map(entry => {
                const segment = sortedSegments.find(item => item.id === entry.segment_id)
                return <li key={entry.segment_id}>{segment?.name ?? entry.segment_id}</li>
              })}
            </ul>
          )}
        </div>
        <div className="border rounded p-3">
          <h6 className="mb-2">Elegibilidad</h6>
          {requiredNames.length === 0 && excludedNames.length === 0 ? (
            <div className="text-muted small">Cualquier participante puede optar. No se configuraron segmentos obligatorios ni excluidos.</div>
          ) : (
            <ul className="mb-0">
              {requiredNames.length > 0 && (
                <li>
                  Debe pertenecer a {eligibility.match === 'all' ? 'todos' : 'al menos uno'} de: {requiredNames.join(', ')}
                </li>
              )}
              {excludedNames.length > 0 && (
                <li>Excluye a: {excludedNames.join(', ')}</li>
              )}
            </ul>
          )}
        </div>
        <div className="border rounded p-3">
          <h6 className="mb-2">Requisitos configurados</h6>
          {requirementSummaries.length === 0 ? (
            <div className="text-muted small">Sin cálculos adicionales. Agrega requisitos en el paso anterior si necesitas indicadores específicos.</div>
          ) : (
            <ul className="mb-0">
              {requirementSummaries.map((summary, index) => (
                <li key={`requirement-${index}`}>{summary}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="border rounded p-3">
          <h6 className="mb-2">Recompensas</h6>
          {rewardsPayload.length === 0 ? (
            <div className="text-muted small">Sin recompensas cargadas.</div>
          ) : (
            <ul className="mb-0">
              {rewardsPayload.map((reward, index) => (
                <li key={`${reward.title}-${index}`}>
                  {reward.title} {reward.is_accumulative ? <span className="badge bg-info-subtle text-info">Acumulativa</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border rounded p-3">
          <h6 className="mb-2">Notas</h6>
          <div className="small mb-0">{notes.trim() || <span className="text-muted">Sin notas registradas.</span>}</div>
        </div>
      </div>
    )
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return renderGeneralStep()
      case 1:
        return renderEligibilityStep()
      case 2:
        return renderRequirementsStep()
      case 3:
        return renderRewardsStep()
      case 4:
        return renderNotesStep()
      case 5:
        return renderSummaryStep()
      default:
        return null
    }
  }

  const isEditMode = mode === 'edit'
  const isDuplicateMode = mode === 'duplicate'
  const modalTitle = isEditMode ? 'Editar campaña' : isDuplicateMode ? 'Duplicar campaña' : 'Nueva campaña'

  const getSubmitLabel = () => {
    if (saving) {
      return isEditMode ? 'Guardando…' : isDuplicateMode ? 'Duplicando…' : 'Guardando…'
    }
    if (isEditMode) return 'Guardar cambios'
    if (isDuplicateMode) return 'Duplicar campaña'
    return 'Crear campaña'
  }

  const footer = (
    <div className="d-flex justify-content-between align-items-center w-100">
      <button type="button" className="btn btn-link text-decoration-none" onClick={onClose} disabled={saving}>
        Cancelar
      </button>
      <div className="d-flex gap-2">
        {step > 0 && (
          <button type="button" className="btn btn-outline-secondary" onClick={handlePrevious} disabled={saving}>
            Anterior
          </button>
        )}
        {step < TOTAL_STEPS - 1 && (
          <button type="button" className="btn btn-primary" onClick={handleNext} disabled={saving}>
            Siguiente
          </button>
        )}
        {step === TOTAL_STEPS - 1 && (
          <button type="button" className="btn btn-success" onClick={handleFinish} disabled={saving}>
            {getSubmitLabel()}
          </button>
        )}
      </div>
    </div>
  )

  const showCustomDatasetHelp = CUSTOM_METRIC_DATASET_DEFINITIONS.length > 0

  const wizardContent = (
    <div className="d-flex flex-column gap-3" style={{ maxHeight: MODAL_CONTENT_MAX_HEIGHT, overflowY: 'auto' }}>
      <div className="d-flex justify-content-between align-items-center">
        <span className="small text-muted text-uppercase">Paso {step + 1} de {TOTAL_STEPS}</span>
        <span className="fw-semibold">{STEP_LABELS[step]}</span>
      </div>
      {error && (
        <div className="alert alert-danger py-2 px-3 mb-0" role="alert">
          {error}
        </div>
      )}
      <div className="border rounded p-3 bg-white">
        {renderStep()}
      </div>
    </div>
  )

  return (
    <AppModal
      title={modalTitle}
      icon="flag-fill"
      onClose={onClose}
      footer={footer}
      disableClose={saving}
      width={1800}
    >
      {showCustomDatasetHelp ? (
        <div className="row g-3">
          <div className="col-12 col-lg-8">
            {wizardContent}
          </div>
          <div className="col-12 col-lg-4">
            <aside
              className="border rounded p-3 bg-light"
              style={{ maxHeight: MODAL_CONTENT_MAX_HEIGHT, overflowY: 'auto' }}
            >
              <h6 className="text-uppercase small text-muted mb-3">
                <i className="bi bi-list-check me-2"></i>
                Requisitos elegidos
              </h6>
              
              {requirements.length === 0 ? (
                <div className="text-muted small text-center py-4">
                  <i className="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
                  No hay requisitos configurados
                </div>
              ) : (
                <div className="d-flex flex-column gap-3">
                  {requirements.map((requirement, index) => {
                    const datasetDef = getDatasetDefinition(requirement.dataset)
                    const fieldDef = datasetDef ? getFieldDefinition(datasetDef.key, requirement.field) : undefined
                    const operatorLabel = getOperatorOptions().find(op => op.value === requirement.operator)?.label ?? requirement.operator
                    
                    return (
                      <div key={requirement.key} className="small border rounded p-2 bg-white">
                        <div className="d-flex align-items-start gap-2 mb-2">
                          <span className="badge text-bg-primary">{index + 1}</span>
                          <div className="flex-grow-1">
                            <div className="fw-semibold text-dark">
                              {fieldDef?.label ?? requirement.field}
                            </div>
                            <div className="text-muted small">
                              {datasetDef?.label ?? requirement.dataset}
                            </div>
                          </div>
                          <span className="badge text-bg-info">
                            Grupo {requirement.logicalGroup ?? 1}
                          </span>
                        </div>
                        
                        <div className="mt-2">
                          <div className="text-muted small">
                            <strong>Regla:</strong> {operatorLabel} <strong>
                              {(() => {
                                // Mostrar nombres de productos en lugar de IDs para el operador 'in'
                                if (requirement.operator === 'in' && 
                                    requirement.dataset === 'polizas_por_producto' && 
                                    requirement.field === 'producto_ids') {
                                  const values = requirement.value.split(',').map(v => v.trim()).filter(v => v)
                                  const productNames = values.map(v => {
                                    const product = productParameters.find(p => p.id === v)
                                    return product ? product.display_name : v
                                  })
                                  return productNames.join(', ')
                                }
                                return requirement.value
                              })()}
                            </strong>
                          </div>
                          <div className="text-muted small">
                            <strong>Aplica a:</strong> {requirement.scope === 'goal' ? 'Meta' : 'Elegibilidad'}
                          </div>
                        </div>
                        
                        <div className="mt-2 p-2 bg-light rounded">
                          <div className="text-muted small">
                            <i className="bi bi-info-circle me-1"></i>
                            {(() => {
                              // Si hay descripción personalizada, normalizarla
                              const customDescription = requirement.description?.trim()
                              if (customDescription) {
                                // Normalizar términos en la descripción personalizada
                                return customDescription
                                  .replace(/\b(Promotor|promotor|Asesor|asesor)\b/g, 'El usuario')
                                  .replace(/\bdebe tener\b/g, 'debe tener')
                                  .replace(/^El usuario debe tener/, 'El usuario debe tener')
                              }
                              
                              // Construir descripción automática basada en la configuración
                              if (fieldDef && datasetDef) {
                                const scopeText = requirement.scope === 'goal' ? 'Meta' : 'Elegibilidad'
                                const value = requirement.value?.trim()
                                const isEmpty = !value || value === ''
                                
                                // Generar texto de condición más natural
                                let conditionText = ''
                                
                                if (isEmpty) {
                                  // Valores vacíos - generar texto contextual
                                  switch (requirement.operator) {
                                    case 'neq':
                                      conditionText = 'debe estar registrado'
                                      break
                                    case 'eq':
                                      conditionText = 'debe estar vacío'
                                      break
                                    case 'contains':
                                      conditionText = 'debe contener algún valor'
                                      break
                                    case 'not_contains':
                                      conditionText = 'no debe contener ningún valor'
                                      break
                                    default:
                                      conditionText = `${operatorLabel.toLowerCase()} (vacío)`
                                  }
                                } else {
                                  // Valores no vacíos - generar texto apropiado según operador
                                  const numValue = Number(value)
                                  const isNumber = requirement.valueType === 'number' && !isNaN(numValue)
                                  const displayValue = isNumber ? new Intl.NumberFormat('es-MX').format(numValue) : value
                                  
                                  switch (requirement.operator) {
                                    case 'eq':
                                      conditionText = `debe ser igual a ${displayValue}`
                                      break
                                    case 'neq':
                                      conditionText = `debe ser diferente de ${displayValue}`
                                      break
                                    case 'gt':
                                      conditionText = `debe ser mayor que ${displayValue}`
                                      break
                                    case 'gte':
                                      conditionText = `debe ser mayor o igual a ${displayValue}`
                                      break
                                    case 'lt':
                                      conditionText = `debe ser menor que ${displayValue}`
                                      break
                                    case 'lte':
                                      conditionText = `debe ser menor o igual a ${displayValue}`
                                      break
                                    case 'contains':
                                      conditionText = `debe contener "${displayValue}"`
                                      break
                                    case 'not_contains':
                                      conditionText = `no debe contener "${displayValue}"`
                                      break
                                    case 'in':
                                      const values = value.split(',').map(v => v.trim()).filter(v => v)
                                      if (values.length === 0) {
                                        conditionText = 'debe ser uno de (sin valores especificados)'
                                      } else if (values.length === 1) {
                                        // Caso especial para producto_ids: mostrar nombre del producto
                                        if (requirement.dataset === 'polizas_por_producto' && requirement.field === 'producto_ids') {
                                          const product = productParameters.find(p => p.id === values[0])
                                          const singleValue = product ? product.display_name : values[0]
                                          conditionText = `debe ser ${singleValue}`
                                        } else {
                                          const singleValue = requirement.valueType === 'number' && !isNaN(Number(values[0])) 
                                            ? new Intl.NumberFormat('es-MX').format(Number(values[0]))
                                            : values[0]
                                          conditionText = `debe ser ${singleValue}`
                                        }
                                      } else {
                                        // Caso especial para producto_ids: mostrar nombres de productos
                                        if (requirement.dataset === 'polizas_por_producto' && requirement.field === 'producto_ids') {
                                          const productNames = values.map(v => {
                                            const product = productParameters.find(p => p.id === v)
                                            return product ? product.display_name : v
                                          })
                                          conditionText = `debe ser uno de: ${productNames.join(', ')}`
                                        } else {
                                          const formattedValues = values.map(v => {
                                            const num = Number(v)
                                            return requirement.valueType === 'number' && !isNaN(num)
                                              ? new Intl.NumberFormat('es-MX').format(num)
                                              : v
                                          })
                                          conditionText = `debe ser uno de: ${formattedValues.join(', ')}`
                                        }
                                      }
                                      break
                                    default:
                                      conditionText = `${operatorLabel.toLowerCase()} ${displayValue}`
                                  }
                                }
                                
                                return `${scopeText}: El usuario ${conditionText} para ${fieldDef.label} (${datasetDef.label})`
                              }
                              
                              return 'Configuración de requisito'
                            })()}
                          </div>
                        </div>
                        
                        {datasetDef?.description && (
                          <div className="mt-2 border-top pt-2">
                            <div className="text-muted small">
                              <strong>Definición:</strong> {datasetDef.description}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  <div className="mt-2 p-2 bg-info bg-opacity-10 rounded">
                    <div className="small text-muted">
                      <i className="bi bi-lightbulb me-1"></i>
                      <strong>Total:</strong> {requirements.length} requisito{requirements.length !== 1 ? 's' : ''} configurado{requirements.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </div>
      ) : (
        wizardContent
      )}
    </AppModal>
  )
}

export type { CampaignWizardInitialData, WizardMode }





























