#!/usr/bin/env ts-node

import fs from "node:fs"
import path from "node:path"
import { getCampaignDatasetDefinition, getCampaignDatasetField } from "../src/lib/campaignDatasetRegistry.ts"

type RuleSummary = {
  summary: string
  variables: string[]
}

type RuleInput = {
  rule_kind?: string
  config?: Record<string, unknown>
}

type CampaignRecord = {
  name?: string
  slug?: string
  primary_segment?: string
  segments?: string[]
  rules: RuleInput[]
}

type IndexThresholdEntry = {
  source?: string
  field?: string
  metric?: string
  max?: number
  min?: number
  threshold?: number
}

const OPERATOR_LABEL_MAP: Record<string, string> = {
  gte: ">=",
  gt: ">",
  lte: "<=",
  lt: "<",
  eq: "=",
  neq: "!=",
  contains: "contiene",
  not_contains: "no contiene"
}

const NUMBER_FORMATTER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 })

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === "string" ? value : undefined
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  return typeof value === "number" ? value : undefined
}

function readStringArray(source: Record<string, unknown>, key: string): string[] | undefined {
  const value = source[key]
  if (!Array.isArray(value)) {
    return undefined
  }
  const entries = value.filter((entry): entry is string => typeof entry === "string")
  return entries.length > 0 ? entries : undefined
}

function readIndexEntries(source: Record<string, unknown>, key: string): IndexThresholdEntry[] {
  const value = source[key]
  if (!Array.isArray(value)) {
    return []
  }
  const entries: IndexThresholdEntry[] = []
  value.forEach(entry => {
    const record = asRecord(entry)
    if (!record) {
      return
    }
    entries.push({
      source: readString(record, "source"),
      field: readString(record, "field"),
      metric: readString(record, "metric"),
      max: readNumber(record, "max"),
      min: readNumber(record, "min"),
      threshold: readNumber(record, "threshold")
    })
  })
  return entries
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(stringifyValue).join(", ")
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value)
  }
  return `${value}`
}

function describeMetricCondition(ruleConfig: Record<string, unknown>): RuleSummary {
  const datasetKey = readString(ruleConfig, "dataset") ?? readString(ruleConfig, "source") ?? "-"
  const fieldKey = readString(ruleConfig, "field") ?? readString(ruleConfig, "metric") ?? "-"
  const operator = readString(ruleConfig, "operator") ?? "eq"
  const rawValue = ruleConfig["value"] ?? ruleConfig["expected"] ?? ruleConfig["valueRaw"] ?? "-"
  const datasetDef = datasetKey ? getCampaignDatasetDefinition(datasetKey) : undefined
  const fieldDef = datasetDef && fieldKey ? getCampaignDatasetField(datasetKey, fieldKey) : undefined

  const datasetLabel = datasetDef?.label ?? datasetKey
  const fieldLabel = fieldDef?.label ?? fieldKey
  const operatorLabel = OPERATOR_LABEL_MAP[operator] ?? operator
  const valueLabel = typeof rawValue === "number" ? NUMBER_FORMATTER.format(rawValue) : stringifyValue(rawValue)

  const summary = `${datasetLabel} - ${fieldLabel} ${operatorLabel} ${valueLabel}`
  const variableDescriptor = datasetDef && fieldDef
    ? `${datasetDef.label} -> ${fieldDef.label}`
    : `${datasetLabel} -> ${fieldLabel}`

  return {
    summary,
    variables: [variableDescriptor]
  }
}

function describeRule(rule: RuleInput): RuleSummary {
  const config = rule.config ?? {}

  switch (rule.rule_kind) {
    case "METRIC_CONDITION":
      return describeMetricCondition(config)
    case "COUNT_POLICIES": {
      const product = readString(config, "product")
        ?? (() => {
          const products = readStringArray(config, "products")
          return products && products.length > 0 ? products.join(", ") : undefined
        })()
        ?? "todas"
      const min = readNumber(config, "min") ?? readNumber(config, "minimum") ?? 0
      return {
        summary: `Conteo de polizas (${product}) >= ${min}`,
        variables: ["Produccion polizas y primas -> Polizas vigentes"]
      }
    }
    case "TOTAL_PREMIUM": {
      const metric = readString(config, "metric") ?? readString(config, "field") ?? "prima_total_mxn"
      const threshold = readNumber(config, "threshold") ?? readNumber(config, "min") ?? 0
      return {
        summary: `Prima total (${metric}) >= ${threshold}`,
        variables: ["Produccion polizas y primas -> Prima / Comisiones"]
      }
    }
    case "RC_COUNT": {
      const min = readNumber(config, "min") ?? readNumber(config, "minimum") ?? 0
      return {
        summary: `Reclutas de calidad >= ${min} (con condiciones RC)` ,
        variables: ["Embudo de prospectos y reclutas -> Reclutas de calidad"]
      }
    }
    case "SEGMENT": {
      const include = readStringArray(config, "all")
        ?? readStringArray(config, "any")
        ?? readStringArray(config, "include")
        ?? []
      const exclude = readStringArray(config, "exclude") ?? []
      const parts: string[] = []
      if (include.length > 0) {
        parts.push(`Incluye segmentos: ${include.join(", ")}`)
      }
      if (exclude.length > 0) {
        parts.push(`Excluye segmentos: ${exclude.join(", ")}`)
      }
      return {
        summary: parts.join(" | ") || "Regla de segmentos",
        variables: []
      }
    }
    case "INDEX_THRESHOLD": {
      const indices = readIndexEntries(config, "indices")
      const summaries = indices.map(entry => {
        const datasetKey = entry.source ?? "cancelaciones"
        const fieldKey = entry.field ?? entry.metric
        const datasetDef = getCampaignDatasetDefinition(datasetKey)
        const fieldDef = fieldKey ? getCampaignDatasetField(datasetKey, fieldKey) : undefined
        const datasetLabel = datasetDef?.label ?? datasetKey
        const fieldLabel = fieldDef?.label ?? fieldKey ?? "-"
        const limit = entry.max ?? entry.min ?? entry.threshold ?? "-"
        const op = entry.max !== undefined ? "<=" : ">="
        return `${datasetLabel} - ${fieldLabel} ${op} ${limit}`
      })
      const variables = indices.map(entry => {
        const datasetKey = entry.source ?? "cancelaciones"
        const fieldKey = entry.field ?? entry.metric
        const datasetDef = getCampaignDatasetDefinition(datasetKey)
        const fieldDef = fieldKey ? getCampaignDatasetField(datasetKey, fieldKey) : undefined
        if (datasetDef && fieldDef) {
          return `${datasetDef.label} -> ${fieldDef.label}`
        }
        return `${datasetKey} -> ${fieldKey ?? "-"}`
      })
      return {
        summary: summaries.join(" | "),
        variables
      }
    }
    default:
      return {
        summary: rule.rule_kind ?? "Regla desconocida",
        variables: []
      }
  }
}

function loadCampaigns(): CampaignRecord[] {
  const filePath = path.resolve(process.cwd(), "scripts/data/campaigns_2025.json")
  const raw = fs.readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => record !== null)
    .map(record => {
      const segmentsValue = record["segments"]
      const segments = Array.isArray(segmentsValue)
        ? segmentsValue.filter((segment): segment is string => typeof segment === "string")
        : undefined
      const rulesValue = record["rules"]
      const rules = Array.isArray(rulesValue)
        ? rulesValue
          .map(asRecord)
          .filter((rule): rule is Record<string, unknown> => rule !== null)
          .map(rule => ({
            rule_kind: readString(rule, "rule_kind"),
            config: rule["config"] ? asRecord(rule["config"]) ?? undefined : undefined
          }))
        : []

      return {
        name: readString(record, "name"),
        slug: readString(record, "slug"),
        primary_segment: readString(record, "primary_segment"),
        segments,
        rules
      }
    })
}

type TableRow = {
  name: string
  segments: string
  requirements: string[]
  variables: string[]
}

function buildTableRows(): TableRow[] {
  const campaigns = loadCampaigns()

  return campaigns.map(campaign => {
    const name = campaign.name ?? campaign.slug ?? "-"
    const segmentsArr: string[] = []
    if (campaign.primary_segment) {
      segmentsArr.push(campaign.primary_segment)
    }
    if (campaign.segments) {
      campaign.segments.forEach(segment => {
        if (!segmentsArr.includes(segment)) {
          segmentsArr.push(segment)
        }
      })
    }
    const segments = segmentsArr.length > 0 ? segmentsArr.join(", ") : "Sin segmentacion especifica"

    const ruleSummaries = campaign.rules.map(describeRule)
    const requisitos = ruleSummaries.map(entry => entry.summary || "-").filter(Boolean)
    const variables = Array.from(new Set(ruleSummaries.flatMap(entry => entry.variables).filter(Boolean)))

    return {
      name,
      segments: segments || "-",
      requirements: requisitos.length > 0 ? requisitos : ["-"],
      variables: variables.length > 0 ? variables : ["-"]
    }
  })
}

console.log(JSON.stringify(buildTableRows(), null, 2))
