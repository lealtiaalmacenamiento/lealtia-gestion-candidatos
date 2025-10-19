/* ===== TIPOS ===== */

/** Candidatos */
export interface Candidato {
  id_candidato: number
  ct: string
  // Nuevo identificador POP
  pop?: string
  candidato: string
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
}

export type IntegrationProviderKey = 'google' | 'zoom'
export type MeetingProvider = 'google_meet' | 'zoom' | 'teams'

export interface ZoomManualSettings {
  meetingUrl: string
  meetingId?: string | null
  meetingPassword?: string | null
}

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
}

export interface AgendaBusySlot {
  usuarioId: number
  usuarioAuthId: string
  inicio: string
  fin: string
}

export interface AgendaSlotsResponse {
  range: { desde?: string | null; hasta?: string | null }
  busy: AgendaBusySlot[]
  missingAuth: number[]
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

/* ===== Fase 3: Productos parametrizados ===== */
export type TipoProducto = 'VI' | 'GMM'
export type MonedaPoliza = 'MXN' | 'USD' | 'UDI'
export interface ProductoParametro {
  id: string
  nombre_comercial: string
  tipo_producto: TipoProducto
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
