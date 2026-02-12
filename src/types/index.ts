/* ===== TIPOS ===== */

/** Candidatos */
export interface Candidato {
  id_candidato: number
  ct: string
  // Nuevo identificador POP
  pop?: string
  candidato: string
  // Fecha de nacimiento del candidato
  fecha_nacimiento?: string | null
  mes: string
  efc: string
  seg_gmm: number
  seg_vida: number
  eliminado: boolean
  fecha_eliminacion?: string
  usuario_creador: string
  usuario_que_actualizo?: string
  fecha_de_creacion?: string
  ultima_actualizacion?: string
  // Nueva fecha manual definida por el usuario (fecha de creación de CT)
  fecha_creacion_ct?: string
  // Nueva fecha manual definida por el usuario (fecha de creación de POP)
  fecha_creacion_pop?: string
  // Mes de conexión (YYYY-MM) asociado al candidato
  mes_conexion?: string | null
  // Contador derivado días desde POP (no necesariamente persistido)
  dias_desde_pop?: number
  // Campo derivado (no necesariamente persistido). Si se persiste agregar columna BD.
  proceso?: string
  // Campos snapshot
  periodo_para_registro_y_envio_de_documentos?: string
  capacitacion_cedula_a1?: string
  fecha_tentativa_de_examen?: string
  periodo_para_ingresar_folio_oficina_virtual?: string
  periodo_para_playbook?: string
  pre_escuela_sesion_unica_de_arranque?: string
  fecha_limite_para_presentar_curricula_cdp?: string
  inicio_escuela_fundamental?: string
  // Nuevo: email del agente (candidato) para creación de usuario
  email_agente?: string
  // Estado de completado por etapa (MES/EFC) con metadatos de usuario/fecha
  etapas_completadas?: {
    [etapa: string]: { completed: boolean; by?: { email?: string; nombre?: string }; at?: string }
  }
  // Meta devuelta por backend al crear (no persistida): estado creación usuario agente
  _agente_meta?: {
    created?: boolean
    existed?: boolean
    passwordTemporal?: string
    correoEnviado?: boolean
    correoError?: string
    error?: string
  }
}

/** Usuarios */
export interface Usuario {
  id: number
  email: string
  nombre?: string
  rol: string
  activo: boolean
  must_change_password?: boolean
  id_auth?: string
  is_desarrollador?: boolean
  codigo_agente?: string
}

export type IntegrationProviderKey = 'google' | 'zoom' | 'teams'
export type ManualMeetingProvider = 'zoom' | 'teams'
export type MeetingProvider = 'google_meet' | 'zoom' | 'teams'

export interface ManualMeetingSettings {
  meetingUrl: string
  meetingId?: string | null
  meetingPassword?: string | null
}

export type ZoomManualSettings = ManualMeetingSettings
export type TeamsManualSettings = ManualMeetingSettings

export interface AgendaDeveloper {
  id: number
  email: string
  nombre?: string | null
  rol: string
  activo: boolean
  is_desarrollador: boolean
  id_auth?: string | null
  tokens: IntegrationProviderKey[]
  zoomManual?: ZoomManualSettings | null
  zoomLegacy?: boolean
  teamsManual?: TeamsManualSettings | null
  googleMeetAutoEnabled?: boolean
}

export interface AgendaBusySourceDetail {
  source: 'calendar' | 'agenda' | 'planificacion'
  title?: string | null
  descripcion?: string | null
  provider?: IntegrationProviderKey | MeetingProvider | null
  prospectoId?: number | null
  citaId?: number | null
  planId?: number | null
}

export interface AgendaBusySlot {
  usuarioId: number
  usuarioAuthId: string
  inicio: string
  fin: string
  source: 'calendar' | 'agenda' | 'planificacion'
  provider?: IntegrationProviderKey | MeetingProvider | null
  title?: string | null
  descripcion?: string | null
  prospectoId?: number | null
  citaId?: number | null
  planId?: number | null
  sourceDetails?: AgendaBusySourceDetail[]
}

export interface AgendaSlotsResponse {
  range: { desde?: string | null; hasta?: string | null }
  busy: AgendaBusySlot[]
  missingAuth: number[]
  planificaciones?: AgendaPlanificacionSummary[]
  warnings?: string[]
}

export interface AgendaParticipant {
  id: number | null
  idAuth: string | null
  email?: string | null
  nombre?: string | null
}

export interface AgendaCita {
  id: number
  prospectoId: number | null
  prospectoNombre?: string | null
  prospectoEmail?: string | null
  agente: AgendaParticipant
  supervisor?: AgendaParticipant | null
  inicio: string
  fin: string
  meetingUrl: string
  meetingProvider: MeetingProvider
  externalEventId?: string | null
  estado: 'confirmada' | 'cancelada'
  createdAt?: string | null
  updatedAt?: string | null
}

/** CedulaA1 */
export interface CedulaA1 {
  id: number
  mes: string
  periodo_para_registro_y_envio_de_documentos?: string
  capacitacion_cedula_a1?: string
}

/** Efc */
export interface Efc {
  id: number
  efc: string
  periodo_para_ingresar_folio_oficina_virtual?: string
  periodo_para_playbook?: string
  pre_escuela_sesion_unica_de_arranque?: string
  fecha_limite_para_presentar_curricula_cdp?: string
  inicio_escuela_fundamental?: string
}

/** Auditoría */
export interface Auditoria {
  id: number
  fecha: string
  usuario: string
  accion: string
  tabla_afectada: string
  id_registro: number
  snapshot: unknown
}

/** Parametro (estructura genérica para tabla Parametros) */
export interface Parametro {
  id: number
  tipo: string
  clave?: string
  valor?: string | number | boolean | null
  descripcion?: string | null
  actualizado_por?: string | null
  actualizado_en?: string | null
}

/* ===== Fase 2: Prospectos y Planificación ===== */
export type ProspectoEstado = 'pendiente' | 'seguimiento' | 'con_cita' | 'descartado' | 'ya_es_cliente'

export interface Prospecto {
  id: number
  agente_id: number
  anio: number
  semana_iso: number
  nombre: string
  telefono?: string | null
  email?: string | null
  notas?: string | null
  estado: ProspectoEstado
  // Ahora timestamp (ISO) con fecha y hora
  fecha_cita?: string | null
  created_at?: string
  updated_at?: string
}

export interface BloquePlanificacion {
  day: number // 0=Lunes ISO? (usaremos 0=lunes..6=domingo para consistencia)
  hour: string // '05'..'23'
  activity: 'PROSPECCION' | 'CITAS' | 'SMNYL'
  origin?: 'auto' | 'manual'
  // Metadata opcional cuando proviene de una cita de prospecto
  prospecto_id?: number
  prospecto_nombre?: string
  prospecto_estado?: ProspectoEstado
  notas?: string // para bloque manual PROSPECCION o SMNYL (motivo)
  confirmada?: boolean // para bloques tipo SMNYL/Cita
  agenda_cita_id?: number | null
}

export interface PlanificacionSemana {
  id: number
  agente_id: number
  anio: number
  semana_iso: number
  prima_anual_promedio: number
  porcentaje_comision: number
  bloques: BloquePlanificacion[]
  created_at?: string
  updated_at?: string
}

export interface AgendaPlanBlock extends BloquePlanificacion {
  fecha: string
  fin: string
  source?: 'auto' | 'manual'
}

export interface AgendaPlanificacionSummary {
  agenteId: number
  planId?: number | null
  semanaIso: number
  anio: number
  bloques: AgendaPlanBlock[]
}

export interface AgendaProspectoOption {
  id: number
  nombre: string
  email: string | null
  estado: ProspectoEstado
  telefono?: string | null
  semana_iso?: number
  anio?: number
  fecha_cita?: string | null
}

/* ===== Fase 3: Productos parametrizados ===== */
export type TipoProducto = string
export type MonedaPoliza = 'MXN' | 'USD' | 'UDI'
export interface ProductType {
  id: string
  code: string
  name: string
  description?: string | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface ProductoParametro {
  id: string
  nombre_comercial: string
  tipo_producto?: TipoProducto | null
  product_type_id?: string | null
  product_type?: ProductType | null
  moneda?: MonedaPoliza | null
  duracion_anios?: number | null
  condicion_sa_tipo?: string | null
  sa_min?: number | null
  sa_max?: number | null
  condicion_edad_tipo?: string | null
  edad_min?: number | null
  edad_max?: number | null
  anio_1_percent?: number | null
  anio_2_percent?: number | null
  anio_3_percent?: number | null
  anio_4_percent?: number | null
  anio_5_percent?: number | null
  anio_6_percent?: number | null
  anio_7_percent?: number | null
  anio_8_percent?: number | null
  anio_9_percent?: number | null
  anio_10_percent?: number | null
  anio_11_plus_percent?: number | null
  puntos_multiplicador?: number
  activo: boolean
  creado_por?: string | null
  creado_at?: string
}

export interface Segment {
  id: string
  name: string
  description?: string | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface UserSegmentAssignment {
  usuario_id: number
  segment_id: string
  assigned_at: string | null
  assigned_by: number | null
  segment?: Segment | null
}

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'archived'
export type CampaignProgressStatus = 'not_eligible' | 'eligible' | 'completed'

export interface Campaign {
  id: string
  slug: string
  name: string
  summary?: string | null
  description?: string | null
  status: CampaignStatus
  active_range: string
  primary_segment_id?: string | null
  notes?: string | null
  created_by?: number | null
  created_at?: string
  updated_at?: string
}

export interface CampaignCreateInput {
  slug: string
  name: string
  summary?: string | null
  description?: string | null
  status?: CampaignStatus
  active_range: string
  primary_segment_id?: string | null
  notes?: string | null
  created_by?: number | null
}

export type CampaignRuleScope = 'eligibility' | 'goal'
export type CampaignRuleKind =
  | 'ROLE'
  | 'SEGMENT'
  | 'COUNT_POLICIES'
  | 'TOTAL_PREMIUM'
  | 'RC_COUNT'
  | 'INDEX_THRESHOLD'
  | 'TENURE_MONTHS'
  | 'METRIC_CONDITION'
  | 'CUSTOM_SQL'

export interface CampaignRule {
  id: string
  campaign_id: string
  scope: CampaignRuleScope
  rule_kind: CampaignRuleKind
  config: Record<string, unknown>
  priority: number
  description?: string | null
  logical_group?: number // Groups rules that are evaluated together with AND
  logical_operator?: 'AND' | 'OR' // Operator to combine with next rule (OR separates groups)
  created_at?: string
  updated_at?: string
}

export interface CampaignRuleEvaluationResult {
  id: string
  passed: boolean
  scope: CampaignRuleScope
  kind: CampaignRuleKind
  description?: string | null
  weight?: number | null
  details?: Record<string, unknown> | null
}

export interface CampaignReward {
  id: string
  campaign_id: string
  title: string
  description?: string | null
  is_accumulative: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export interface CampaignSegmentLink {
  campaign_id: string
  segment_id: string
  sort_order: number
}

export interface CampaignSegmentsMeta {
  primary: Segment | null
  additional: Segment[]
}

export interface CampaignCacheMeta {
  fromCache: boolean
  snapshotEvaluatedAt: string | null
}

export interface UserCampaignListItem {
  campaign: Campaign
  segments: CampaignSegmentsMeta
  evaluation: CampaignEvaluationResult
  cache: CampaignCacheMeta
}

export interface UserCampaignDetail extends UserCampaignListItem {
  rewards: CampaignReward[]
}

export interface CampaignProgressSnapshot {
  id: string
  campaign_id: string
  usuario_id: number
  eligible: boolean
  progress: number
  status: CampaignProgressStatus
  metrics?: Record<string, unknown> | null
  evaluated_at: string
  created_at?: string
  updated_at?: string
}

export interface CampaignProgressCounts {
  total: number
  eligibleTotal: number
  completed: number
  active: number
  blocked: number
  notEligible: number
  [status: string]: number
}

export interface CampaignProgressSummary {
  campaignId: string
  total: number
  eligibleTotal: number
  completedTotal: number
  statusCounts: Record<string, number>
  progressCounts: CampaignProgressCounts
}

export interface CampaignEvaluationMetrics {
  polizas?: {
    total?: number
    vigentes?: number
    anuladas?: number
    prima_total_mxn?: number
    prima_vigente_mxn?: number
    prima_promedio_mxn?: number
    comision_base_mxn?: number
    ingresos_mxn?: number
    puntos_totales?: number
    momentum_vita?: number
    ultima_emision?: string | null
    ultima_cancelacion?: string | null
    ultima_actualizacion?: string | null
  }
  cancelaciones?: {
    indice_limra?: number | null
    indice_igc?: number | null
    momentum_neto?: number | null
  }
  rc?: {
    prospectos_total?: number
    reclutas_calidad?: number
    prospectos_con_cita?: number
    prospectos_seguimiento?: number
    prospectos_descartados?: number
    polizas_total?: number
    polizas_vigentes?: number
    polizas_anuladas?: number
    rc_vigencia?: number | null
    permanencia?: number | null
    reclutas_calidad_ratio?: number | null
  }
  candidatos?: {
    total?: number
    activos?: number
    eliminados?: number
    ultimo_mes_conexion?: string | null
  }
  planificacion?: {
    planes_total?: number
    ultima_semana?: string | null
    ultima_actualizacion?: string | null
    prima_promedio?: number | null
    porcentaje_comision?: number | null
  }
  clientes?: {
    total?: number
    nuevos_30_dias?: number
    nuevos_90_dias?: number
    ultima_alta?: string | null
  }
  tenure_meses?: number | null
  datasets?: Record<string, Record<string, unknown>>
  meta?: {
    fingerprint?: string
    cached_at?: string
    ruleResults?: CampaignRuleEvaluationResult[]
  }
}

export interface CampaignEvaluationResult {
  eligible: boolean
  progress: number
  status: CampaignProgressStatus
  metrics: CampaignEvaluationMetrics
  ruleResults: CampaignRuleEvaluationResult[]
}

export interface CampaignEvaluationContext {
  usuarioRol?: string | null
  segmentIds?: string[]
  segmentSlugs?: string[]
}

/* ===== Configuración de puntos ===== */
export type ClasificacionPuntos = 'CERO' | 'SIMPLE' | 'MEDIO' | 'DOBLE' | 'TRIPLE'

export interface PuntosThreshold {
  id: string
  tipo_producto: TipoProducto
  umbral_min: number
  umbral_max: number | null
  puntos: number
  clasificacion: ClasificacionPuntos
  descripcion?: string | null
  orden: number
  activo: boolean
  creado_at?: string
  updated_at?: string
}
