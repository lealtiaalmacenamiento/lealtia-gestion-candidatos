/**
 * Constantes y utilidades para fases del proceso de candidatos
 * Usadas para el calendario visual en la ficha PDF y embudo de candidatos
 */
import { monthIndexFromText, parseOneDateWithAnchor, parseRangeWithAnchor, type Anchor } from './proceso'

export type PhaseKey =
  | 'prospeccion'
  | 'registro'
  | 'capacitacion_a1'
  | 'examen'
  | 'folio_ov'
  | 'playbook'
  | 'pre_escuela'
  | 'curricula_cdp'
  | 'escuela_fundamental'
  | 'agente'

export interface PhaseTheme {
  label: string
  color: string // Hex color para círculo
  icon: string // Emoji o símbolo simple
}

/**
 * Tema visual por fase
 * Colores con contraste > 4.5:1 para impresión
 */
export const PHASE_CALENDAR_THEME: Record<PhaseKey, PhaseTheme> = {
  prospeccion: {
    label: 'Prospección',
    color: '#8B5CF6', // Púrpura
    icon: '🔍'
  },
  registro: {
    label: 'Registro y envío',
    color: '#3B82F6', // Azul
    icon: '📝'
  },
  capacitacion_a1: {
    label: 'Capacitación A1',
    color: '#10B981', // Verde
    icon: '📚'
  },
  examen: {
    label: 'Examen',
    color: '#EF4444', // Rojo brillante
    icon: '📋'
  },
  folio_ov: {
    label: 'Folio Oficina Virtual',
    color: '#F59E0B', // Naranja/Ámbar
    icon: '🏢'
  },
  playbook: {
    label: 'Playbook',
    color: '#EC4899', // Rosa
    icon: '📖'
  },
  pre_escuela: {
    label: 'Pre-escuela',
    color: '#8B5CF6', // Púrpura
    icon: '🎓'
  },
  curricula_cdp: {
    label: 'Currícula CDP',
    color: '#000000ff', // Turquesa/Teal
    icon: '📄'
  },
  escuela_fundamental: {
    label: 'Escuela Fundamental',
    color: '#84CC16', // Verde lima
    icon: '🎯'
  },
  agente: {
    label: 'Agente',
    color: '#22C55E', // Verde éxito
    icon: '✅'
  }
}

export interface CandidateEvent {
  phase: PhaseKey
  date: Date
  completed: boolean
  label?: string
}

/**
 * Extrae eventos del candidato desde etapas_completadas y fechas de columnas
 */
export function extractCandidateEvents(candidato: {
  fecha_creacion_pop?: string
  fecha_creacion_ct?: string
  periodo_para_registro_y_envio_de_documentos?: string
  capacitacion_cedula_a1?: string
  fecha_tentativa_de_examen?: string
  periodo_para_ingresar_folio_oficina_virtual?: string
  periodo_para_playbook?: string
  pre_escuela_sesion_unica_de_arranque?: string
  fecha_limite_para_presentar_curricula_cdp?: string
  inicio_escuela_fundamental?: string
  etapas_completadas?: {
    [key: string]: { completed: boolean; at?: string }
  }
}): CandidateEvent[] {
  const events: CandidateEvent[] = []

  const deriveAnchor = (): Anchor => {
    const tryAnchorDate = (raw?: string | null): Date | null => {
      if (!raw) return null
      const trimmed = raw.trim()
      if (!trimmed) return null
      const isoMonth = trimmed.match(/^(\d{4})-(\d{2})$/)
      if (isoMonth) {
        const [, y, m] = isoMonth
        return new Date(Date.UTC(Number(y), Number(m) - 1, 1))
      }
      const isoDay = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (isoDay) {
        const [, y, m, d] = isoDay
        return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
      }
      const monthIdx = monthIndexFromText(trimmed)
      if (monthIdx) {
        const yearMatch = trimmed.match(/(\d{4})/)
        const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear()
        return new Date(Date.UTC(year, monthIdx - 1, 1))
      }
      const parsed = new Date(trimmed)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    const anchorDate =
      tryAnchorDate((candidato as any).mes_conexion) ||
      tryAnchorDate((candidato as any).mes) ||
      tryAnchorDate((candidato as any).efc) ||
      tryAnchorDate(candidato.fecha_tentativa_de_examen) ||
      tryAnchorDate(candidato.fecha_creacion_ct) ||
      tryAnchorDate(candidato.fecha_creacion_pop) ||
      new Date()

    return {
      anchorMonth: anchorDate.getUTCMonth() + 1,
      anchorYear: anchorDate.getUTCFullYear()
    }
  }

  const anchor = deriveAnchor()

  // Helper para parsear fechas en múltiples formatos con anclaje (MES/EFC)
  const parseDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null
    return parseOneDateWithAnchor(dateStr, anchor)
  }
  
  // Debug: log de datos recibidos
  if (typeof window !== 'undefined') {
    console.log('[extractCandidateEvents] Datos recibidos:', {
      fecha_creacion_pop: candidato.fecha_creacion_pop,
      fecha_creacion_ct: candidato.fecha_creacion_ct,
      periodo_para_registro_y_envio_de_documentos: candidato.periodo_para_registro_y_envio_de_documentos,
      capacitacion_cedula_a1: candidato.capacitacion_cedula_a1,
      fecha_tentativa_de_examen: candidato.fecha_tentativa_de_examen,
      periodo_para_ingresar_folio_oficina_virtual: candidato.periodo_para_ingresar_folio_oficina_virtual,
      periodo_para_playbook: candidato.periodo_para_playbook,
      pre_escuela_sesion_unica_de_arranque: candidato.pre_escuela_sesion_unica_de_arranque,
      fecha_limite_para_presentar_curricula_cdp: candidato.fecha_limite_para_presentar_curricula_cdp,
      inicio_escuela_fundamental: candidato.inicio_escuela_fundamental
    })
  }

  // 1. Prospección (POP o CT como fallback)
  const popDate = parseDate(candidato.fecha_creacion_pop) || parseDate(candidato.fecha_creacion_ct)
  if (popDate) {
    events.push({
      phase: 'prospeccion',
      date: popDate,
      completed: true,
      label: 'Inicio prospección'
    })
  }

  // Helper para extraer rango de fechas y generar evento por cada día
  const addEventRange = (dateStr: string | undefined, phase: PhaseKey, label: string, etapaKey?: string) => {
    if (!dateStr) return

    const completedInfo = etapaKey ? candidato.etapas_completadas?.[etapaKey] : undefined

    const range = parseRangeWithAnchor(dateStr, anchor)
    if (range) {
      const oneDay = 24 * 60 * 60 * 1000
      for (let ts = range.start.getTime(), i = 0; ts <= range.end.getTime(); ts += oneDay, i++) {
        events.push({
          phase,
          date: new Date(ts),
          completed: !!completedInfo?.completed,
          label: `${label} (día ${i + 1})`
        })
      }
      return
    }

    const firstDate = parseDate(dateStr)
    if (!firstDate) return

    events.push({
      phase,
      date: firstDate,
      completed: !!completedInfo?.completed,
      label
    })
  }

  // 2. Registro y envío de documentos
  addEventRange(
    candidato.periodo_para_registro_y_envio_de_documentos,
    'registro',
    'Registro',
    'periodo_para_registro_y_envio_de_documentos'
  )

  // 3. Capacitación A1
  addEventRange(
    candidato.capacitacion_cedula_a1,
    'capacitacion_a1',
    'Capacitación A1',
    'capacitacion_cedula_a1'
  )

  // 4. Examen
  const examenDate = parseDate(candidato.fecha_tentativa_de_examen)
  if (examenDate) {
    events.push({
      phase: 'examen',
      date: examenDate,
      completed: false, // No tiene checkbox de completado
      label: 'Examen'
    })
  }

  // 5. Folio Oficina Virtual
  addEventRange(
    candidato.periodo_para_ingresar_folio_oficina_virtual,
    'folio_ov',
    'Folio OV',
    'periodo_para_ingresar_folio_oficina_virtual'
  )

  // 6. Playbook
  addEventRange(
    candidato.periodo_para_playbook,
    'playbook',
    'Playbook',
    'periodo_para_playbook'
  )

  // 7. Pre-escuela
  addEventRange(
    candidato.pre_escuela_sesion_unica_de_arranque,
    'pre_escuela',
    'Pre-escuela',
    'pre_escuela_sesion_unica_de_arranque'
  )

  // 8. Currícula CDP
  addEventRange(
    candidato.fecha_limite_para_presentar_curricula_cdp,
    'curricula_cdp',
    'Currícula CDP',
    'fecha_limite_para_presentar_curricula_cdp'
  )

  // 9. Escuela Fundamental
  addEventRange(
    candidato.inicio_escuela_fundamental,
    'escuela_fundamental',
    'Escuela Fundamental',
    'inicio_escuela_fundamental'
  )

  // Debug: log de eventos extraídos
  if (typeof window !== 'undefined') {
    console.log('[extractCandidateEvents] Eventos extraídos:', events)
  }
  
  // Ordenar por fecha
  return events.sort((a, b) => a.date.getTime() - b.date.getTime())
}
