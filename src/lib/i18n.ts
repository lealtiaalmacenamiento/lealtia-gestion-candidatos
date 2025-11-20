/**
 * Internacionalización y strings externalizadas para campañas.
 * Centraliza labels, mensajes y pluralizaciones para mantener consistencia.
 */

// ============================================================================
// Estados de campaña
// ============================================================================

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activa',
  paused: 'Pausada',
  archived: 'Archivada'
} as const

export const CAMPAIGN_STATUS_BADGES: Record<string, string> = {
  draft: 'bg-secondary',
  active: 'bg-success',
  paused: 'bg-warning',
  archived: 'bg-light text-dark'
} as const

// ============================================================================
// Estados de progreso
// ============================================================================

export const CAMPAIGN_PROGRESS_STATUS_LABELS: Record<string, string> = {
  not_eligible: 'No elegible',
  eligible: 'Elegible',
  completed: 'Meta cumplida'
} as const

export const CAMPAIGN_PROGRESS_STATUS_BADGES: Record<string, string> = {
  not_eligible: 'bg-secondary',
  eligible: 'bg-info',
  completed: 'bg-success'
} as const

// ============================================================================
// Tipos de reglas / Datasets
// ============================================================================

export const RULE_KIND_LABELS: Record<string, string> = {
  ROLE: 'Rol requerido',
  SEGMENT: 'Segmento objetivo',
  COUNT_POLICIES: 'Número de pólizas',
  TOTAL_PREMIUM: 'Total de primas',
  RC_COUNT: 'Número de RC',
  INDEX_THRESHOLD: 'Umbral de índice',
  TENURE_MONTHS: 'Meses de antigüedad',
  CUSTOM_SQL: 'Consulta personalizada'
} as const

// ============================================================================
// Scopes de reglas
// ============================================================================

export const RULE_SCOPE_LABELS: Record<string, string> = {
  eligibility: 'Elegibilidad',
  goal: 'Objetivo / Meta'
} as const

// ============================================================================
// Operadores
// ============================================================================

export const OPERATOR_LABELS: Record<string, string> = {
  gte: '≥ (mayor o igual)',
  gt: '> (mayor que)',
  lte: '≤ (menor o igual)',
  lt: '< (menor que)',
  eq: '= (igual a)',
  in: 'Incluido en',
  contains: 'Contiene'
} as const

// ============================================================================
// Labels de wizard
// ============================================================================

export const WIZARD_STEP_LABELS = [
  'Datos generales',
  'Elegibilidad',
  'Requisitos',
  'Premios',
  'Notas',
  'Resumen'
] as const

// ============================================================================
// Mensajes de validación
// ============================================================================

export const VALIDATION_MESSAGES = {
  required: {
    campaignName: 'El nombre de la campaña es obligatorio',
    slug: 'El slug es obligatorio',
    startDate: 'La fecha de inicio es obligatoria',
    endDate: 'La fecha de fin es obligatoria',
    datasetKey: 'Selecciona un dataset válido para cada requisito',
    metricKey: 'Selecciona un indicador válido para cada requisito',
    rewardTitle: 'El título del premio es obligatorio'
  },
  invalid: {
    dateRange: 'La fecha de fin debe ser posterior a la fecha de inicio',
    slugFormat: 'El slug debe contener solo letras minúsculas, números y guiones',
    slugExists: 'Este slug ya está en uso por otra campaña'
  }
} as const

// ============================================================================
// Mensajes de éxito/error
// ============================================================================

export const SUCCESS_MESSAGES = {
  campaignCreated: 'Campaña creada correctamente',
  campaignUpdated: 'Campaña actualizada correctamente',
  campaignDuplicated: 'Campaña duplicada correctamente',
  campaignDeleted: 'Campaña eliminada correctamente',
  segmentCreated: 'Segmento creado correctamente',
  segmentUpdated: 'Segmento actualizado correctamente',
  productTypeCreated: 'Tipo de póliza creado correctamente',
  productTypeUpdated: 'Tipo de póliza actualizado correctamente'
} as const

export const ERROR_MESSAGES = {
  campaignNotFound: 'No se encontró la campaña',
  campaignLoadFailed: 'No se pudo cargar la campaña',
  campaignSaveFailed: 'No se pudo guardar la campaña',
  campaignsLoadFailed: 'No se pudieron cargar las campañas',
  campaignProgressLoadFailed: 'No se pudieron cargar los avances de las campañas',
  campaignProgressUpdateFailed: 'No se pudo actualizar el avance de la campaña',
  segmentLoadFailed: 'No se pudieron cargar los segmentos',
  unauthorized: 'No tienes permisos para realizar esta acción'
} as const

// ============================================================================
// Labels generales
// ============================================================================

export const GENERAL_LABELS = {
  noResults: 'No se encontraron resultados',
  noCampaigns: 'No tienes campañas disponibles en este momento',
  noCampaignsWithFilters: 'No se encontraron campañas con los filtros seleccionados',
  noSegments: 'Sin segmentos disponibles',
  noSegmentsConfigured: 'Sin segmentos configurados',
  allSegments: 'Todos los segmentos',
  noPrimarySegment: 'Sin segmento principal',
  loading: 'Cargando...',
  saving: 'Guardando...',
  search: 'Buscar',
  filter: 'Filtrar',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
  cancel: 'Cancelar',
  save: 'Guardar',
  back: 'Atrás',
  next: 'Siguiente',
  finish: 'Finalizar',
  viewDetail: 'Ver detalle',
  eligibleUsers: 'Elegibles',
  completedUsers: 'Completadas'
} as const

// ============================================================================
// Helpers de pluralización
// ============================================================================

/**
 * Pluraliza una palabra en español según la cantidad.
 * 
 * @param count - Cantidad de elementos
 * @param singular - Forma singular de la palabra
 * @param plural - Forma plural (opcional, por defecto añade 's')
 * @returns String en singular o plural según count
 * 
 * @example
 * pluralize(1, 'póliza') // "1 póliza"
 * pluralize(5, 'póliza') // "5 pólizas"
 * pluralize(1, 'requisito', 'requisitos') // "1 requisito"
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  const form = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${count} ${form}`
}

/**
 * Retorna solo la forma singular o plural sin el número.
 * 
 * @example
 * pluralForm(1, 'póliza') // "póliza"
 * pluralForm(5, 'póliza') // "pólizas"
 */
export function pluralForm(
  count: number,
  singular: string,
  plural?: string
): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

/**
 * Casos específicos comunes de pluralización.
 */
export const pluralizers = {
  poliza: (count: number) => pluralize(count, 'póliza', 'pólizas'),
  requisito: (count: number) => pluralize(count, 'requisito', 'requisitos'),
  premio: (count: number) => pluralize(count, 'premio', 'premios'),
  campana: (count: number) => pluralize(count, 'campaña', 'campañas'),
  segmento: (count: number) => pluralize(count, 'segmento', 'segmentos'),
  usuario: (count: number) => pluralize(count, 'usuario', 'usuarios'),
  mes: (count: number) => pluralize(count, 'mes', 'meses'),
  dia: (count: number) => pluralize(count, 'día', 'días'),
  regla: (count: number) => pluralize(count, 'regla', 'reglas')
} as const

// ============================================================================
// Helpers de formato para badges y estados
// ============================================================================

/**
 * Obtiene el label y clase CSS para un estado de campaña.
 */
export function getCampaignStatusDisplay(status: string): { label: string; badge: string } {
  return {
    label: CAMPAIGN_STATUS_LABELS[status] ?? status,
    badge: CAMPAIGN_STATUS_BADGES[status] ?? 'bg-secondary'
  }
}

/**
 * Obtiene el label y clase CSS para un estado de progreso.
 */
export function getCampaignProgressStatusDisplay(status: string): { label: string; badge: string } {
  return {
    label: CAMPAIGN_PROGRESS_STATUS_LABELS[status] ?? status,
    badge: CAMPAIGN_PROGRESS_STATUS_BADGES[status] ?? 'bg-secondary'
  }
}

/**
 * Obtiene el label para un tipo de regla.
 */
export function getRuleKindLabel(kind: string): string {
  return RULE_KIND_LABELS[kind] ?? kind
}

/**
 * Obtiene el label para un scope de regla.
 */
export function getRuleScopeLabel(scope: string): string {
  return RULE_SCOPE_LABELS[scope] ?? scope
}

/**
 * Obtiene el label para un operador.
 */
export function getOperatorLabel(operator: string): string {
  return OPERATOR_LABELS[operator] ?? operator
}
