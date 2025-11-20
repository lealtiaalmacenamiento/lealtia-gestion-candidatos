/**
 * Schemas de validación para campañas usando Zod.
 * 
 * Este módulo define las validaciones para el wizard de campañas, incluyendo:
 * - Datos generales (nombre, slug, fechas, segmentos)
 * - Elegibilidad (segmentos requeridos/excluidos)
 * - Requisitos (métricas, operadores, valores)
 * - Premios (títulos, descripciones, acumulables)
 * 
 * VALIDACIONES ASÍNCRONAS RECOMENDADAS:
 * 
 * 1. Slug único:
 *    - Validar que el slug no exista en otra campaña activa
 *    - Usar un debounce para evitar consultas excesivas
 *    - Ejemplo: `await fetch('/api/admin/campaigns/check-slug?slug=' + value)`
 * 
 * 2. Rangos de fechas:
 *    - Verificar solapamiento con otras campañas del mismo segmento
 *    - Validar que la fecha de inicio no sea pasada (para nuevas campañas)
 *    - Ejemplo: `await fetch('/api/admin/campaigns/check-date-overlap', { body })`
 * 
 * Para implementar validaciones asíncronas, usa `z.refine()` con async:
 * 
 * @example
 * slug: z.string()
 *   .refine(async (value) => {
 *     const response = await fetch(`/api/admin/campaigns/check-slug?slug=${value}`)
 *     const { available } = await response.json()
 *     return available
 *   }, { message: "Este slug ya está en uso" })
 */

import { z } from "zod"
import {
  CAMPAIGN_DATASET_DEFINITIONS,
  type CampaignDatasetDefinition,
  type CampaignDatasetKey
} from "@/lib/campaignDatasetRegistry"
import { CAMPAIGN_STATUS_VALUES } from "@/lib/campaigns"
import type { CampaignStatus } from "@/types"

const requirementOperatorValues = ["gt", "gte", "lt", "lte", "eq", "neq", "contains", "not_contains", "in"] as const
const requirementValueTypeValues = ["number", "text"] as const
const requirementValueModeValues = ["preset", "custom"] as const
const eligibilityMatchModeValues = ["any", "all"] as const

export type RequirementOperator = (typeof requirementOperatorValues)[number]
export type RequirementValueType = (typeof requirementValueTypeValues)[number]
export type RequirementValueMode = (typeof requirementValueModeValues)[number]
export type EligibilityMatchMode = (typeof eligibilityMatchModeValues)[number]

const textOperatorSet = new Set<RequirementOperator>(["contains", "not_contains", "eq", "neq", "in"])
const numericOperatorSet = new Set<RequirementOperator>(["gt", "gte", "lt", "lte", "eq", "neq", "in"])

const datasetDefinitionMap = new Map<CampaignDatasetKey, CampaignDatasetDefinition>(
  CAMPAIGN_DATASET_DEFINITIONS.map(definition => [definition.key, definition])
)

function parseDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function ensureStringArray(value: string[] | undefined | null): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => typeof item === "string")
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

function ensureUnique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

/**
 * Schema para datos generales de campaña.
 * Valida nombre, slug (URL-friendly), fechas y segmentos.
 */
const generalSchema = z
  .object({
    name: z
      .string()
      .refine(value => value.trim().length > 0, { message: "El nombre de la campana es obligatorio" }),
    slug: z
      .string()
      .refine(value => value.trim().length > 0, { message: "El slug no puede estar vacio" })
      .refine(value => /^[a-z0-9-]+$/.test(value), { message: "El slug solo puede contener letras, numeros y guiones" }),
      // TODO: Agregar validación asíncrona para slug único
      // .refine(async (value) => { ... }, { message: "Este slug ya está en uso" }),
    summary: z.string().optional().transform(value => value ?? ""),
    description: z.string().optional().transform(value => value ?? ""),
    status: z.enum(CAMPAIGN_STATUS_VALUES, { message: "Selecciona un estado valido" }),
    activeRangeStart: z
      .string()
      .refine(value => value.trim().length > 0, { message: "Captura la fecha de inicio" }),
    activeRangeEnd: z
      .string()
      .refine(value => value.trim().length > 0, { message: "Captura la fecha de fin" }),
    segmentIds: z
      .array(z.string())
      .optional()
      .transform(value => ensureUnique(ensureStringArray(value)))
  })
  .superRefine((data, ctx) => {
    const start = parseDate(data.activeRangeStart)
    const end = parseDate(data.activeRangeEnd)
    if (!start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha de inicio invalida", path: ["activeRangeStart"] })
    }
    if (!end) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha de fin invalida", path: ["activeRangeEnd"] })
    }
    if (start && end && start > end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de inicio debe ser menor o igual a la fecha fin",
        path: ["activeRangeEnd"]
      })
    }
    // TODO: Agregar validación asíncrona para verificar solapamiento de fechas
    // con otras campañas del mismo segmento:
    // const overlaps = await fetch('/api/admin/campaigns/check-date-overlap', { body: ... })
    // if (overlaps) ctx.addIssue({ ... })
  })

/**
 * Schema para elegibilidad de campaña.
 * Define segmentos requeridos, excluidos y modo de coincidencia (any/all).
 */
const eligibilitySchema = z
  .object({
    requiredSegments: z
      .array(z.string())
      .optional()
      .transform(value => ensureUnique(ensureStringArray(value)))
      .default([]),
    excludedSegments: z
      .array(z.string())
      .optional()
      .transform(value => ensureUnique(ensureStringArray(value)))
      .default([]),
    match: z.enum(eligibilityMatchModeValues).default("any")
  })
  .superRefine((data, ctx) => {
    const overlaps = data.requiredSegments.filter(id => data.excludedSegments.includes(id))
    if (overlaps.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Un segmento no puede estar en la lista de requeridos y excluidos a la vez",
        path: ["excludedSegments"]
      })
    }
  })

/**
 * Schema para requisitos de campaña (métricas).
 * Valida dataset, campo, operador y valor según tipo.
 * 
 * Ejemplos de requisitos válidos:
 * - COUNT_POLICIES >= 10 (Emitir 10 o más pólizas)
 * - TOTAL_PREMIUM >= 50000 (Alcanzar $50,000 en primas)
 * - INDEX_THRESHOLD >= 0.85 (Mantener IGC >= 85%)
 */
const requirementFormSchema = z
  .object({
    key: z.string().min(1),
    kind: z.literal("metric"),
    scope: z.enum(["eligibility", "goal"] as const),
    dataset: z.string().min(1),
    field: z.string().min(1),
    operator: z.enum(requirementOperatorValues),
    value: z.string(),
    valueType: z.enum(requirementValueTypeValues),
    valueMode: z.enum(requirementValueModeValues),
    description: z.string().optional().transform(value => value ?? ""),
    logicalGroup: z.number().int().positive().optional().default(1),
    logicalOperator: z.enum(["AND", "OR"] as const).optional().default("AND"),
    datasetParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({})
  })
  .superRefine((data, ctx) => {
    const definition = datasetDefinitionMap.get(data.dataset as CampaignDatasetKey)
    if (!definition) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selecciona un dataset valido", path: ["dataset"] })
      return
    }
    if (!definition.scopes.includes(data.scope)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El dataset no admite este alcance", path: ["dataset"] })
    }

    const fieldDefinition = definition.fields.find(field => field.value === data.field)
    if (!fieldDefinition) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selecciona un indicador valido", path: ["field"] })
      return
    }

    if (fieldDefinition.type !== data.valueType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El indicador no coincide con el tipo de valor seleccionado",
        path: ["field"]
      })
    }

    const operatorSet = fieldDefinition.type === "text" ? textOperatorSet : numericOperatorSet
    if (!operatorSet.has(data.operator)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selecciona un operador valido", path: ["operator"] })
    }

    const label = fieldDefinition.label ?? fieldDefinition.value
    const trimmedValue = data.value.trim()
    if (fieldDefinition.type === "number") {
      const numericValue = Number(trimmedValue)
      if (!Number.isFinite(numericValue)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ingresa un numero valido para \"" + label + "\"",
          path: ["value"]
        })
      }
    } else {
      const allowEmpty = ["eq", "neq", "contains", "not_contains"].includes(data.operator)
      if (!allowEmpty && trimmedValue.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Completa el valor esperado para \"" + label + "\"",
          path: ["value"]
        })
      }
    }
  })

/**
 * Schema para premios de campaña.
 * Define título, descripción y si es acumulable con otros premios.
 * 
 * @example
 * {
 *   title: "Bono por productividad",
 *   description: "Bono del 5% sobre comisiones",
 *   isAccumulative: true
 * }
 */
const rewardFormSchema = z.object({
  key: z.string().min(1),
  title: z
    .string()
    .refine(value => value.trim().length > 0, { message: "El titulo de la recompensa es obligatorio" }),
  description: z.string().optional().transform(value => value ?? ""),
  isAccumulative: z.boolean().default(false)
})

const campaignWizardSchema = z.object({
  general: generalSchema,
  eligibility: eligibilitySchema,
  requirements: z.array(requirementFormSchema).default([]),
  rewards: z.array(rewardFormSchema).default([]),
  notes: z.string().optional().transform(value => value ?? "")
})

export type GeneralFormValues = z.infer<typeof generalSchema>
export type EligibilityFormValues = z.infer<typeof eligibilitySchema>
export type RequirementFormValue = z.infer<typeof requirementFormSchema>
export type RewardFormValue = z.infer<typeof rewardFormSchema>
export type CampaignWizardFormValues = z.infer<typeof campaignWizardSchema>

export function createCampaignWizardDefaultValues(): CampaignWizardFormValues {
  return {
    general: {
      name: "",
      slug: "",
      summary: "",
      description: "",
      status: "draft",
      activeRangeStart: "",
      activeRangeEnd: "",
      segmentIds: []
    },
    eligibility: {
      requiredSegments: [],
      excludedSegments: [],
      match: "any"
    },
    requirements: [],
    rewards: [],
    notes: ""
  }
}

export function normalizeCampaignStatusInput(
  status: CampaignStatus | string | null | undefined
): CampaignStatus | undefined {
  if (!status) return undefined
  const trimmed = status.trim().toLowerCase()
  return CAMPAIGN_STATUS_VALUES.includes(trimmed as CampaignStatus) ? (trimmed as CampaignStatus) : undefined
}

export {
  campaignWizardSchema,
  requirementFormSchema,
  rewardFormSchema,
  requirementOperatorValues,
  requirementValueTypeValues,
  requirementValueModeValues,
  eligibilityMatchModeValues
}
