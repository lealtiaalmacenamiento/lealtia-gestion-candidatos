/* ===== TIPOS ===== */

/** Candidatos */
export interface Candidato {
  id_candidato: number
  ct: string
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
export type ProspectoEstado = 'pendiente' | 'seguimiento' | 'con_cita' | 'descartado'

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
