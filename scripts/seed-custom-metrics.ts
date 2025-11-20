#!/usr/bin/env ts-node

/**
 * Seed or update declarative campaign metrics (`campaigns_custom_metrics`).
 *
 * Usage examples:
 *   npx ts-node --esm scripts/seed-custom-metrics.ts --file scripts/data/campaign_custom_metrics_sample.json
 *   npx ts-node --esm scripts/seed-custom-metrics.ts --file data.json --dry-run
 *   npx ts-node --esm scripts/seed-custom-metrics.ts --file data.json --replace
 *
 * The input JSON file can contain either flat rows or grouped metrics:
 *
 * [
 *   {
 *     "usuario_id": 123,
 *     "dataset": "meta_comisiones",
 *     "metrics": {
 *       "meta_cumplida": true,
 *       "avance_actual": 385000,
 *       "meta_objetivo": 588500
 *     }
 *   },
 *   {
 *     "usuario_id": 123,
 *     "dataset": "vida_grupo_inicial",
 *     "metric": "polizas_validas",
 *     "numeric_value": 2
 *   }
 * ]
 */

import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  getCampaignDatasetDefinition,
  getCampaignDatasetField
} from '../src/lib/campaignDatasetRegistry.ts'

const DEFAULT_ENV_FILES = [
  process.env.CAMPAIGNS_ENV_PATH,
  '.env.local',
  '.env'
]

type SeedOptions = {
  file: string
  dryRun: boolean
  replace: boolean
}

type MetricSeedRow = {
  usuario_id: number | string
  dataset: string
  metric?: string
  metrics?: Record<string, unknown>
  numeric_value?: number | string | null
  text_value?: string | null
  json_value?: unknown
  value?: unknown
  updated_at?: string
}

type MetricRecord = {
  usuario_id: number
  dataset: string
  metric: string
  numeric_value: number | null
  text_value: string | null
  json_value: unknown
  updated_at: string
}

function parseCliArgs(): SeedOptions {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', short: 'f', default: 'scripts/data/campaign_custom_metrics_sample.json' },
      dryRun: { type: 'boolean', default: false },
      replace: { type: 'boolean', default: false }
    }
  })

  if (!values.file) {
    throw new Error('Debes proporcionar la ruta del archivo con --file')
  }

  return {
    file: values.file,
    dryRun: Boolean(values.dryRun),
    replace: Boolean(values.replace)
  }
}

function loadEnvironment(): void {
  for (const candidate of DEFAULT_ENV_FILES) {
    if (!candidate) continue
    if (existsSync(candidate)) {
      loadEnv({ path: candidate })
      break
    }
  }
}

function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
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

function resolveValueColumns(entry: {
  numeric_value?: unknown
  text_value?: unknown
  json_value?: unknown
  value?: unknown
}): { numeric_value: number | null; text_value: string | null; json_value: unknown } {
  if (entry.numeric_value !== undefined) {
    const numeric = coerceNumber(entry.numeric_value)
    if (numeric !== null) return { numeric_value: numeric, text_value: null, json_value: null }
  }
  if (entry.text_value !== undefined) {
    const text = coerceString(entry.text_value)
    if (text !== null) return { numeric_value: null, text_value: text, json_value: null }
  }
  if (entry.json_value !== undefined) {
    return { numeric_value: null, text_value: null, json_value: entry.json_value }
  }

  const fallback = entry.value
  if (typeof fallback === 'number') {
    return { numeric_value: Number.isFinite(fallback) ? fallback : null, text_value: null, json_value: null }
  }
  if (typeof fallback === 'string') {
    const text = fallback.trim()
    return text.length > 0 ? { numeric_value: null, text_value: text, json_value: null } : { numeric_value: null, text_value: null, json_value: null }
  }
  if (typeof fallback === 'boolean') {
    return { numeric_value: null, text_value: fallback ? 'true' : 'false', json_value: null }
  }
  if (fallback && typeof fallback === 'object') {
    return { numeric_value: null, text_value: null, json_value: fallback }
  }
  return { numeric_value: null, text_value: null, json_value: null }
}

function normalizeRows(rawRows: unknown): MetricRecord[] {
  if (!Array.isArray(rawRows)) {
    throw new Error('El archivo debe contener un arreglo JSON')
  }

  const nowIso = new Date().toISOString()
  const records: MetricRecord[] = []

  rawRows.forEach((raw, index) => {
    const row = raw as MetricSeedRow
    const usuarioId = coerceNumber(row.usuario_id)
    const dataset = coerceString(row.dataset)
    if (usuarioId === null || !dataset) {
      throw new Error(`Fila #${index + 1}: se requiere usuario_id numérico y dataset`) 
    }

    const updatedAt = typeof row.updated_at === 'string' && row.updated_at.trim() ? row.updated_at.trim() : nowIso
    const datasetDefinition = getCampaignDatasetDefinition(dataset)

    const pushRecord = (metricKey: string, entry: MetricSeedRow) => {
      const metric = coerceString(metricKey)
      if (!metric) {
        throw new Error(`Fila #${index + 1}: métrica inválida (${metricKey})`)
      }
      const values = resolveValueColumns(entry)
      const fieldDefinition = datasetDefinition ? getCampaignDatasetField(dataset, metric) : undefined

      if (datasetDefinition && !fieldDefinition) {
        const available = datasetDefinition.fields.map(field => field.value).join(', ') || 'sin campos registrados'
        throw new Error(
          `Fila #${index + 1}: la métrica "${metric}" no está registrada en el dataset "${dataset}". Campos disponibles: ${available}.`
        )
      }

      if (fieldDefinition) {
        if (values.json_value !== null) {
          throw new Error(
            `Fila #${index + 1}: el dataset "${dataset}"/"${metric}" no acepta valores JSON. Usa numeric_value o text_value.`
          )
        }

        if (fieldDefinition.type === 'number') {
          if (values.numeric_value === null && values.text_value !== null) {
            const coerced = coerceNumber(values.text_value)
            if (coerced === null) {
              throw new Error(
                `Fila #${index + 1}: el valor para "${dataset}"/"${metric}" debe ser numérico.`
              )
            }
            values.numeric_value = coerced
            values.text_value = null
          }
        } else {
          if (values.text_value === null && values.numeric_value !== null) {
            values.text_value = String(values.numeric_value)
            values.numeric_value = null
          }
        }
      }

      records.push({
        usuario_id: usuarioId,
        dataset,
        metric,
        numeric_value: values.numeric_value,
        text_value: values.text_value,
        json_value: values.json_value,
        updated_at: updatedAt
      })
    }

    if (row.metrics && typeof row.metrics === 'object') {
      Object.entries(row.metrics).forEach(([metricKey, value]) => {
        pushRecord(metricKey, { ...row, metric: metricKey, value })
      })
    } else if (row.metric) {
      pushRecord(row.metric, row)
    } else {
      throw new Error(`Fila #${index + 1}: debes definir "metric" o un objeto "metrics"`)
    }
  })

  return records
}

async function readSeedFile(filePath: string): Promise<MetricRecord[]> {
  const absolute = path.resolve(process.cwd(), filePath)
  if (!existsSync(absolute)) {
    throw new Error(`El archivo ${absolute} no existe`)
  }
  const raw = await readFile(absolute, 'utf8')
  const json = JSON.parse(raw)
  return normalizeRows(json)
}

function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('Variable NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) no definida')
  }
  if (!key) {
    throw new Error('Variable SUPABASE_SERVICE_ROLE_KEY no definida (se requiere rol de servicio)')
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

async function seedMetrics(client: SupabaseClient, records: MetricRecord[], options: SeedOptions): Promise<void> {
  if (records.length === 0) {
    console.log('No se encontraron registros para procesar.')
    return
  }

  const summaryByDataset = new Map<string, number>()
  records.forEach(record => {
    summaryByDataset.set(record.dataset, (summaryByDataset.get(record.dataset) ?? 0) + 1)
  })

  console.log(`Preparando ${records.length} métricas para ${summaryByDataset.size} datasets.`)
  for (const [dataset, count] of summaryByDataset.entries()) {
    console.log(`  - ${dataset}: ${count} métricas`)
  }

  if (options.dryRun) {
    console.log('\nModo dry-run: no se enviaron cambios a Supabase.')
    return
  }

  if (options.replace) {
    const usuarios = Array.from(new Set(records.map(record => record.usuario_id)))
    const datasets = Array.from(new Set(records.map(record => record.dataset)))

    console.log(`Eliminando métricas existentes para usuarios [${usuarios.join(', ')}] y datasets [${datasets.join(', ')}]`)
    const { error: deleteError } = await client
      .from('campaigns_custom_metrics')
      .delete()
      .in('usuario_id', usuarios)
      .in('dataset', datasets)

    if (deleteError) {
      throw new Error(`Error eliminando métricas previas: ${deleteError.message}`)
    }
  }

  const chunkSize = 100
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize)
    const { error } = await client
      .from('campaigns_custom_metrics')
      .upsert(chunk, {
        onConflict: 'usuario_id,dataset,metric'
      })

    if (error) {
      throw new Error(`Error insertando métricas (chunk ${i / chunkSize + 1}): ${error.message}`)
    }
  }

  console.log('Métricas registradas correctamente.')
}

async function main(): Promise<void> {
  try {
    const options = parseCliArgs()
    loadEnvironment()
    const records = await readSeedFile(options.file)
    const client = createSupabaseClient()
    await seedMetrics(client, records, options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

void main()
