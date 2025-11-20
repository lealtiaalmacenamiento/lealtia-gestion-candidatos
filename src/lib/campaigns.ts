import { createHash } from 'crypto'
import { ensureAdminClient } from '@/lib/supabaseAdmin'
import { normalizeRole } from '@/lib/roles'
import {
  getCampaignDatasetDefinition,
  getCampaignDatasetField
} from '@/lib/campaignDatasetRegistry'
import type { PostgrestError } from '@supabase/supabase-js'
import type { AppRole } from '@/lib/roles'
import type {
  Campaign,
  CampaignCreateInput,
  CampaignStatus,
  CampaignRule,
  CampaignEvaluationMetrics,
  CampaignEvaluationResult,
  CampaignProgressStatus,
  CampaignEvaluationContext,
  CampaignProgressSnapshot,
  CampaignProgressSummary,
  CampaignProgressCounts,
  CampaignReward,
  CampaignSegmentLink,
  CampaignRuleScope
} from '@/types'

const CAMPAIGN_FIELDS = 'id,slug,name,summary,description,status,active_range,primary_segment_id,notes,created_by,created_at,updated_at'

type FetchCampaignsOptions = {
  status?: CampaignStatus | CampaignStatus[]
  includeArchived?: boolean
}

type CreateCampaignPayload = CampaignCreateInput & {
  activeRangeStart?: string
  activeRangeEnd?: string
}

type CampaignProgressSummaryRow = {
  campaign_id: string | null
  total: number | null
  eligible_total: number | null
  completed_total: number | null
  status_counts: Record<string, unknown> | null
}

type CandidateMetricRow = {
  id_candidato?: number | string | null
  eliminado?: boolean | null
  mes_conexion?: string | null
  mes?: string | null
}

type PlanificacionMetricRow = {
  anio?: number | string | null
  semana_iso?: number | string | null
  prima_anual_promedio?: number | string | null
  porcentaje_comision?: number | string | null
  updated_at?: string | null
  created_at?: string | null
}

type ClienteMetricRow = {
  creado_at?: string | null
}

type CustomDatasetMetricRow = {
  dataset?: string | null
  metric?: string | null
  numeric_value?: number | string | null
  text_value?: string | null
  json_value?: unknown
  updated_at?: string | null
}

type SimpleArrayResult<T> = {
  data: T[] | null
  error: PostgrestError | null
}

export const CAMPAIGN_STATUS_VALUES: CampaignStatus[] = ['draft', 'active', 'paused', 'archived']
const CAMPAIGN_RULE_SCOPE_VALUES: CampaignRuleScope[] = ['eligibility', 'goal']

export function normalizeCampaignStatus(value?: string | null): CampaignStatus | undefined {
  if (!value) return undefined
  const lower = value.trim().toLowerCase()
  return CAMPAIGN_STATUS_VALUES.includes(lower as CampaignStatus) ? (lower as CampaignStatus) : undefined
}

export interface CampaignSegmentInput {
  segment_id: string
  sort_order?: number | string | null
  deleted?: boolean
}

export interface CampaignRuleInput {
  id?: string
  scope: CampaignRuleScope | string
  rule_kind: CampaignRule['rule_kind'] | string
  config?: Record<string, unknown> | null
  priority?: number | string | null
  description?: string | null
  logical_group?: number
  logical_operator?: 'AND' | 'OR'
  deleted?: boolean
}

export interface CampaignRewardInput {
  id?: string
  title: string
  description?: string | null
  is_accumulative?: boolean | null
  sort_order?: number | string | null
  deleted?: boolean
}

export interface UpdateCampaignPayload {
  slug?: string
  name?: string
  summary?: string | null
  description?: string | null
  status?: CampaignStatus
  active_range?: string | null
  activeRangeStart?: string | null
  activeRangeEnd?: string | null
  primary_segment_id?: string | null
  notes?: string | null
  segments?: CampaignSegmentInput[] | null
  rules?: CampaignRuleInput[] | null
  rewards?: CampaignRewardInput[] | null
}

type SupabaseAdminClient = ReturnType<typeof ensureAdminClient>

function buildDateRange(input: CreateCampaignPayload): string {
  if (input.active_range) return input.active_range
  const start = input.activeRangeStart
  const end = input.activeRangeEnd
  if (!start || !end) {
    throw new Error('Debes indicar active_range o las fechas de inicio y fin (activeRangeStart/activeRangeEnd)')
  }
  // Inclusive start, exclusive end by convención
  return `[${start},${end})`
}

export async function fetchCampaigns(options: FetchCampaignsOptions = {}): Promise<Campaign[]> {
  const supabase = ensureAdminClient()
  let query = supabase
    .from('campaigns')
    .select(CAMPAIGN_FIELDS)
    .order('created_at', { ascending: false })

  const { status, includeArchived } = options
  if (Array.isArray(status) && status.length > 0) {
    query = query.in('status', status)
  } else if (status) {
    query = query.eq('status', status)
  }

  if (!includeArchived) {
    query = query.neq('status', 'archived')
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`[campaigns] Error obteniendo campañas: ${error.message}`)
  }
  return (data ?? []) as Campaign[]
}

export async function fetchCampaignBySlug(slug: string): Promise<Campaign | null> {
  const cleaned = slug?.trim()
  if (!cleaned) return null
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_FIELDS)
    .eq('slug', cleaned)
    .maybeSingle()

  if (error && error.code && error.code !== 'PGRST116') {
    throw new Error(`[campaigns] Error consultando campaña por slug: ${error.message}`)
  }

  return (data as Campaign | null) ?? null
}

export async function createCampaign(payload: CreateCampaignPayload): Promise<Campaign> {
  if (!payload.slug || !payload.slug.trim()) {
    throw new Error('Slug es obligatorio')
  }
  if (!payload.name || !payload.name.trim()) {
    throw new Error('Nombre es obligatorio')
  }
  const activeRange = buildDateRange(payload)
  const supabase = ensureAdminClient()
  const insertPayload = {
    slug: payload.slug.trim(),
    name: payload.name.trim(),
    summary: payload.summary ?? null,
    description: payload.description ?? null,
    status: payload.status ?? 'draft',
    active_range: activeRange,
    primary_segment_id: payload.primary_segment_id ?? null,
    notes: payload.notes ?? null,
    created_by: payload.created_by ?? null
  }
  const { data, error } = await supabase
    .from('campaigns')
    .insert(insertPayload)
    .select(CAMPAIGN_FIELDS)
    .single()

  if (error || !data) {
    throw new Error(`[campaigns] Error creando campaña: ${error?.message ?? 'sin datos'}`)
  }
  return data as Campaign
}

export async function fetchCampaignById(id: string): Promise<Campaign | null> {
  const supabase = ensureAdminClient()
  return fetchCampaignByIdWithClient(supabase, id)
}

export async function updateCampaignWithRelations(
  campaignId: string,
  payload: UpdateCampaignPayload
): Promise<{
  campaign: Campaign
  segments: CampaignSegmentLink[]
  rules: CampaignRule[]
  rewards: CampaignReward[]
}> {
  const supabase = ensureAdminClient()
  const existing = await fetchCampaignByIdWithClient(supabase, campaignId)
  if (!existing) {
    throw new Error('Campaña no encontrada')
  }

  const updates = buildCampaignUpdates(payload, existing)
  let campaign = existing

  if (Object.keys(updates).length > 0) {
    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', campaignId)
      .select(CAMPAIGN_FIELDS)
      .single()

    if (error) {
      throw new Error(`[campaigns] Error actualizando campaña: ${error.message}`)
    }
    campaign = data as Campaign
  }

  const segments =
    payload.segments === null
      ? await replaceCampaignSegmentsInternal(supabase, campaignId, [])
      : payload.segments
        ? await replaceCampaignSegmentsInternal(supabase, campaignId, payload.segments)
        : await fetchCampaignSegmentsInternal(supabase, campaignId)

  const rules =
    payload.rules === null
      ? await replaceCampaignRulesInternal(supabase, campaignId, [])
      : payload.rules
        ? await replaceCampaignRulesInternal(supabase, campaignId, payload.rules)
        : await fetchCampaignRulesInternal(supabase, campaignId)

  const rewards =
    payload.rewards === null
      ? await replaceCampaignRewardsInternal(supabase, campaignId, [])
      : payload.rewards
        ? await replaceCampaignRewardsInternal(supabase, campaignId, payload.rewards)
        : await fetchCampaignRewardsInternal(supabase, campaignId)

  return { campaign, segments, rules, rewards }
}

export async function fetchCampaignWithRelations(
  campaignId: string
): Promise<{
  campaign: Campaign
  segments: CampaignSegmentLink[]
  rules: CampaignRule[]
  rewards: CampaignReward[]
}> {
  const supabase = ensureAdminClient()
  const campaign = await fetchCampaignByIdWithClient(supabase, campaignId)
  if (!campaign) {
    throw new Error('Campaña no encontrada')
  }

  const [segments, rules, rewards] = await Promise.all([
    fetchCampaignSegmentsInternal(supabase, campaignId),
    fetchCampaignRulesInternal(supabase, campaignId),
    fetchCampaignRewardsInternal(supabase, campaignId)
  ])

  return { campaign, segments, rules, rewards }
}

export async function updateCampaignStatus(campaignId: string, status: CampaignStatus): Promise<Campaign> {
  if (!CAMPAIGN_STATUS_VALUES.includes(status)) {
    throw new Error('Status de campaña inválido')
  }
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status })
    .eq('id', campaignId)
    .select(CAMPAIGN_FIELDS)
    .single()

  if (error) {
    if (isNoDataError(error)) {
      throw new Error('Campaña no encontrada')
    }
    throw new Error(`[campaigns] Error actualizando status: ${error.message}`)
  }

  return data as Campaign
}

export async function deleteCampaign(campaignId: string): Promise<boolean> {
  if (!campaignId) return false
  const supabase = ensureAdminClient()

  const { error: rulesError } = await supabase.from('campaign_rules').delete().eq('campaign_id', campaignId)
  if (rulesError) {
    throw new Error(`[campaigns] Error eliminando reglas de campaña: ${rulesError.message}`)
  }

  const { error: rewardsError } = await supabase.from('campaign_rewards').delete().eq('campaign_id', campaignId)
  if (rewardsError) {
    throw new Error(`[campaigns] Error eliminando recompensas de campaña: ${rewardsError.message}`)
  }

  const { error: segmentsError } = await supabase.from('campaign_segments').delete().eq('campaign_id', campaignId)
  if (segmentsError) {
    throw new Error(`[campaigns] Error eliminando segmentos de campaña: ${segmentsError.message}`)
  }

  const { error: progressError } = await supabase.from('campaign_progress').delete().eq('campaign_id', campaignId)
  if (progressError) {
    throw new Error(`[campaigns] Error eliminando progreso de campaña: ${progressError.message}`)
  }

  const { data, error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', campaignId)
    .select('id')
    .maybeSingle()

  if (error) {
    throw new Error(`[campaigns] Error eliminando campaña: ${error.message}`)
  }

  return Boolean(data)
}

async function fetchCampaignByIdWithClient(client: SupabaseAdminClient, id: string): Promise<Campaign | null> {
  if (!id) return null
  const { data, error } = await client
    .from('campaigns')
    .select(CAMPAIGN_FIELDS)
    .eq('id', id)
    .maybeSingle()

  if (error && !isNoDataError(error)) {
    throw new Error(`[campaigns] Error consultando campaña por id: ${error.message}`)
  }

  return (data as Campaign | null) ?? null
}

function buildCampaignUpdates(payload: UpdateCampaignPayload, existing: Campaign): Record<string, unknown> {
  const updates: Record<string, unknown> = {}

  if (payload.slug !== undefined) {
    const slug = typeof payload.slug === 'string' ? payload.slug.trim() : ''
    if (!slug) {
      throw new Error('Slug es obligatorio')
    }
    updates.slug = slug
  }

  if (payload.name !== undefined) {
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    if (!name) {
      throw new Error('Nombre es obligatorio')
    }
    updates.name = name
  }

  if (payload.summary !== undefined) {
    updates.summary = payload.summary ?? null
  }

  if (payload.description !== undefined) {
    updates.description = payload.description ?? null
  }

  if (payload.notes !== undefined) {
    updates.notes = payload.notes ?? null
  }

  if (payload.primary_segment_id !== undefined) {
    updates.primary_segment_id = payload.primary_segment_id ?? null
  }

  if (payload.status !== undefined) {
    if (!CAMPAIGN_STATUS_VALUES.includes(payload.status)) {
      throw new Error('Status de campaña inválido')
    }
    updates.status = payload.status
  }

  const resolvedRange = resolveActiveRangeUpdate(payload, existing)
  if (resolvedRange !== undefined) {
    updates.active_range = resolvedRange
  }

  return updates
}

function resolveActiveRangeUpdate(payload: UpdateCampaignPayload, existing: Campaign): string | undefined {
  if (payload.active_range !== undefined) {
    const range = typeof payload.active_range === 'string' ? payload.active_range.trim() : ''
    if (!range) {
      throw new Error('El rango de vigencia es obligatorio')
    }
    return range
  }

  const startProvided = payload.activeRangeStart !== undefined
  const endProvided = payload.activeRangeEnd !== undefined

  if (startProvided || endProvided) {
    const start = payload.activeRangeStart ?? undefined
    const end = payload.activeRangeEnd ?? undefined
    if (!start || !end) {
      throw new Error('Debes indicar activeRangeStart y activeRangeEnd')
    }
    return buildDateRange({
      slug: existing.slug,
      name: existing.name,
      summary: existing.summary ?? undefined,
      description: existing.description ?? undefined,
      status: payload.status ?? existing.status,
      active_range: '',
      primary_segment_id: payload.primary_segment_id ?? existing.primary_segment_id ?? undefined,
      notes: payload.notes ?? existing.notes ?? undefined,
      activeRangeStart: start,
      activeRangeEnd: end,
      created_by: existing.created_by ?? undefined
    } as CreateCampaignPayload)
  }

  return undefined
}

async function replaceCampaignSegmentsInternal(
  client: SupabaseAdminClient,
  campaignId: string,
  inputs: CampaignSegmentInput[] | null | undefined
): Promise<CampaignSegmentLink[]> {
  const sanitized: Array<{ campaign_id: string; segment_id: string; sort_order: number }> = []
  const seen = new Set<string>()

  if (Array.isArray(inputs)) {
    inputs.forEach((item, index) => {
      if (!item || item.deleted) return
      const segmentId = typeof item.segment_id === 'string' ? item.segment_id.trim() : ''
      if (!segmentId || seen.has(segmentId)) return
      seen.add(segmentId)
      const parsedOrder = toNumber(item.sort_order)
      const sortOrder = parsedOrder === undefined ? index : Math.trunc(parsedOrder)
      sanitized.push({ campaign_id: campaignId, segment_id: segmentId, sort_order: sortOrder })
    })
  }

  const { error: deleteError } = await client.from('campaign_segments').delete().eq('campaign_id', campaignId)
  if (deleteError) {
    throw new Error(`[campaigns] Error eliminando segmentos existentes: ${deleteError.message}`)
  }

  if (sanitized.length === 0) {
    return []
  }

  const { data, error } = await client
    .from('campaign_segments')
    .insert(sanitized)
    .select('campaign_id,segment_id,sort_order')
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error actualizando segmentos de campaña: ${error.message}`)
  }

  return (data ?? []) as CampaignSegmentLink[]
}

async function fetchCampaignSegmentsInternal(client: SupabaseAdminClient, campaignId: string): Promise<CampaignSegmentLink[]> {
  const { data, error } = await client
    .from('campaign_segments')
    .select('campaign_id,segment_id,sort_order')
    .eq('campaign_id', campaignId)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error obteniendo segmentos de campaña: ${error.message}`)
  }

  return (data ?? []) as CampaignSegmentLink[]
}

async function replaceCampaignRulesInternal(
  client: SupabaseAdminClient,
  campaignId: string,
  inputs: CampaignRuleInput[] | null | undefined
): Promise<CampaignRule[]> {
  const sanitized: Array<{
    campaign_id: string
    scope: CampaignRuleScope
    rule_kind: CampaignRule['rule_kind']
    config: Record<string, unknown>
    priority: number
    description: string | null
    logical_group: number
    logical_operator: 'AND' | 'OR'
  }> = []

  if (Array.isArray(inputs)) {
    inputs.forEach((item, index) => {
      if (!item || item.deleted) return
      const scope = normalizeRuleScope(item.scope)
      if (!scope) {
        throw new Error('Scope de campaña inválido')
      }
      const kindCandidate = typeof item.rule_kind === 'string' ? item.rule_kind : ''
      if (!isRuleKind(kindCandidate)) {
        throw new Error(`Tipo de regla inválido: ${item.rule_kind}`)
      }
      const priorityValue = toNumber(item.priority)
      const priority = priorityValue === undefined ? index : Math.trunc(priorityValue)
      const description = item.description === undefined || item.description === null
        ? null
        : String(item.description)
      const logicalGroup = item.logical_group !== undefined ? item.logical_group : 1
      const logicalOperator = item.logical_operator === 'OR' ? 'OR' : 'AND'
      sanitized.push({
        campaign_id: campaignId,
        scope,
        rule_kind: kindCandidate,
        config: sanitizeRuleConfig(item.config, kindCandidate),
        priority,
        description,
        logical_group: logicalGroup,
        logical_operator: logicalOperator
      })
    })
  }

  const { error: deleteError } = await client.from('campaign_rules').delete().eq('campaign_id', campaignId)
  if (deleteError) {
    throw new Error(`[campaigns] Error eliminando reglas existentes: ${deleteError.message}`)
  }

  if (sanitized.length === 0) {
    return []
  }

  const { data, error } = await client
    .from('campaign_rules')
    .insert(sanitized)
    .select('id,campaign_id,scope,rule_kind,config,priority,description,logical_group,logical_operator,created_at,updated_at')
    .order('priority', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error actualizando reglas de campaña: ${error.message}`)
  }

  return (data ?? []) as CampaignRule[]
}

async function fetchCampaignRulesInternal(client: SupabaseAdminClient, campaignId: string): Promise<CampaignRule[]> {
  const { data, error } = await client
    .from('campaign_rules')
    .select('id,campaign_id,scope,rule_kind,config,priority,description,logical_group,logical_operator,created_at,updated_at')
    .eq('campaign_id', campaignId)
    .order('priority', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error obteniendo reglas de campaña: ${error.message}`)
  }

  return (data ?? []) as CampaignRule[]
}

async function replaceCampaignRewardsInternal(
  client: SupabaseAdminClient,
  campaignId: string,
  inputs: CampaignRewardInput[] | null | undefined
): Promise<CampaignReward[]> {
  const sanitized: Array<{
    campaign_id: string
    title: string
    description: string | null
    is_accumulative: boolean
    sort_order: number
  }> = []

  if (Array.isArray(inputs)) {
    inputs.forEach((item, index) => {
      if (!item || item.deleted) return
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      if (!title) {
        throw new Error('El título de la recompensa es obligatorio')
      }
      const sortValue = toNumber(item.sort_order)
      const sortOrder = sortValue === undefined ? index : Math.trunc(sortValue)
      const accumValue = toBoolean(item.is_accumulative)
      sanitized.push({
        campaign_id: campaignId,
        title,
        description: item.description ?? null,
        is_accumulative: accumValue === undefined ? false : accumValue,
        sort_order: sortOrder
      })
    })
  }

  const { error: deleteError } = await client.from('campaign_rewards').delete().eq('campaign_id', campaignId)
  if (deleteError) {
    throw new Error(`[campaigns] Error eliminando recompensas existentes: ${deleteError.message}`)
  }

  if (sanitized.length === 0) {
    return []
  }

  const { data, error } = await client
    .from('campaign_rewards')
    .insert(sanitized)
    .select('id,campaign_id,title,description,is_accumulative,sort_order,created_at,updated_at')
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error actualizando recompensas de campaña: ${error.message}`)
  }

  return (data ?? []) as CampaignReward[]
}

async function fetchCampaignRewardsInternal(client: SupabaseAdminClient, campaignId: string): Promise<CampaignReward[]> {
  const { data, error } = await client
    .from('campaign_rewards')
    .select('id,campaign_id,title,description,is_accumulative,sort_order,created_at,updated_at')
    .eq('campaign_id', campaignId)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error obteniendo recompensas de campaña: ${error.message}`)
  }

  return (data ?? []) as CampaignReward[]
}

function sanitizeRuleConfig(value: unknown, kind?: CampaignRule['rule_kind']): Record<string, unknown> {
  const obj = ensureObject(value)

  if (kind === 'METRIC_CONDITION') {
    return sanitizeMetricConditionConfig(obj)
  }

  return cloneRecord(obj)
}

function cloneRecord(source: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(source)) as Record<string, unknown>
  } catch {
    return { ...source }
  }
}

function sanitizeMetricConditionConfig(input: Record<string, unknown>): Record<string, unknown> {
  const datasetRaw = typeof input.dataset === 'string' ? input.dataset : typeof input.source === 'string' ? input.source : ''
  const fieldRaw = typeof input.field === 'string' ? input.field : typeof input.metric === 'string' ? input.metric : ''
  const operatorRaw = typeof input.operator === 'string' ? input.operator : typeof input.comparator === 'string' ? input.comparator : ''

  const dataset = datasetRaw.trim()
  const field = fieldRaw.trim()
  const lowerOperator = operatorRaw.trim().toLowerCase()
  const operator = isMetricConditionOperator(lowerOperator) ? lowerOperator : 'eq'

  const datasetDefinition = dataset ? getCampaignDatasetDefinition(dataset) : undefined
  const fieldDefinition = datasetDefinition && field ? getCampaignDatasetField(dataset, field) : undefined
  if (datasetDefinition && field && !fieldDefinition) {
    const available = datasetDefinition.fields.map(entry => entry.value).join(', ')
    throw new Error(
      `[campaigns] Métrica "${field}" no existe en dataset "${dataset}". Campos disponibles: ${available || 'sin campos registrados'}.`
    )
  }

  let path: string[] = []
  if (Array.isArray(input.path)) {
    path = input.path
      .filter(segment => typeof segment === 'string')
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0)
  } else if (typeof input.path === 'string') {
    path = input.path
      .split('.')
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0)
  }
  if (fieldDefinition?.path?.length) {
    path = [...fieldDefinition.path]
  } else if (path.length === 0 && dataset && field) {
    path = ['datasets', dataset, field]
  }

  const fallbackValueType: 'number' | 'text' = input.valueType === 'text' ? 'text' : 'number'
  const valueType: 'number' | 'text' = fieldDefinition?.type === 'boolean' ? 'text' : (fieldDefinition?.type ?? fallbackValueType)
  const rawValue = input.valueRaw ?? input.value ?? input.expected ?? null
  const rawString = rawValue === undefined || rawValue === null ? '' : String(rawValue)
  let value: unknown = rawValue
  let valueRaw: string | null = rawString

  if (valueType === 'number') {
    const trimmed = rawString.trim()
    const parsedValue = trimmed.length > 0 ? toNumber(trimmed) : undefined
    value = parsedValue ?? null
    valueRaw = trimmed
  } else {
    const trimmed = rawString.trim()
    value = trimmed
    valueRaw = rawString
  }

  const weight = toNumber(input.weight)
  const negate = toBoolean(input.negate)

  const sanitized = cloneRecord(input)

  if (dataset) {
    sanitized.dataset = dataset
    sanitized.source = dataset
  } else {
    delete sanitized.dataset
    delete sanitized.source
  }

  if (field) {
    sanitized.field = field
    sanitized.metric = field
  } else {
    delete sanitized.field
    delete sanitized.metric
  }

  sanitized.operator = operator
  sanitized.valueType = valueType
  sanitized.value = value
  sanitized.valueRaw = valueRaw

  if (path.length > 0) {
    sanitized.path = path
  } else {
    delete sanitized.path
  }

  if (weight !== undefined) {
    sanitized.weight = weight
  } else {
    delete sanitized.weight
  }

  if (negate !== undefined) {
    sanitized.negate = negate
  } else {
    delete sanitized.negate
  }

  delete sanitized.comparator
  delete sanitized.expected

  return sanitized
}

function normalizeRuleScope(value: string | CampaignRuleScope | null | undefined): CampaignRuleScope | null {
  if (!value) return null
  const normalized = value.toString().trim().toLowerCase()
  return (CAMPAIGN_RULE_SCOPE_VALUES.find(scope => scope === normalized) as CampaignRuleScope | undefined) ?? null
}

type RuleResult = CampaignEvaluationResult['ruleResults'][number]

type NumericComparatorsConfig = {
  min?: number
  max?: number
  gt?: number
  lt?: number
  eq?: number
  weight?: number | null
}

type RoleRuleConfig = {
  allow?: string[]
  allowed?: string[]
  deny?: string[]
  denied?: string[]
  weight?: number | null
}

type SegmentRuleConfig = {
  any?: string[]
  anyOf?: string[]
  all?: string[]
  allOf?: string[]
  include?: string[]
  exclude?: string[]
  matchBy?: 'id' | 'slug'
  weight?: number | null
}

type CustomRuleConfig = {
  passed?: boolean
  result?: boolean
  negate?: boolean
  weight?: number | null
  message?: string
}

type MetricConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains' | 'not_contains' | 'in'

type MetricConditionConfig = {
  dataset: string
  field: string
  path: string[]
  operator: MetricConditionOperator
  value: unknown
  valueType: 'number' | 'text'
  weight?: number | null
  ruleConfig: Record<string, unknown>
}

export interface EvaluateCampaignOptions {
  campaign: Campaign
  rules: CampaignRule[]
  metrics: CampaignEvaluationMetrics
  context?: CampaignEvaluationContext
}

/**
 * Evaluates rules with logical groups support
 * Groups are combined with OR, rules within a group are combined with AND
 * Example: (group1_rule1 AND group1_rule2) OR (group2_rule1 AND group2_rule2)
 */
function evaluateRulesWithLogicalGroups(rules: CampaignRule[], ruleResults: RuleResult[]): boolean {
  if (rules.length === 0) return true
  
  // Create a map of rule results by rule ID for quick lookup
  const resultsMap = new Map<string, RuleResult>()
  ruleResults.forEach(result => resultsMap.set(result.id, result))
  
  // Group rules by logical_group
  const groupsMap = new Map<number, CampaignRule[]>()
  rules.forEach(rule => {
    const group = rule.logical_group ?? 1
    if (!groupsMap.has(group)) {
      groupsMap.set(group, [])
    }
    groupsMap.get(group)!.push(rule)
  })
  
  // Evaluate each group: all rules in a group must pass (AND)
  const groupResults: boolean[] = []
  for (const [, groupRules] of groupsMap) {
    const allPassed = groupRules.every(rule => {
      const result = resultsMap.get(rule.id)
      return result ? result.passed : false
    })
    groupResults.push(allPassed)
  }
  
  // At least one group must pass (OR between groups)
  return groupResults.some(passed => passed)
}

export function evaluateCampaign(options: EvaluateCampaignOptions): CampaignEvaluationResult {
  const { campaign: _campaign, rules, metrics, context } = options
  void _campaign

  const ctx: CampaignEvaluationContext = {
    usuarioRol: context?.usuarioRol,
    segmentIds: context?.segmentIds ?? [],
    segmentSlugs: context?.segmentSlugs ?? []
  }

  const normalizedRole = ctx.usuarioRol ? normalizeRole(ctx.usuarioRol) : null
  const segmentIdsSet = new Set((ctx.segmentIds ?? []).map(value => value.toLowerCase()))
  const segmentSlugsSet = new Set((ctx.segmentSlugs ?? []).map(value => value.toLowerCase()))

  const sortedRules = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.id.localeCompare(b.id)
  })

  const ruleResults: RuleResult[] = sortedRules.map(rule =>
    evaluateRule(rule, metrics, {
      normalizedRole,
      segmentIds: segmentIdsSet,
      segmentSlugs: segmentSlugsSet
    })
  )

  const eligibilityResults = ruleResults.filter(result => result.scope === 'eligibility')
  const goalResults = ruleResults.filter(result => result.scope === 'goal')

  // Evaluate eligibility with logical groups: (group1_rule1 AND group1_rule2) OR (group2_rule1 AND group2_rule2)
  const eligible = evaluateRulesWithLogicalGroups(sortedRules.filter(r => r.scope === 'eligibility'), eligibilityResults)

  let progress = 0
  let status: CampaignProgressStatus = 'not_eligible'

  if (eligible) {
    if (goalResults.length === 0) {
      progress = 1
      status = 'completed'
    } else {
      // Evaluate goals with logical groups
      const goalsCompleted = evaluateRulesWithLogicalGroups(sortedRules.filter(r => r.scope === 'goal'), goalResults)
      
      if (goalsCompleted) {
        progress = 1
        status = 'completed'
      } else {
        // Calculate progress based on BOTH eligibility and goals for partial credit
        const passedEligibility = eligibilityResults.filter(result => result.passed).length
        const passedGoals = goalResults.filter(result => result.passed).length
        const totalRules = eligibilityResults.length + goalResults.length
        
        progress = totalRules > 0 ? roundTo((passedEligibility + passedGoals) / totalRules, 3) : 0
        status = 'eligible'
      }
    }
  }

  return {
    eligible,
    progress,
    status,
    metrics,
    ruleResults
  }
}

export interface EvaluateCampaignCachedOptions {
  campaign: Campaign
  rules: CampaignRule[]
  usuarioId: number
  fetchMetrics: () => Promise<CampaignEvaluationMetrics>
  context?: CampaignEvaluationContext
  cache?: {
    ttlSeconds?: number
    force?: boolean
    fingerprint?: string
  }
}

export interface EvaluateCampaignCachedResult {
  result: CampaignEvaluationResult
  fromCache: boolean
  snapshot?: CampaignProgressSnapshot | null
}

export async function evaluateCampaignCached(options: EvaluateCampaignCachedOptions): Promise<EvaluateCampaignCachedResult> {
  const { campaign, rules, usuarioId, fetchMetrics, context, cache } = options
  const ttlSeconds = cache?.ttlSeconds ?? 300
  const forceRefresh = cache?.force ?? false
  const fingerprintHint = cache?.fingerprint

  const supabase = ensureAdminClient()
  const existingSnapshot = await fetchCampaignProgressSnapshot(supabase, campaign.id, usuarioId)

  if (!forceRefresh && existingSnapshot) {
    const cachedFingerprint = extractFingerprint(existingSnapshot.metrics)
    if (isCacheFresh(existingSnapshot, ttlSeconds, fingerprintHint, cachedFingerprint)) {
      const cachedResult = snapshotToEvaluationResult(existingSnapshot)
      if (cachedResult) {
        return { result: cachedResult, fromCache: true, snapshot: existingSnapshot }
      }
    }
  }

  const metrics = await fetchMetrics()
  const evaluation = evaluateCampaign({ campaign, rules, metrics, context })
  const fingerprint = fingerprintHint ?? computeMetricsFingerprint(metrics)

  const persistedSnapshot = await upsertCampaignProgressSnapshot(supabase, {
    campaignId: campaign.id,
    usuarioId,
    evaluation,
    metrics,
    fingerprint
  })

  return { result: evaluation, fromCache: false, snapshot: persistedSnapshot }
}

export async function invalidateCampaignProgress(options: { campaignId: string; usuarioId?: number }): Promise<void> {
  const supabase = ensureAdminClient()
  let query = supabase.from('campaign_progress').delete().eq('campaign_id', options.campaignId)
  if (typeof options.usuarioId === 'number') {
    query = query.eq('usuario_id', options.usuarioId)
  }
  const { error } = await query
  if (error) {
    throw new Error(`[campaigns] Error invalidando cache de campaña: ${error.message}`)
  }
}

export async function fetchCampaignProgressSummary(campaignId: string): Promise<CampaignProgressSummary> {
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('campaign_progress_summary')
    .select('campaign_id,total,eligible_total,completed_total,status_counts')
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (error && !isNoDataError(error)) {
    throw new Error(`[campaigns] Error consultando resumen de progreso: ${error.message}`)
  }

  const row = (data as CampaignProgressSummaryRow | null) ?? null
  return normalizeCampaignProgressSummary(row, campaignId)
}

export async function fetchCampaignRulesMap(campaignIds: string[]): Promise<Map<string, CampaignRule[]>> {
  const map = new Map<string, CampaignRule[]>()
  if (!campaignIds || campaignIds.length === 0) return map
  const unique = Array.from(new Set(campaignIds.filter(Boolean)))
  if (unique.length === 0) return map

  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('campaign_rules')
    .select('id,campaign_id,scope,rule_kind,config,priority,description,created_at,updated_at')
    .in('campaign_id', unique)
    .order('priority', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error obteniendo reglas de campañas: ${error.message}`)
  }

  for (const row of data ?? []) {
    const key = (row as { campaign_id?: string }).campaign_id
    if (!key) continue
    const list = map.get(key) ?? []
    const rule: CampaignRule = {
      id: (row as { id: string }).id,
      campaign_id: key,
      scope: (row as { scope: string }).scope === 'goal' ? 'goal' : 'eligibility',
      rule_kind: (row as { rule_kind: string }).rule_kind as CampaignRule['rule_kind'],
      config: ((row as { config?: Record<string, unknown> }).config ?? {}) as Record<string, unknown>,
      priority: typeof (row as { priority?: number }).priority === 'number' ? (row as { priority?: number }).priority! : 0,
      description: (row as { description?: string | null }).description ?? null,
      created_at: (row as { created_at?: string }).created_at,
      updated_at: (row as { updated_at?: string }).updated_at
    }
    list.push(rule)
    map.set(key, list)
  }

  for (const [key, list] of map.entries()) {
    list.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.id.localeCompare(b.id)
    })
    map.set(key, list)
  }

  return map
}

export async function fetchCampaignRewards(campaignId: string): Promise<CampaignReward[]> {
  if (!campaignId) return []
  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('campaign_rewards')
    .select('id,campaign_id,title,description,is_accumulative,sort_order,created_at,updated_at')
    .eq('campaign_id', campaignId)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error obteniendo recompensas: ${error.message}`)
  }

  return (data ?? []) as CampaignReward[]
}

export async function fetchCampaignSegmentsMap(campaignIds: string[]): Promise<Map<string, CampaignSegmentLink[]>> {
  const map = new Map<string, CampaignSegmentLink[]>()
  if (!campaignIds || campaignIds.length === 0) return map
  const unique = Array.from(new Set(campaignIds.filter(Boolean)))
  if (unique.length === 0) return map

  const supabase = ensureAdminClient()
  const { data, error } = await supabase
    .from('campaign_segments')
    .select('campaign_id,segment_id,sort_order')
    .in('campaign_id', unique)
    .order('sort_order', { ascending: true })

  if (error) {
    throw new Error(`[campaigns] Error obteniendo segmentos de campañas: ${error.message}`)
  }

  for (const row of data ?? []) {
    const key = (row as { campaign_id?: string }).campaign_id
    const segmentId = (row as { segment_id?: string }).segment_id
    if (!key || !segmentId) continue
    const list = map.get(key) ?? []
    list.push({
      campaign_id: key,
      segment_id: segmentId,
      sort_order: typeof (row as { sort_order?: number }).sort_order === 'number' ? (row as { sort_order?: number }).sort_order! : 0
    })
    map.set(key, list)
  }

  for (const [key, list] of map.entries()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.segment_id.localeCompare(b.segment_id))
    map.set(key, list)
  }

  return map
}

export function isCampaignActive(campaign: Campaign, referenceDate: Date = new Date()): boolean {
  if (!campaign) return false
  if (campaign.status !== 'active') return false
  return rangeContainsDate(campaign.active_range, referenceDate)
}

export async function fetchCampaignMetricsForUser(usuarioId: number): Promise<CampaignEvaluationMetrics> {
  if (!Number.isInteger(usuarioId)) {
    throw new Error('ID de usuario inválido para métricas de campaña')
  }

  const supabase = ensureAdminClient()
    const { data: userRow, error: userError } = await supabase
      .from('usuarios')
      .select('id,email,id_auth')
      .eq('id', usuarioId)
      .maybeSingle()

    if (!isNoDataError(userError) && userError) {
      throw new Error(`[campaigns] Error consultando usuario para métricas: ${userError.message}`)
    }

    const rawEmail = typeof userRow?.email === 'string' ? userRow.email.trim() : ''
    const normalizedEmail = rawEmail ? rawEmail.toLowerCase() : ''
    const userAuthId = typeof userRow?.id_auth === 'string' ? userRow.id_auth.trim() : null

    const customDatasetsPromise = supabase
      .from('campaigns_custom_metrics')
      .select('dataset,metric,numeric_value,text_value,json_value,updated_at')
      .eq('usuario_id', usuarioId)
      .order('dataset', { ascending: true })
      .order('metric', { ascending: true })

    const [polizas, cancelaciones, rc, candidatos, planificaciones, clientes] = await Promise.all([
      supabase
        .from('vw_polizas_metricas')
        .select(
          'polizas_total,polizas_vigentes,polizas_anuladas,prima_total_mxn,prima_vigente_mxn,prima_promedio_mxn,comision_base_mxn,puntos_totales,momentum_vita,ultima_emision,ultima_cancelacion,primera_emision,ultima_actualizacion'
        )
        .eq('usuario_id', usuarioId)
        .maybeSingle(),
      supabase
        .from('vw_cancelaciones_indices')
        .select('indice_limra,indice_igc,momentum_neto,periodo_mes')
        .eq('usuario_id', usuarioId)
        .order('periodo_mes', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('vw_rc_metricas')
        .select(
          'prospectos_total,reclutas_calidad,prospectos_con_cita,prospectos_seguimiento,prospectos_descartados,polizas_total,polizas_vigentes,polizas_anuladas,rc_vigencia,permanencia,reclutas_calidad_ratio'
        )
        .eq('usuario_id', usuarioId)
        .maybeSingle(),
      normalizedEmail
        ? supabase
            .from('candidatos')
            .select('id_candidato,eliminado,mes_conexion,mes')
            .ilike('email_agente', normalizedEmail)
        : Promise.resolve({ data: [] as CandidateMetricRow[], error: null as PostgrestError | null }) as Promise<SimpleArrayResult<CandidateMetricRow>>,
      supabase
        .from('planificaciones')
        .select('anio,semana_iso,prima_anual_promedio,porcentaje_comision,updated_at,created_at')
        .eq('agente_id', usuarioId),
      userAuthId
        ? supabase
            .from('clientes')
            .select('creado_at')
            .eq('asesor_id', userAuthId)
        : Promise.resolve({ data: [] as ClienteMetricRow[], error: null as PostgrestError | null }) as Promise<SimpleArrayResult<ClienteMetricRow>>
    ])

    const customDatasets = (await customDatasetsPromise) as SimpleArrayResult<CustomDatasetMetricRow>

  const metrics: CampaignEvaluationMetrics = { datasets: {} }
  let tenureMonths: number | null = null

  if (!isNoDataError(polizas.error) && polizas.error) {
    throw new Error(`[campaigns] Error consultando métricas de pólizas: ${polizas.error.message}`)
  }
  if (polizas.data) {
    const primeraEmision = (polizas.data as Record<string, unknown>).primera_emision as string | null
    tenureMonths = computeTenureMonths(primeraEmision)
    metrics.polizas = {
      total: toNumber((polizas.data as Record<string, unknown>).polizas_total) ?? 0,
      vigentes: toNumber((polizas.data as Record<string, unknown>).polizas_vigentes) ?? 0,
      anuladas: toNumber((polizas.data as Record<string, unknown>).polizas_anuladas) ?? 0,
      prima_total_mxn: toNumber((polizas.data as Record<string, unknown>).prima_total_mxn) ?? 0,
      prima_vigente_mxn: toNumber((polizas.data as Record<string, unknown>).prima_vigente_mxn) ?? 0,
      prima_promedio_mxn: toNumber((polizas.data as Record<string, unknown>).prima_promedio_mxn) ?? 0,
      comision_base_mxn: toNumber((polizas.data as Record<string, unknown>).comision_base_mxn) ?? 0,
      ingresos_mxn: toNumber((polizas.data as Record<string, unknown>).ingresos_mxn) ?? 0,
      puntos_totales: toNumber((polizas.data as Record<string, unknown>).puntos_totales) ?? 0,
      momentum_vita: toNumber((polizas.data as Record<string, unknown>).momentum_vita) ?? 0,
      ultima_emision: (polizas.data as Record<string, unknown>).ultima_emision as string | null,
      ultima_cancelacion: (polizas.data as Record<string, unknown>).ultima_cancelacion as string | null,
      ultima_actualizacion: (polizas.data as Record<string, unknown>).ultima_actualizacion as string | null
    }
  }

  if (!isNoDataError(cancelaciones.error) && cancelaciones.error) {
    throw new Error(`[campaigns] Error consultando métricas de cancelaciones: ${cancelaciones.error.message}`)
  }
  if (cancelaciones.data) {
    metrics.cancelaciones = {
      indice_limra: toNumber((cancelaciones.data as Record<string, unknown>).indice_limra) ?? null,
      indice_igc: toNumber((cancelaciones.data as Record<string, unknown>).indice_igc) ?? null,
      momentum_neto: toNumber((cancelaciones.data as Record<string, unknown>).momentum_neto) ?? null
    }
  }

  if (!isNoDataError(rc.error) && rc.error) {
    throw new Error(`[campaigns] Error consultando métricas RC: ${rc.error.message}`)
  }
  if (rc.data) {
    metrics.rc = {
      prospectos_total: toNumber((rc.data as Record<string, unknown>).prospectos_total) ?? 0,
      reclutas_calidad: toNumber((rc.data as Record<string, unknown>).reclutas_calidad) ?? 0,
      prospectos_con_cita: toNumber((rc.data as Record<string, unknown>).prospectos_con_cita) ?? 0,
      prospectos_seguimiento: toNumber((rc.data as Record<string, unknown>).prospectos_seguimiento) ?? 0,
      prospectos_descartados: toNumber((rc.data as Record<string, unknown>).prospectos_descartados) ?? 0,
      polizas_total: toNumber((rc.data as Record<string, unknown>).polizas_total) ?? 0,
      polizas_vigentes: toNumber((rc.data as Record<string, unknown>).polizas_vigentes) ?? 0,
      polizas_anuladas: toNumber((rc.data as Record<string, unknown>).polizas_anuladas) ?? 0,
      rc_vigencia: toNumber((rc.data as Record<string, unknown>).rc_vigencia) ?? null,
      permanencia: toNumber((rc.data as Record<string, unknown>).permanencia) ?? null,
      reclutas_calidad_ratio: toNumber((rc.data as Record<string, unknown>).reclutas_calidad_ratio) ?? null
    }
  }

  if (candidatos.error) {
    throw new Error(`[campaigns] Error consultando candidatos para métricas: ${candidatos.error.message}`)
  }
  const candidateRows = (candidatos.data ?? []) as CandidateMetricRow[]
  metrics.candidatos = computeCandidateMetrics(candidateRows)

  if (planificaciones.error) {
    throw new Error(`[campaigns] Error consultando planificaciones para métricas: ${planificaciones.error.message}`)
  }
  const planRows = (planificaciones.data ?? []) as PlanificacionMetricRow[]
  metrics.planificacion = computePlanificacionMetrics(planRows)

  if (clientes.error) {
    throw new Error(`[campaigns] Error consultando clientes para métricas: ${clientes.error.message}`)
  }
  const clientRows = (clientes.data ?? []) as ClienteMetricRow[]
  metrics.clientes = computeClientesMetrics(clientRows)

  // Tenure can come from either first policy emission or connection date
  // Priority: 1) primera_emision (policy), 2) ultimo_mes_conexion (candidatos)
  let finalTenure = tenureMonths
  if (finalTenure === null && metrics.candidatos?.ultimo_mes_conexion) {
    finalTenure = computeTenureMonths(metrics.candidatos.ultimo_mes_conexion)
  }
  metrics.tenure_meses = finalTenure

  // Calculate dynamic datasets using SQL function
  const { data: calculatedDatasets, error: calcError } = await supabase
    .rpc('calculate_campaign_datasets_for_user', { p_usuario_id: usuarioId })
  
  if (!isNoDataError(calcError) && calcError) {
    // Log error but don't fail - calculated datasets are supplementary
    console.warn(`[campaigns] Error calculating datasets for user ${usuarioId}:`, calcError.message)
  }

  if (calculatedDatasets && typeof calculatedDatasets === 'object') {
    metrics.datasets = metrics.datasets ?? {}
    // Merge calculated datasets into metrics.datasets
    Object.entries(calculatedDatasets as Record<string, unknown>).forEach(([datasetName, datasetValue]) => {
      if (typeof datasetValue === 'object' && datasetValue !== null) {
        metrics.datasets![datasetName] = datasetValue as Record<string, unknown>
      }
    })
  }

  const datasetRows = (customDatasets.data ?? []) as CustomDatasetMetricRow[]

  if (!isNoDataError(customDatasets.error) && customDatasets.error) {
    throw new Error(`[campaigns] Error consultando métricas dinámicas de campaña: ${customDatasets.error.message}`)
  }

  if (datasetRows.length > 0) {
    const store: Record<string, Record<string, unknown>> = metrics.datasets ?? {}
    datasetRows.forEach(row => {
      const datasetName = typeof row.dataset === 'string' ? row.dataset.trim() : ''
      const metricName = typeof row.metric === 'string' ? row.metric.trim() : ''
      if (!datasetName || !metricName) {
        return
      }

      let value: unknown = row.json_value ?? null
      if (value === null && row.numeric_value !== undefined && row.numeric_value !== null) {
        const numericCandidate = toNumber(row.numeric_value)
        value = numericCandidate !== undefined ? numericCandidate : row.numeric_value
      }
      if (value === null && row.text_value !== undefined) {
        value = row.text_value
      }

      if (!store[datasetName]) {
        store[datasetName] = {}
      }
      store[datasetName]![metricName] = value
    })
    metrics.datasets = store
  }

  return metrics
}

function evaluateRule(
  rule: CampaignRule,
  metrics: CampaignEvaluationMetrics,
  context: {
    normalizedRole: AppRole | null
    segmentIds: Set<string>
    segmentSlugs: Set<string>
  }
): RuleResult {
  switch (rule.rule_kind) {
    case 'ROLE':
      return evaluateRoleRule(rule, context.normalizedRole)
    case 'SEGMENT':
      return evaluateSegmentRule(rule, context.segmentIds, context.segmentSlugs)
    case 'COUNT_POLICIES':
      return evaluateCountPoliciesRule(rule, metrics)
    case 'TOTAL_PREMIUM':
      return evaluateTotalPremiumRule(rule, metrics)
    case 'RC_COUNT':
      return evaluateRcCountRule(rule, metrics)
    case 'INDEX_THRESHOLD':
      return evaluateIndexThresholdRule(rule, metrics)
    case 'TENURE_MONTHS':
      return evaluateTenureRule(rule, metrics)
    case 'METRIC_CONDITION':
      return evaluateMetricConditionRule(rule, metrics)
    case 'CUSTOM_SQL':
      return evaluateCustomSqlRule(rule)
    default:
      return buildRuleResult(rule, false, { reason: 'rule_kind_not_supported' })
  }
}

function evaluateRoleRule(rule: CampaignRule, role: AppRole | null): RuleResult {
  const config = readRoleConfig(rule.config)
  const allowedRoles = uniqueStrings([...(config.allow ?? []), ...(config.allowed ?? [])]).map(normalizeRole).filter(Boolean) as AppRole[]
  const deniedRoles = uniqueStrings([...(config.deny ?? []), ...(config.denied ?? [])]).map(normalizeRole).filter(Boolean) as AppRole[]

  const hasRestrictions = allowedRoles.length > 0 || deniedRoles.length > 0
  let passed = true

  if (hasRestrictions) {
    if (!role) {
      passed = false
    } else {
      if (allowedRoles.length > 0) {
        passed = allowedRoles.includes(role)
      }
      if (passed && deniedRoles.length > 0) {
        passed = !deniedRoles.includes(role)
      }
    }
  }

  const details: Record<string, unknown> = {
    usuarioRol: role,
    allowed: allowedRoles,
    denied: deniedRoles
  }

  if (config.weight) {
    details.weight = config.weight
  }

  return buildRuleResult(rule, passed, details, toNumber(config.weight))
}

function evaluateSegmentRule(
  rule: CampaignRule,
  segmentIds: Set<string>,
  segmentSlugs: Set<string>
): RuleResult {
  const config = readSegmentConfig(rule.config)
  const matchBy = config.matchBy === 'slug' ? 'slug' : 'id'
  const targetSet = matchBy === 'slug' ? segmentSlugs : segmentIds

  const allValues = uniqueStrings([...(config.all ?? []), ...(config.allOf ?? []), ...(config.include ?? [])])
  const anyValues = uniqueStrings([...(config.any ?? []), ...(config.anyOf ?? [])])
  const excludeValues = uniqueStrings(config.exclude ?? [])

  const normalizeValue = (value: string) => (matchBy === 'slug' ? value.trim().toLowerCase() : value.trim())

  let passed = true

  if (allValues.length > 0) {
    passed = allValues.every(value => targetSet.has(normalizeValue(value)))
  }

  if (passed && anyValues.length > 0) {
    passed = anyValues.some(value => targetSet.has(normalizeValue(value)))
  }

  if (passed && excludeValues.length > 0) {
    passed = !excludeValues.some(value => targetSet.has(normalizeValue(value)))
  }

  const details: Record<string, unknown> = {
    matchBy,
    segmentIds: Array.from(segmentIds),
    segmentSlugs: Array.from(segmentSlugs),
    requireAll: allValues,
    requireAny: anyValues,
    exclude: excludeValues
  }

  return buildRuleResult(rule, passed, details, toNumber(config.weight))
}

function resolveCountPoliciesField(config: Record<string, unknown>): string {
  const normalize = (value: string) => value.trim().toLowerCase()
  const fieldRaw = typeof config.field === 'string' ? normalize(config.field) : ''
  const metricRaw = typeof config.metric === 'string' ? normalize(config.metric) : ''
  const candidate = fieldRaw || metricRaw

  switch (candidate) {
    case 'polizas_total':
    case 'total':
    case 'total_policies':
    case 'polizas':
      return 'total'
    case 'polizas_anuladas':
    case 'anuladas':
      return 'anuladas'
    case 'polizas_vigentes':
    case 'vigentes':
    default:
      return 'vigentes'
  }
}

function evaluateCountPoliciesRule(rule: CampaignRule, metrics: CampaignEvaluationMetrics): RuleResult {
  const config = readNumericConfig(rule.config)
  const configObject = ensureObject(rule.config)
  const field = resolveCountPoliciesField(configObject)
  const polizas = ensureObject(metrics.polizas)
  const value = toNumber(polizas[field]) ?? 0
  const { passed, details, weight } = checkNumericRule(value, config, { field })
  return buildRuleResult(rule, passed, details, weight)
}

function resolveTotalPremiumField(config: Record<string, unknown>): string {
  const allowedFields: string[] = [
    'total',
    'vigentes',
    'anuladas',
    'prima_total_mxn',
    'prima_vigente_mxn',
    'prima_promedio_mxn',
    'comision_base_mxn',
    'ingresos_mxn',
    'puntos_totales',
    'momentum_vita'
  ]

  const fieldRaw = typeof config.field === 'string' ? config.field.trim() : ''
  if (fieldRaw && allowedFields.includes(fieldRaw)) {
    return fieldRaw
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
      return 'vigentes'
    case 'anuladas':
    case 'polizas_anuladas':
      return 'anuladas'
    case 'total_policies':
    case 'polizas_total':
    case 'polizas':
      return 'total'
    default:
      return 'prima_total_mxn'
  }
}

function evaluateTotalPremiumRule(rule: CampaignRule, metrics: CampaignEvaluationMetrics): RuleResult {
  const numericConfig = readNumericConfig(rule.config)
  const configObject = ensureObject(rule.config)
  const polizas = ensureObject(metrics.polizas)
  const field = resolveTotalPremiumField(configObject)
  const value = toNumber(polizas[field]) ?? 0
  const { passed, details, weight } = checkNumericRule(value, numericConfig, { field })
  return buildRuleResult(rule, passed, details, weight)
}

function evaluateRcCountRule(rule: CampaignRule, metrics: CampaignEvaluationMetrics): RuleResult {
  const config = readNumericConfig(rule.config)
  const configObject = ensureObject(rule.config)
  const rc = ensureObject(metrics.rc)
  const field = typeof configObject.field === 'string' ? configObject.field : 'reclutas_calidad'
  const value = toNumber(rc[field]) ?? 0
  const { passed, details, weight } = checkNumericRule(value, config, { field })
  return buildRuleResult(rule, passed, details, weight)
}

function evaluateIndexThresholdRule(rule: CampaignRule, metrics: CampaignEvaluationMetrics): RuleResult {
  const configObject = ensureObject(rule.config)
  const indicesRaw = Array.isArray(configObject.indices) ? configObject.indices : []
  if (indicesRaw.length > 0) {
    const indexDetails: Array<Record<string, unknown>> = []
    let passedAll = true
    indicesRaw.forEach(rawEntry => {
      const entryConfig = ensureObject(rawEntry)
      const field = typeof entryConfig.field === 'string' ? entryConfig.field : 'indice_limra'
      const source = resolveMetricSource(typeof entryConfig.source === 'string' ? entryConfig.source : undefined, field)
      const numericConfig = readNumericConfig(entryConfig)
      const value = toNumber(resolveMetricValue(metrics, source, field))
      const { passed, details } = checkNumericRule(value ?? null, numericConfig, { field, source })
      if (!passed) {
        passedAll = false
      }
      const name = typeof entryConfig.name === 'string' ? entryConfig.name : typeof entryConfig.label === 'string' ? entryConfig.label : null
      if (name) {
        details.name = name
      }
      indexDetails.push(details)
    })

    return buildRuleResult(
      rule,
      passedAll,
      {
        indices: indexDetails
      },
      toNumber(configObject.weight) ?? null
    )
  }

  const config = readNumericConfig(rule.config)
  const field = typeof configObject.field === 'string' ? configObject.field : 'indice_limra'
  const source = resolveMetricSource(typeof configObject.source === 'string' ? configObject.source : undefined, field)
  const value = toNumber(resolveMetricValue(metrics, source, field))
  const { passed, details, weight } = checkNumericRule(value ?? null, config, { field, source })
  return buildRuleResult(rule, passed, details, weight)
}

function evaluateTenureRule(rule: CampaignRule, metrics: CampaignEvaluationMetrics): RuleResult {
  const config = readNumericConfig(rule.config)
  const value = toNumber(metrics.tenure_meses)
  const { passed, details, weight } = checkNumericRule(value ?? null, config, { field: 'tenure_meses' })
  return buildRuleResult(rule, passed, details, weight)
}

function evaluateMetricConditionRule(rule: CampaignRule, metrics: CampaignEvaluationMetrics): RuleResult {
  const config = readMetricConditionConfig(rule.config)
  if (!config) {
    return buildRuleResult(rule, false, { reason: 'invalid_metric_config' })
  }
  let actualValue = resolveMetricValueByPath(metrics, config.path, config.dataset, config.field)
  
  // Handle calculated datasets that return lookup objects
  // e.g., polizas_prima_minima: {prima_25000: 2, prima_50000: 0}
  // When the rule has prima_minima_mxn: 25000, we look up prima_25000
  if (typeof actualValue === 'object' && actualValue !== null && !Array.isArray(actualValue)) {
    const lookupObj = actualValue as Record<string, unknown>
    
    // Check for dataset-specific parameters in config
    if (config.dataset === 'polizas_prima_minima' && config.ruleConfig.prima_minima_mxn) {
      const primaKey = `prima_${config.ruleConfig.prima_minima_mxn}`
      actualValue = lookupObj[primaKey] ?? null
    } else if (config.dataset === 'polizas_recientes' && config.ruleConfig.dias_ventana) {
      const ventanaKey = `ventana_${config.ruleConfig.dias_ventana}`
      actualValue = lookupObj[ventanaKey] ?? null
    }
  }
  
  const { passed, details } = compareMetricCondition(actualValue, config.value, config.operator, config.valueType)
  details.dataset = config.dataset
  details.field = config.field
  details.path = config.path
  return buildRuleResult(rule, passed, details, config.weight ?? null)
}

function evaluateCustomSqlRule(rule: CampaignRule): RuleResult {
  const config = readCustomConfig(rule.config)
  const desired = toBoolean(config.passed ?? config.result)
  const passed = desired === undefined ? false : desired
  const details: Record<string, unknown> = {
    desired,
    message: config.message ?? null
  }
  return buildRuleResult(rule, passed, details, toNumber(config.weight))
}

async function fetchCampaignProgressSnapshot(
  client: SupabaseAdminClient,
  campaignId: string,
  usuarioId: number
): Promise<CampaignProgressSnapshot | null> {
  const { data, error } = await client
    .from('campaign_progress')
    .select('id,campaign_id,usuario_id,eligible,progress,status,metrics,evaluated_at,created_at,updated_at')
    .eq('campaign_id', campaignId)
    .eq('usuario_id', usuarioId)
    .maybeSingle()

  if (error) {
    throw new Error(`[campaigns] Error consultando cache de campaña: ${error.message}`)
  }

  return (data as CampaignProgressSnapshot | null) ?? null
}

async function upsertCampaignProgressSnapshot(
  client: SupabaseAdminClient,
  input: {
    campaignId: string
    usuarioId: number
    evaluation: CampaignEvaluationResult
    metrics: CampaignEvaluationMetrics
    fingerprint: string
  }
): Promise<CampaignProgressSnapshot | null> {
  const nowIso = new Date().toISOString()
  const storedMetrics = buildStoredMetricsPayload(input.metrics, input.evaluation.ruleResults, input.fingerprint, nowIso)

  const { data, error } = await client
    .from('campaign_progress')
    .upsert(
      {
        campaign_id: input.campaignId,
        usuario_id: input.usuarioId,
        eligible: input.evaluation.eligible,
        progress: input.evaluation.progress,
        status: input.evaluation.status,
        metrics: storedMetrics,
        evaluated_at: nowIso
      },
      { onConflict: 'campaign_id,usuario_id' }
    )
    .select('id,campaign_id,usuario_id,eligible,progress,status,metrics,evaluated_at,created_at,updated_at')
    .single()

  if (error) {
    throw new Error(`[campaigns] Error actualizando cache de campaña: ${error.message}`)
  }

  return (data as CampaignProgressSnapshot | null) ?? null
}

function snapshotToEvaluationResult(snapshot: CampaignProgressSnapshot): CampaignEvaluationResult | null {
  if (!snapshot) return null
  const metrics = (snapshot.metrics ?? {}) as CampaignEvaluationMetrics
  const meta = ensureObject((metrics as Record<string, unknown>).meta)
  const ruleResults = parseRuleResults(meta.ruleResults)

  return {
    eligible: Boolean(snapshot.eligible),
    progress: typeof snapshot.progress === 'number' ? snapshot.progress : Number(snapshot.progress ?? 0),
    status: snapshot.status,
    metrics,
    ruleResults
  }
}

function isCacheFresh(
  snapshot: CampaignProgressSnapshot,
  ttlSeconds: number,
  fingerprintHint?: string,
  cachedFingerprint?: string
): boolean {
  if (!snapshot) return false
  if (ttlSeconds <= 0) return false

  const evaluatedAt = snapshot.evaluated_at ? Date.parse(snapshot.evaluated_at) : Number.NaN
  if (!Number.isFinite(evaluatedAt)) {
    return false
  }

  const ageSeconds = (Date.now() - evaluatedAt) / 1000
  if (ageSeconds > ttlSeconds) {
    return false
  }

  if (fingerprintHint) {
    if (!cachedFingerprint) return false
    return cachedFingerprint === fingerprintHint
  }

  return true
}

function normalizeCampaignProgressSummary(
  row: CampaignProgressSummaryRow | null,
  fallbackCampaignId: string
): CampaignProgressSummary {
  // Normalize the raw summary row so counters stay consistent even when the view returns nulls.
  const statusCounts = parseProgressStatusCounts(row?.status_counts)
  const countsTotal = sumNumericRecord(statusCounts)
  const totalFromRow = maybeNumber(row?.total)
  const total = Math.max(totalFromRow ?? countsTotal, 0)

  const eligibleFromRow = maybeNumber(row?.eligible_total)
  const eligibleCount = statusCounts.eligible ?? 0
  const inProgressCount = statusCounts.in_progress ?? 0
  const eligibleTotal = Math.max(eligibleFromRow ?? eligibleCount + inProgressCount, 0)

  const completedFromRow = maybeNumber(row?.completed_total)
  const completedStatusCount = statusCounts.completed ?? 0
  const completed = Math.max(completedFromRow ?? completedStatusCount, 0)

  const blockedStatusCount = (statusCounts.blocked ?? 0) + (statusCounts.paused ?? 0)
  const notEligible = Math.max(
    statusCounts.not_eligible ?? statusCounts.ineligible ?? total - (eligibleTotal + completed + blockedStatusCount),
    0
  )
  const active = Math.max(eligibleCount + inProgressCount, 0)
  const blocked = Math.max(blockedStatusCount, 0)

  const progressCounts: CampaignProgressCounts = {
    total,
    eligibleTotal,
    completed,
    active,
    blocked,
    notEligible
  }

  for (const [status, count] of Object.entries(statusCounts)) {
    progressCounts[status] = count
  }

  return {
    campaignId: row?.campaign_id ?? fallbackCampaignId,
    total,
    eligibleTotal,
    completedTotal: completed,
    statusCounts,
    progressCounts
  }
}

function parseProgressStatusCounts(value: unknown): Record<string, number> {
  const source = ensureObject(value)
  const counts: Record<string, number> = {}
  for (const [status, raw] of Object.entries(source)) {
    const numeric = maybeNumber(raw)
    if (numeric !== null) {
      counts[status] = numeric
    }
  }
  return counts
}

function maybeNumber(value: unknown): number | null {
  const numeric = toNumber(value)
  return typeof numeric === 'number' ? numeric : null
}

function sumNumericRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((total, value) => (Number.isFinite(value) ? total + value : total), 0)
}

function computeMetricsFingerprint(metrics: CampaignEvaluationMetrics): string {
  const clone = cloneMetrics(metrics)
  if (clone.meta) {
    delete clone.meta
  }
  return createHash('sha256').update(JSON.stringify(clone)).digest('hex')
}

function extractFingerprint(metrics: unknown): string | undefined {
  const metricsObject = ensureObject(metrics)
  const meta = ensureObject(metricsObject.meta)
  const fingerprint = meta.fingerprint
  return typeof fingerprint === 'string' ? fingerprint : undefined
}

function buildStoredMetricsPayload(
  metrics: CampaignEvaluationMetrics,
  ruleResults: RuleResult[],
  fingerprint: string,
  cachedAtIso: string
): Record<string, unknown> {
  const clone = cloneMetrics(metrics)
  const meta = ensureObject(clone.meta)
  meta.fingerprint = fingerprint
  meta.cached_at = cachedAtIso
  meta.ruleResults = ruleResults.map(result => ({
    id: result.id,
    passed: result.passed,
    scope: result.scope,
    kind: result.kind,
    description: result.description ?? null,
    weight: result.weight ?? null,
    details: result.details ?? null
  }))
  clone.meta = meta
  return clone as unknown as Record<string, unknown>
}

function parseRuleResults(value: unknown): RuleResult[] {
  if (!Array.isArray(value)) return []
  const results: RuleResult[] = []
  for (const entry of value) {
    const obj = ensureObject(entry)
    const id = typeof obj.id === 'string' ? obj.id : ''
    if (!id) continue
    const passed = Boolean(obj.passed)
    const scope = obj.scope === 'goal' ? 'goal' : 'eligibility'
    const kindValue = isRuleKind(obj.kind) ? obj.kind : 'CUSTOM_SQL'
    const weightValue = obj.weight === undefined ? null : toNumber(obj.weight) ?? null
    const detailsValue = obj.details && typeof obj.details === 'object' ? (obj.details as Record<string, unknown>) : null
    const descriptionValue = typeof obj.description === 'string' ? obj.description : null

    results.push({
      id,
      passed,
      scope,
      kind: kindValue,
      description: descriptionValue,
      weight: weightValue,
      details: detailsValue
    })
  }
  return results
}

function cloneMetrics(metrics: CampaignEvaluationMetrics): CampaignEvaluationMetrics {
  const payload = metrics ?? {}
  return JSON.parse(JSON.stringify(payload)) as CampaignEvaluationMetrics
}

const RULE_KIND_VALUES: CampaignRule['rule_kind'][] = [
  'ROLE',
  'SEGMENT',
  'COUNT_POLICIES',
  'TOTAL_PREMIUM',
  'RC_COUNT',
  'INDEX_THRESHOLD',
  'TENURE_MONTHS',
  'METRIC_CONDITION',
  'CUSTOM_SQL'
]

function isRuleKind(value: unknown): value is CampaignRule['rule_kind'] {
  return typeof value === 'string' && RULE_KIND_VALUES.includes(value as CampaignRule['rule_kind'])
}

function rangeContainsDate(range: string | null | undefined, date: Date): boolean {
  if (!range || !range.includes(',')) return true
  const match = range.match(/^([\[\(])\s*([^,]*?)\s*,\s*([^\]\)]*?)\s*([\]\)])$/)
  if (!match) return true
  const [, startBracket, startRaw, endRaw, endBracket] = match
  const start = parseRangeBoundary(startRaw)
  const end = parseRangeBoundary(endRaw)
  const timestamp = date.getTime()

  if (start) {
    const startTime = start.getTime()
    if (startBracket === '[') {
      if (timestamp < startTime) return false
    } else if (timestamp <= startTime) {
      return false
    }
  }

  if (end) {
    const endTime = end.getTime()
    if (endBracket === ']') {
      if (timestamp > endTime) return false
    } else if (timestamp >= endTime) {
      return false
    }
  }

  return true
}

function parseRangeBoundary(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'infinity' || trimmed === '+infinity') return null
  if (trimmed === '-infinity') return new Date(0)
  const iso = trimmed.length <= 10 ? `${trimmed}T00:00:00Z` : trimmed
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function isNoDataError(error: PostgrestError | null | undefined): boolean {
  return Boolean(error && error.code === 'PGRST116')
}

function computeTenureMonths(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return null
  const now = new Date()
  let months = (now.getFullYear() - parsed.getFullYear()) * 12 + (now.getMonth() - parsed.getMonth())
  if (now.getDate() < parsed.getDate()) {
    months -= 1
  }
  if (months < 0) months = 0
  return months
}

function computeCandidateMetrics(rows: CandidateMetricRow[]): CampaignEvaluationMetrics['candidatos'] {
  const total = rows.length
  const activos = rows.filter(row => row.eliminado !== true).length
  const eliminados = total - activos

  let latest: CandidateMetricRow | null = null
  let latestId = Number.NEGATIVE_INFINITY
  rows.forEach(row => {
    const idValue = typeof row.id_candidato === 'number'
      ? row.id_candidato
      : typeof row.id_candidato === 'string'
        ? Number(row.id_candidato)
        : Number.NEGATIVE_INFINITY
    if (Number.isFinite(idValue) && idValue > latestId) {
      latestId = idValue
      latest = row
    }
  })

  let ultimoMesConexion: string | null = null
  if (latest) {
    const row = latest as CandidateMetricRow
    // Solo usar mes_conexion, no usar 'mes' como fallback para evitar falsos positivos
    const mesConexionValue = sanitizeTextValue(row.mes_conexion)
    ultimoMesConexion = mesConexionValue && mesConexionValue.trim() !== '' ? mesConexionValue : null
  }

  return {
    total,
    activos,
    eliminados,
    ultimo_mes_conexion: ultimoMesConexion
  }
}

function computePlanificacionMetrics(rows: PlanificacionMetricRow[]): CampaignEvaluationMetrics['planificacion'] {
  let latest: PlanificacionMetricRow | null = null
  rows.forEach(row => {
    if (isLaterPlan(row, latest)) {
      latest = row
    }
  })

  let ultimaSemana: string | null = null
  let ultimaActualizacion: string | null = null
  let primaPromedio: number | null = null
  let porcentajeComision: number | null = null

  if (latest) {
    const row = latest as PlanificacionMetricRow
    ultimaSemana = formatIsoWeek(toNumber(row.anio), toNumber(row.semana_iso))
    ultimaActualizacion = sanitizeTextValue(row.updated_at) ?? sanitizeTextValue(row.created_at)
    primaPromedio = toNumber(row.prima_anual_promedio) ?? null
    porcentajeComision = toNumber(row.porcentaje_comision) ?? null
  }

  return {
    planes_total: rows.length,
    ultima_semana: ultimaSemana,
    ultima_actualizacion: ultimaActualizacion,
    prima_promedio: primaPromedio,
    porcentaje_comision: porcentajeComision
  }
}

function isLaterPlan(candidate: PlanificacionMetricRow, reference: PlanificacionMetricRow | null): boolean {
  if (!reference) return true
  const candidateYear = toNumber(candidate.anio) ?? Number.NEGATIVE_INFINITY
  const referenceYear = toNumber(reference.anio) ?? Number.NEGATIVE_INFINITY
  if (candidateYear !== referenceYear) {
    return candidateYear > referenceYear
  }
  const candidateWeek = toNumber(candidate.semana_iso) ?? Number.NEGATIVE_INFINITY
  const referenceWeek = toNumber(reference.semana_iso) ?? Number.NEGATIVE_INFINITY
  if (candidateWeek !== referenceWeek) {
    return candidateWeek > referenceWeek
  }
  const candidateTimestamp = parseTimestamp(candidate.updated_at ?? candidate.created_at) ?? Number.NEGATIVE_INFINITY
  const referenceTimestamp = parseTimestamp(reference.updated_at ?? reference.created_at) ?? Number.NEGATIVE_INFINITY
  return candidateTimestamp >= referenceTimestamp
}

function computeClientesMetrics(rows: ClienteMetricRow[]): CampaignEvaluationMetrics['clientes'] {
  const now = Date.now()
  const threshold30 = now - 30 * 24 * 60 * 60 * 1000
  const threshold90 = now - 90 * 24 * 60 * 60 * 1000

  let nuevos30 = 0
  let nuevos90 = 0
  let latest: ClienteMetricRow | null = null
  let latestTimestamp = Number.NEGATIVE_INFINITY

  rows.forEach(row => {
    const timestamp = parseTimestamp(row.creado_at)
    if (timestamp !== null) {
      if (timestamp >= threshold30) {
        nuevos30 += 1
      }
      if (timestamp >= threshold90) {
        nuevos90 += 1
      }
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp
        latest = row
      }
    }
  })

  let ultimaAlta: string | null = null
  if (latest) {
    const row = latest as ClienteMetricRow
    ultimaAlta = sanitizeTextValue(row.creado_at)
  }

  return {
    total: rows.length,
    nuevos_30_dias: nuevos30,
    nuevos_90_dias: nuevos90,
    ultima_alta: ultimaAlta
  }
}

function sanitizeTextValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatIsoWeek(year: number | null | undefined, week: number | null | undefined): string | null {
  if (!Number.isFinite(year ?? NaN) || !Number.isFinite(week ?? NaN)) {
    return null
  }
  const safeYear = Math.trunc(year as number)
  const safeWeek = Math.trunc(week as number)
  const boundedWeek = Math.max(1, Math.min(53, safeWeek))
  return `${safeYear}-W${String(boundedWeek).padStart(2, '0')}`
}

function readRoleConfig(config: unknown): RoleRuleConfig {
  const obj = ensureObject(config)
  return {
    allow: toStringArray(obj.allow ?? obj.allowedRoles),
    allowed: toStringArray(obj.allowed),
    deny: toStringArray(obj.deny ?? obj.blockedRoles),
    denied: toStringArray(obj.denied),
    weight: toNumber(obj.weight)
  }
}

function readSegmentConfig(config: unknown): SegmentRuleConfig {
  const obj = ensureObject(config)
  return {
    any: toStringArray(obj.any),
    anyOf: toStringArray(obj.anyOf ?? obj.includeAny ?? obj.requireAny),
    all: toStringArray(obj.all),
    allOf: toStringArray(obj.allOf ?? obj.requireAll),
    include: toStringArray(obj.include ?? obj.required ?? obj.segments),
    exclude: toStringArray(obj.exclude ?? obj.block ?? obj.disallow),
    matchBy: obj.matchBy === 'slug' ? 'slug' : 'id',
    weight: toNumber(obj.weight)
  }
}

function readNumericConfig(config: unknown): NumericComparatorsConfig {
  const obj = ensureObject(config)
  return {
    min: toNumber(obj.min ?? obj.minimum ?? obj.minValue),
    max: toNumber(obj.max ?? obj.maximum ?? obj.maxValue),
    gt: toNumber(obj.gt ?? obj.greaterThan),
    lt: toNumber(obj.lt ?? obj.lessThan),
    eq: toNumber(obj.eq ?? obj.equals),
    weight: toNumber(obj.weight)
  }
}

function readCustomConfig(config: unknown): CustomRuleConfig {
  const obj = ensureObject(config)
  return {
    passed: toBoolean(obj.passed),
    result: toBoolean(obj.result),
    negate: toBoolean(obj.negate),
    weight: toNumber(obj.weight),
    message: typeof obj.message === 'string' ? obj.message : undefined
  }
}

function readMetricConditionConfig(config: unknown): MetricConditionConfig | null {
  const obj = ensureObject(config)
  const datasetRaw = typeof obj.dataset === 'string' ? obj.dataset : typeof obj.source === 'string' ? obj.source : ''
  const fieldRaw = typeof obj.field === 'string' ? obj.field : typeof obj.metric === 'string' ? obj.metric : ''
  const operatorRaw = typeof obj.operator === 'string' ? obj.operator : typeof obj.comparator === 'string' ? obj.comparator : ''
  if (!datasetRaw || !fieldRaw || !isMetricConditionOperator(operatorRaw)) {
    return null
  }

  let path: string[] = []
  if (Array.isArray(obj.path) && obj.path.every(segment => typeof segment === 'string')) {
    path = (obj.path as string[]).map(segment => segment.trim()).filter(Boolean)
  } else if (typeof obj.path === 'string' && obj.path.trim()) {
    path = obj.path.split('.').map(segment => segment.trim()).filter(Boolean)
  } else {
    path = [datasetRaw, fieldRaw].filter(Boolean)
  }

  const valueType: 'number' | 'text' = obj.valueType === 'text' ? 'text' : 'number'
  const rawValue = obj.valueRaw ?? obj.value ?? obj.expected ?? null
  const weight = toNumber(obj.weight) ?? null

  return {
    dataset: datasetRaw,
    field: fieldRaw,
    path,
    operator: operatorRaw,
    value: rawValue,
    valueType,
    weight,
    ruleConfig: obj
  }
}

function checkNumericRule(
  value: number | null,
  config: NumericComparatorsConfig,
  extraDetails: Record<string, unknown>
): { passed: boolean; details: Record<string, unknown>; weight: number | null } {
  const details: Record<string, unknown> = {
    value,
    ...extraDetails
  }

  const { min, max, gt, lt, eq } = config
  let passed = true
  const hasConstraint = [min, max, gt, lt, eq].some(num => num !== undefined && num !== null)

  if (!hasConstraint) {
    return { passed: true, details, weight: config.weight ?? null }
  }

  if (value === null || Number.isNaN(value)) {
    passed = false
  } else {
    if (min !== undefined && value < min) passed = false
    if (passed && max !== undefined && value > max) passed = false
    if (passed && gt !== undefined && value <= gt) passed = false
    if (passed && lt !== undefined && value >= lt) passed = false
    if (passed && eq !== undefined && value !== eq) passed = false
  }

  details.min = min
  details.max = max
  details.gt = gt
  details.lt = lt
  details.eq = eq

  return { passed, details, weight: config.weight ?? null }
}

function buildRuleResult(
  rule: CampaignRule,
  passed: boolean,
  details: Record<string, unknown>,
  weight?: number | null
): RuleResult {
  const config = ensureObject(rule.config)
  const negated = toBoolean(config.negate)
  const finalPassed = negated ? !passed : passed
  if (negated) {
    details.negated = true
  }
  return {
    id: rule.id,
    passed: finalPassed,
    scope: rule.scope === 'goal' ? 'goal' : 'eligibility',
    kind: rule.rule_kind,
    description: typeof rule.description === 'string' ? rule.description : null,
    weight: weight ?? null,
    details
  }
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function uniqueStrings(input: unknown): string[] {
  const items = toStringArray(input)
  return Array.from(new Set(items))
}

function toStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .filter(item => typeof item === 'string')
      .map(item => item.trim())
      .filter(item => item.length > 0)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0)
  }
  return []
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function toBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'si'].includes(normalized)) return true
    if (['false', '0', 'no'].includes(normalized)) return false
  }
  return undefined
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

type MetricSource = 'polizas' | 'cancelaciones' | 'rc'

function resolveMetricSource(source: string | undefined, field: string): MetricSource {
  if (source) {
    const normalized = source.trim().toLowerCase()
    if (normalized === 'polizas' || normalized === 'cancelaciones' || normalized === 'rc') {
      return normalized
    }
  }
  return inferIndexSource(field)
}

function resolveMetricValue(
  metrics: CampaignEvaluationMetrics,
  source: MetricSource,
  field: string
): number | null {
  const stores: Record<MetricSource, unknown> = {
    polizas: metrics.polizas,
    cancelaciones: metrics.cancelaciones,
    rc: metrics.rc
  }
  const bucket = ensureObject(stores[source])
  const candidate = bucket[field]
  return toNumber(candidate) ?? null
}

function inferIndexSource(field: string): MetricSource {
  if (field === 'momentum_vita') return 'polizas'
  if (field === 'momentum_neto') return 'cancelaciones'
  if (field.startsWith('rc_') || field === 'reclutas_calidad' || field === 'prospectos_total') return 'rc'
  return 'cancelaciones'
}

function resolveMetricValueByPath(
  metrics: CampaignEvaluationMetrics,
  path: string[],
  dataset: string,
  field: string
): unknown {
  // Special handling for calculated datasets with lookup objects
  // For polizas_prima_minima and polizas_recientes, when field is 'cantidad',
  // we need to return the entire dataset object (not the 'cantidad' sub-object)
  // so the lookup logic can find the right key (e.g., prima_25000, ventana_365)
  if (field === 'cantidad' && (dataset === 'polizas_prima_minima' || dataset === 'polizas_recientes')) {
    const datasetObj = ensureObject(ensureObject(metrics.datasets)[dataset])
    return datasetObj
  }
  
  if (Array.isArray(path) && path.length > 0) {
    const resolved = path.reduce<unknown>((acc, segment) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[segment]
      }
      return undefined
    }, metrics as unknown)
    if (resolved !== undefined) {
      return resolved
    }
  }

  switch (dataset) {
    case 'polizas':
      return ensureObject(metrics.polizas)[field]
    case 'cancelaciones':
      return ensureObject(metrics.cancelaciones)[field]
    case 'candidatos':
      return ensureObject(metrics.candidatos)[field]
    case 'planificacion':
      return ensureObject(metrics.planificacion)[field]
    case 'clientes':
      return ensureObject(metrics.clientes)[field]
    case 'prospectos':
      return ensureObject(metrics.rc)[field]
    case 'rc':
      return ensureObject(metrics.rc)[field]
    case 'tenure':
      if (field === 'tenure_meses') {
        return metrics.tenure_meses ?? null
      }
      return ensureObject(metrics as Record<string, unknown>)[field]
    default: {
      const datasetObj = ensureObject(ensureObject(metrics.datasets)[dataset])
      const rawValue = datasetObj[field]
      return rawValue
    }
  }
}

function compareMetricCondition(
  actualValue: unknown,
  expectedValue: unknown,
  operator: MetricConditionOperator,
  valueType: 'number' | 'text'
): { passed: boolean; details: Record<string, unknown> } {
  const details: Record<string, unknown> = {
    actual: actualValue,
    expected: expectedValue,
    operator,
    valueType
  }

  if (valueType === 'number') {
    const actualNumber = toNumber(actualValue)
    const expectedNumber = toNumber(expectedValue)
    details.actualNumeric = actualNumber ?? null
    details.expectedNumeric = expectedNumber ?? null
    if (actualNumber === undefined || expectedNumber === undefined) {
      return { passed: false, details }
    }
    let passed = false
    switch (operator) {
      case 'gt':
        passed = actualNumber > expectedNumber
        break
      case 'gte':
        passed = actualNumber >= expectedNumber
        break
      case 'lt':
        passed = actualNumber < expectedNumber
        break
      case 'lte':
        passed = actualNumber <= expectedNumber
        break
      case 'eq':
        passed = actualNumber === expectedNumber
        break
      case 'neq':
        passed = actualNumber !== expectedNumber
        break
      case 'in':
        // expectedValue debe ser una lista separada por comas
        const expectedValues = String(expectedValue).split(',').map(v => toNumber(v.trim())).filter(n => n !== undefined) as number[]
        passed = expectedValues.includes(actualNumber)
        details.expectedValues = expectedValues
        break
      default:
        passed = false
    }
    return { passed, details }
  }

  const actualText = actualValue === undefined || actualValue === null ? '' : String(actualValue)
  const expectedText = expectedValue === undefined || expectedValue === null ? '' : String(expectedValue)
  details.actualText = actualText
  details.expectedText = expectedText

  const actualLower = actualText.toLocaleLowerCase()
  const expectedLower = expectedText.toLocaleLowerCase()

  let passed = false
  switch (operator) {
    case 'eq':
      passed = actualLower === expectedLower
      break
    case 'neq':
      passed = actualLower !== expectedLower
      break
    case 'contains':
      passed = expectedLower.length === 0 ? true : actualLower.includes(expectedLower)
      break
    case 'not_contains':
      passed = expectedLower.length === 0 ? false : !actualLower.includes(expectedLower)
      break
    case 'in':
      // expectedValue debe ser una lista separada por comas
      const expectedValues = String(expectedValue).split(',').map(v => v.trim().toLocaleLowerCase()).filter(v => v.length > 0)
      passed = expectedValues.includes(actualLower)
      details.expectedValues = expectedValues
      break
    default:
      passed = false
  }

  return { passed, details }
}

function isMetricConditionOperator(value: unknown): value is MetricConditionOperator {
  if (typeof value !== 'string') return false
  return (
    value === 'gt' ||
    value === 'gte' ||
    value === 'lt' ||
    value === 'lte' ||
    value === 'eq' ||
    value === 'neq' ||
    value === 'contains' ||
    value === 'not_contains' ||
    value === 'in'
  )
}

