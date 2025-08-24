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
  // Campos snapshot
  periodo_para_registro_y_envio_de_documentos?: string
  capacitacion_cedula_a1?: string
  fecha_tentativa_de_examen?: string
  periodo_para_ingresar_folio_oficina_virtual?: string
  periodo_para_playbook?: string
  pre_escuela_sesion_unica_de_arranque?: string
  fecha_limite_para_presentar_curricula_cdp?: string
  inicio_escuela_fundamental?: string
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
