/**
 * Seed campaigns, rules, rewards, and segment links from a CSV or JSON definition.
 *
 * Usage examples:
 *   npx ts-node --esm scripts/seed-campaigns.ts --file data/campaigns.json
 *   npx ts-node --esm scripts/seed-campaigns.ts --file data/campaigns.csv --dry-run
 *
 * The input file must contain objects with at least `slug` and `name`.
 * Optional fields: summary, description, notes, status, active_range, activeRangeStart, activeRangeEnd,
 * primary_segment (name or slug), primary_segment_id, segments, rules, rewards.
 *
 * - segments: string (comma/pipe/semicolon separated), array of strings, or array of objects
 *   with { key|name|segment_id, sort_order }.
 * - rules: array of objects or JSON string. Each object should include scope (eligibility|goal),
 *   rule_kind (ROLE, SEGMENT, etc), config (object or JSON string), priority, description.
 * - rewards: array or JSON string with objects { title, description, is_accumulative, sort_order }.
 */

import type { CampaignRuleScope, CampaignRuleKind, CampaignStatus } from '../src/types'
import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parse as parseCsvSync } from 'csv-parse/sync'

const DEFAULT_ENV_FILES = [
  process.env.CAMPAIGNS_ENV_PATH,
  '.env.local',
  '.env'
]

const CAMPAIGN_STATUS_VALUES: CampaignStatus[] = ['draft', 'active', 'paused', 'archived']

export interface CLIOptions {
  file: string
  dryRun: boolean
  insertOnly: boolean
}

export interface SegmentToken {
  key?: string
  id?: string
  sort?: number | null
}

export interface SeedRule {
  scope: CampaignRuleScope
  rule_kind: CampaignRuleKind
  config: Record<string, unknown>
  priority: number
  description: string | null
}

export interface SeedReward {
  title: string
  description: string | null
  is_accumulative: boolean
  sort_order: number
}

export interface NormalizedSeedCampaign {
  slug: string
  name: string
  summary: string | null
  description: string | null
  notes: string | null
  status: CampaignStatus
  activeRange: string | null
  activeRangeStart: string | null
  activeRangeEnd: string | null
  primarySegmentName: string | null
  primarySegmentId: string | null
  segments: SegmentToken[]
  rules: SeedRule[]
  rewards: SeedReward[]
  created_by: number | null
}

export interface SeedContext {
  supabase: SupabaseClient
  segmentsIndex: Map<string, { id: string; name: string }>
}

export interface SeedResult {
  action: 'created' | 'updated' | 'skipped'
  slug: string
  warnings: string[]
}

function coerceString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function coerceBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'si', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return null
}

function slugifyName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function dedupeByKey<T extends { key?: string; id?: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    const identifier = item.id ?? (item.key ? item.key.toLowerCase() : '')
    if (!identifier || seen.has(identifier)) continue
    seen.add(identifier)
    result.push(item)
  }
  return result
}

function parseListValue(value: unknown): Array<string | Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<string | Record<string, unknown>>
  if (value === null || value === undefined) return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    const delimiter = /[,;|]/
    const items = trimmed
      .split(delimiter)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
    return items
  }
  return []
}

export function parseSegmentTokens(value: unknown): SegmentToken[] {
  const tokens: SegmentToken[] = []
  const rawEntries = parseListValue(value)

  for (const entry of rawEntries) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (!trimmed) continue
      let keyPart = trimmed
      let sortValue: number | null = null
      let id: string | undefined

      if (trimmed.startsWith('id=')) {
        id = trimmed.substring(3).trim()
        keyPart = ''
      } else if (trimmed.includes('#')) {
        const [key, sort] = trimmed.split('#', 2)
        keyPart = key.trim()
        const parsedSort = coerceNumber(sort)
        sortValue = parsedSort ?? null
      } else if (trimmed.includes(':')) {
        const [key, sort] = trimmed.split(':', 2)
        keyPart = key.trim()
        const parsedSort = coerceNumber(sort)
        sortValue = parsedSort ?? null
      }

      const token: SegmentToken = {}
      if (id) token.id = id
      if (keyPart) token.key = keyPart
      if (sortValue !== null) token.sort = sortValue
      tokens.push(token)
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      const id = coerceString(record.id ?? record.segment_id)
      const key = coerceString(record.key ?? record.name ?? record.segment)
      const sort = coerceNumber(record.sort ?? record.sort_order)
      tokens.push({ id: id ?? undefined, key: key ?? undefined, sort: sort ?? undefined })
    }
  }

  return dedupeByKey(tokens)
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function parseRuleEntry(entry: unknown, index: number): SeedRule | null {
  if (!entry) return null
  let rule: Record<string, unknown>
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    if (!trimmed) return null
    try {
      rule = JSON.parse(trimmed)
    } catch (error) {
      throw new Error(`Regla inválida (#${index + 1}): ${error instanceof Error ? error.message : 'JSON no válido'}`)
    }
  } else if (typeof entry === 'object') {
    rule = entry as Record<string, unknown>
  } else {
    return null
  }

  const scopeRaw = coerceString(rule.scope ?? rule.rule_scope)
  if (!scopeRaw) throw new Error(`Regla sin scope (#${index + 1})`)
  const scopeNormalized = scopeRaw.toLowerCase()
  if (!['eligibility', 'goal'].includes(scopeNormalized)) {
    throw new Error(`Scope de regla inválido (#${index + 1}): ${scopeRaw}`)
  }

  const kindRaw = coerceString(rule.rule_kind ?? rule.kind)
  if (!kindRaw) throw new Error(`Regla sin tipo (#${index + 1})`)
  const kindNormalized = kindRaw.toUpperCase() as CampaignRuleKind

  let configValue = rule.config ?? rule.payload ?? {}
  if (typeof configValue === 'string') {
    try {
      configValue = JSON.parse(configValue)
    } catch (error) {
      throw new Error(`Config de regla inválido (#${index + 1}): ${error instanceof Error ? error.message : 'JSON no válido'}`)
    }
  }
  const config = ensureObject(configValue)

  const priority = coerceNumber(rule.priority)
  const description = coerceString(rule.description ?? rule.notes)

  const flagDeleted = coerceBoolean(rule.deleted ?? rule.remove)
  if (flagDeleted === true) return null

  return {
    scope: scopeNormalized as CampaignRuleScope,
    rule_kind: kindNormalized,
    config,
    priority: priority ?? index,
    description: description ?? null
  }
}

function parseRules(value: unknown): SeedRule[] {
  if (value === null || value === undefined) return []
  let raw: unknown = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      raw = JSON.parse(trimmed)
    } else {
      raw = trimmed.split('|').map((part) => part.trim()).filter(Boolean)
    }
  }
  if (!Array.isArray(raw)) {
    throw new Error('Formato de reglas inválido (esperado arreglo)')
  }
  const result: SeedRule[] = []
  raw.forEach((entry, index) => {
    const parsed = parseRuleEntry(entry, index)
    if (parsed) result.push(parsed)
  })
  return result
}

function parseRewardEntry(entry: unknown, index: number): SeedReward | null {
  if (!entry) return null
  let reward: Record<string, unknown>
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    if (!trimmed) return null
    try {
      reward = JSON.parse(trimmed)
    } catch {
      reward = { title: trimmed }
    }
  } else if (typeof entry === 'object') {
    reward = entry as Record<string, unknown>
  } else {
    return null
  }

  const title = coerceString(reward.title ?? reward.name)
  if (!title) throw new Error(`Recompensa sin título (#${index + 1})`)
  const description = coerceString(reward.description ?? reward.detail)
  const isAccumulative = coerceBoolean(reward.is_accumulative ?? reward.accumulative) ?? false
  const sort = coerceNumber(reward.sort_order ?? reward.order ?? reward.index) ?? index

  const flagDeleted = coerceBoolean(reward.deleted ?? reward.remove)
  if (flagDeleted === true) return null

  return {
    title,
    description: description ?? null,
    is_accumulative: isAccumulative,
    sort_order: sort
  }
}

function parseRewards(value: unknown): SeedReward[] {
  if (value === null || value === undefined) return []
  let raw: unknown = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      raw = JSON.parse(trimmed)
    } else {
      raw = trimmed.split('|').map((part) => part.trim()).filter(Boolean)
    }
  }
  if (!Array.isArray(raw)) {
    throw new Error('Formato de recompensas inválido (esperado arreglo)')
  }
  const result: SeedReward[] = []
  raw.forEach((entry, index) => {
    const parsed = parseRewardEntry(entry, index)
    if (parsed) result.push(parsed)
  })
  return result
}

function buildActiveRangeString(activeRange: string | null, start: string | null, end: string | null): string | null {
  if (activeRange) {
    const trimmed = activeRange.trim()
    if (trimmed.length === 0) return null
    return trimmed
  }
  if (!start && !end) return null
  if (!start || !end) {
    throw new Error('Debes proporcionar activeRangeStart y activeRangeEnd cuando falta active_range')
  }
  return `[${start.trim()},${end.trim()})`
}

function resolveStatus(value: unknown, fallback: CampaignStatus): CampaignStatus {
  const raw = coerceString(value)
  if (!raw) return fallback
  const lower = raw.toLowerCase() as CampaignStatus
  if ((CAMPAIGN_STATUS_VALUES as CampaignStatus[]).includes(lower)) return lower
  throw new Error(`Status de campaña inválido: ${raw}`)
}

export function normalizeSeedCampaign(record: Record<string, unknown>, index: number): NormalizedSeedCampaign {
  const slug = coerceString(record.slug ?? record.campaign_slug ?? record.id)
  if (!slug) {
    throw new Error(`Fila #${index + 1} sin slug`)
  }
  const name = coerceString(record.name ?? record.title)
  if (!name) {
    throw new Error(`Fila #${index + 1} (${slug}) sin nombre`)
  }

  const summary = coerceString(record.summary)
  const description = coerceString(record.description ?? record.detail)
  const notes = coerceString(record.notes ?? record.remark)
  const status = resolveStatus(record.status ?? record.state, 'draft')

  const activeRange = coerceString(record.active_range ?? record.activeRange)
  const activeRangeStart = coerceString(record.activeRangeStart ?? record.range_start)
  const activeRangeEnd = coerceString(record.activeRangeEnd ?? record.range_end)
  const validatedRange = buildActiveRangeString(activeRange, activeRangeStart, activeRangeEnd)

  const primarySegmentName = coerceString(record.primary_segment ?? record.primarySegment)
  const primarySegmentId = coerceString(record.primary_segment_id ?? record.primarySegmentId)

  const segments = parseSegmentTokens(record.segments ?? record.segmentos ?? record.segment_names ?? record.segment_ids)
  const rules = parseRules(record.rules ?? record.campaign_rules)
  const rewards = parseRewards(record.rewards ?? record.campaign_rewards)
  const createdBy = coerceNumber(record.created_by ?? record.createdBy)

  return {
    slug,
    name,
    summary: summary ?? null,
    description: description ?? null,
    notes: notes ?? null,
    status,
    activeRange: validatedRange,
    activeRangeStart,
    activeRangeEnd,
    primarySegmentName: primarySegmentName ?? null,
    primarySegmentId: primarySegmentId ?? null,
    segments,
    rules,
    rewards,
    created_by: createdBy ?? null
  }
}

export function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    file: '',
    dryRun: false,
    insertOnly: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run' || arg === '-d') {
      options.dryRun = true
    } else if (arg === '--insert-only') {
      options.insertOnly = true
    } else if (arg === '--file' || arg === '-f') {
      const next = args[i + 1]
      if (!next) throw new Error('Falta ruta para --file')
      options.file = next
      i += 1
    } else if (arg.startsWith('--file=')) {
      options.file = arg.slice('--file='.length)
    } else if (arg === '--help' || arg === '-h') {
      throw new Error('help')
    } else {
      throw new Error(`Argumento desconocido: ${arg}`)
    }
  }

  if (!options.file) {
    throw new Error('Debes especificar --file con la ruta del seed')
  }

  return options
}

function loadEnvironment(): void {
  for (const candidate of DEFAULT_ENV_FILES) {
    if (!candidate) continue
    const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate)
    if (existsSync(absolutePath)) {
      loadEnv({ path: absolutePath, override: true })
    }
  }
}

export async function readSeedFile(filePath: string): Promise<Record<string, unknown>[]> {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const buffer = await readFile(absolutePath)
  const ext = path.extname(absolutePath).toLowerCase()

  if (ext === '.json') {
    const data = JSON.parse(buffer.toString())
    if (!Array.isArray(data)) {
      throw new Error('El archivo JSON debe contener un arreglo de campañas')
    }
    return data as Record<string, unknown>[]
  }

  if (ext === '.csv' || ext === '.tsv') {
    const records = parseCsvSync(buffer, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ext === '.tsv' ? '\t' : ','
    }) as Record<string, unknown>[]
    return records
  }

  throw new Error(`Extensión no soportada: ${ext}`)
}

async function buildSegmentsIndex(client: SupabaseClient): Promise<Map<string, { id: string; name: string }>> {
  const { data, error } = await client.from('segments').select('id,name')
  if (error) throw error
  const index = new Map<string, { id: string; name: string }>()
  for (const row of data ?? []) {
    if (!row.id || !row.name) continue
    const key = row.name.trim().toLowerCase()
    index.set(key, { id: row.id, name: row.name })
    index.set(slugifyName(row.name), { id: row.id, name: row.name })
  }
  return index
}

function resolveSegmentId(token: SegmentToken, index: Map<string, { id: string; name: string }>): { id: string; warning?: string } | null {
  if (token.id) {
    return { id: token.id }
  }
  if (!token.key) return null
  const lookup = token.key.trim().toLowerCase()
  const match = index.get(lookup) ?? index.get(slugifyName(token.key))
  if (!match) {
    return { id: '', warning: `Segmento no encontrado: ${token.key}` }
  }
  return { id: match.id }
}

function sanitizeSegments(
  campaignId: string,
  tokens: SegmentToken[],
  index: Map<string, { id: string; name: string }>
): { rows: Array<{ campaign_id: string; segment_id: string; sort_order: number }>; warnings: string[] } {
  const rows: Array<{ campaign_id: string; segment_id: string; sort_order: number }> = []
  const warnings: string[] = []
  tokens.forEach((token, i) => {
    const resolved = resolveSegmentId(token, index)
    if (!resolved) return
    if (resolved.warning) {
      warnings.push(resolved.warning)
      return
    }
    if (!resolved.id) return
    const sortValue = token.sort ?? i
    rows.push({ campaign_id: campaignId, segment_id: resolved.id, sort_order: Math.trunc(sortValue) })
  })
  return { rows, warnings }
}

function sanitizeRules(campaignId: string, rules: SeedRule[]): Array<{ campaign_id: string; scope: CampaignRuleScope; rule_kind: CampaignRuleKind; config: Record<string, unknown>; priority: number; description: string | null }> {
  return rules.map((rule, index) => ({
    campaign_id: campaignId,
    scope: rule.scope,
    rule_kind: rule.rule_kind,
    config: rule.config,
    priority: rule.priority ?? index,
    description: rule.description
  }))
}

function sanitizeRewards(campaignId: string, rewards: SeedReward[]): Array<{ campaign_id: string; title: string; description: string | null; is_accumulative: boolean; sort_order: number }> {
  return rewards.map((reward, index) => ({
    campaign_id: campaignId,
    title: reward.title,
    description: reward.description,
    is_accumulative: reward.is_accumulative,
    sort_order: reward.sort_order ?? index
  }))
}

async function upsertCampaign(
  ctx: SeedContext,
  payload: NormalizedSeedCampaign,
  options: CLIOptions
): Promise<SeedResult> {
  const { supabase, segmentsIndex } = ctx
  const warnings: string[] = []

  const activeRange = buildActiveRangeString(payload.activeRange, payload.activeRangeStart, payload.activeRangeEnd)
  if (!activeRange) {
    warnings.push('Campaña sin rango de vigencia; se omite active_range')
  }

  let primarySegmentId = payload.primarySegmentId
  if (!primarySegmentId && payload.primarySegmentName) {
    const lookup = payload.primarySegmentName.trim().toLowerCase()
    const match = segmentsIndex.get(lookup) ?? segmentsIndex.get(slugifyName(payload.primarySegmentName))
    if (match) {
      primarySegmentId = match.id
    } else {
      warnings.push(`Primary segment no encontrado: ${payload.primarySegmentName}`)
    }
  }

  const base: Record<string, unknown> = {
    slug: payload.slug,
    name: payload.name,
    summary: payload.summary,
    description: payload.description,
  status: payload.status,
  active_range: activeRange ?? null,
    primary_segment_id: primarySegmentId,
    notes: payload.notes,
    created_by: payload.created_by ?? undefined
  }

  const existing = await supabase
    .from('campaigns')
    .select('id')
    .eq('slug', payload.slug)
    .maybeSingle()

  if (existing.error && existing.error.code !== 'PGRST116') {
    throw existing.error
  }

  const campaignId = existing.data?.id

  if (!campaignId && options.dryRun) {
    return { action: 'created', slug: payload.slug, warnings }
  }

  if (campaignId && options.insertOnly) {
    return { action: 'skipped', slug: payload.slug, warnings: warnings.length ? warnings : ['Campaña existente, insert-only activo'] }
  }

  let resolvedCampaignId = campaignId ?? null

  if (!campaignId) {
    if (options.dryRun) {
      resolvedCampaignId = 'dry-run'
    } else {
      const insert = await supabase
        .from('campaigns')
        .insert(base)
        .select('id')
        .single()
      if (insert.error || !insert.data?.id) {
        throw insert.error ?? new Error(`No se pudo crear campaña ${payload.slug}`)
      }
      resolvedCampaignId = insert.data.id
    }
  } else {
    if (!options.dryRun) {
      const update = await supabase
        .from('campaigns')
        .update(base)
        .eq('id', campaignId)
      if (update.error) throw update.error
    }
    resolvedCampaignId = campaignId
  }

  if (!resolvedCampaignId) {
    throw new Error(`No se obtuvo id de campaña para ${payload.slug}`)
  }

  const action: SeedResult['action'] = campaignId ? 'updated' : 'created'

  if (!options.dryRun) {
    const { rows: segmentRows, warnings: segmentWarnings } = sanitizeSegments(resolvedCampaignId, payload.segments, segmentsIndex)
    warnings.push(...segmentWarnings)

    await supabase.from('campaign_segments').delete().eq('campaign_id', resolvedCampaignId)
    if (segmentRows.length > 0) {
      const insertSegments = await supabase
        .from('campaign_segments')
        .insert(segmentRows)
      if (insertSegments.error) throw insertSegments.error
    }

    await supabase.from('campaign_rules').delete().eq('campaign_id', resolvedCampaignId)
    const ruleRows = sanitizeRules(resolvedCampaignId, payload.rules)
    if (ruleRows.length > 0) {
      const insertRules = await supabase
        .from('campaign_rules')
        .insert(ruleRows)
      if (insertRules.error) throw insertRules.error
    }

    await supabase.from('campaign_rewards').delete().eq('campaign_id', resolvedCampaignId)
    const rewardRows = sanitizeRewards(resolvedCampaignId, payload.rewards)
    if (rewardRows.length > 0) {
      const insertRewards = await supabase
        .from('campaign_rewards')
        .insert(rewardRows)
      if (insertRewards.error) throw insertRewards.error
    }
  }

  return { action, slug: payload.slug, warnings }
}

async function main(): Promise<void> {
  let options: CLIOptions
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    if (error instanceof Error && error.message === 'help') {
      console.log('Uso: npx ts-node --esm scripts/seed-campaigns.ts --file <ruta> [--dry-run] [--insert-only]')
      console.log('El archivo puede ser JSON o CSV con campos documentados en el encabezado del script.')
      process.exit(0)
    }
    console.error('❌ Error parseando argumentos:', error instanceof Error ? error.message : error)
    process.exit(1)
    return
  }

  loadEnvironment()

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno')
    process.exit(1)
    return
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  let rawRecords: Record<string, unknown>[]
  try {
    rawRecords = await readSeedFile(options.file)
  } catch (error) {
    console.error('❌ No se pudo leer seed:', error instanceof Error ? error.message : error)
    process.exit(1)
    return
  }

  if (rawRecords.length === 0) {
    console.warn('⚠ No hay campañas en el archivo de seed')
    return
  }

  const normalized: NormalizedSeedCampaign[] = []
  try {
    rawRecords.forEach((record, index) => {
      normalized.push(normalizeSeedCampaign(record, index))
    })
  } catch (error) {
    console.error('❌ Error normalizando seeds:', error instanceof Error ? error.message : error)
    process.exit(1)
    return
  }

  const segmentsIndex = await buildSegmentsIndex(supabase)
  const ctx: SeedContext = { supabase, segmentsIndex }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const payload of normalized) {
    try {
      const result = await upsertCampaign(ctx, payload, options)
      if (result.action === 'created') created += 1
      if (result.action === 'updated') updated += 1
      if (result.action === 'skipped') skipped += 1
      const label = result.action === 'created' ? 'CREADA' : result.action === 'updated' ? 'ACTUALIZADA' : 'OMITIDA'
      console.log(`${label}: ${result.slug}`)
      result.warnings.forEach((warning) => console.warn(`  ⚠ ${warning}`))
    } catch (error) {
      console.error(`❌ Error procesando ${payload.slug}:`, error instanceof Error ? error.message : error)
      if (!options.dryRun) {
        process.exit(1)
        return
      }
    }
  }

  console.log('Resumen:')
  console.log(`  → Creadas:  ${created}`)
  console.log(`  → Actualizadas: ${updated}`)
  console.log(`  → Omitidas: ${skipped}`)
  if (options.dryRun) {
    console.log('  (dry-run: no se realizaron cambios)')
  }
}

const invokedDirectly = process.argv[1] && /seed-campaigns(\.ts|\.js)?$/.test(process.argv[1])

if (invokedDirectly) {
  main().catch((error) => {
    console.error('❌ Seed campañas falló:', error)
    process.exit(1)
  })
}
