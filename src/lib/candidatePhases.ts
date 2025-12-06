/**
 * Constantes y utilidades para fases del proceso de candidatos
 * Usadas para el calendario visual en la ficha PDF
 */

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
    color: '#06B6D4', // Cyan brillante
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
    color: '#14B8A6', // Turquesa/Teal
    icon: '📄'
  },
  escuela_fundamental: {
    label: 'Escuela Fundamental',
    color: '#84CC16', // Verde lima
    icon: '🎯'
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

  // Mapa de meses en español
  const mesesMap: Record<string, number> = {
    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
    'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
    'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
  }

  // Helper para parsear fechas en múltiples formatos
  const parseDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null
    
    // Formato ISO (2025-10-21)
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const parsed = new Date(dateStr)
      return isNaN(parsed.getTime()) ? null : parsed
    }
    
    // Formato rango ISO (2025-01-06 a 2025-01-17)
    if (dateStr.includes(' a ') && /^\d{4}/.test(dateStr)) {
      const firstDate = dateStr.split(' a ')[0].trim()
      const parsed = new Date(firstDate)
      return isNaN(parsed.getTime()) ? null : parsed
    }
    
    // Formato español: "4 al 8 agosto", "18 al 29 agosto", "29 de agosto", "1 al 5 septiembre"
    const currentYear = new Date().getFullYear()
    
    // Patrón: "DD [al DD] [de] NOMBRE_MES"
    const match = dateStr.match(/(\d{1,2})(?:\s+al\s+\d{1,2})?\s+(?:de\s+)?(\w+)/i)
    if (match) {
      const day = parseInt(match[1], 10)
      const monthName = match[2].toLowerCase()
      const monthIndex = mesesMap[monthName]
      
      if (monthIndex !== undefined && day >= 1 && day <= 31) {
        return new Date(currentYear, monthIndex, day)
      }
    }
    
    return null
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
    
    const firstDate = parseDate(dateStr)
    if (!firstDate) return
    
    const completedInfo = etapaKey ? candidato.etapas_completadas?.[etapaKey] : undefined
    
    // Detectar si es un rango
    const rangeMatch = dateStr.match(/(\d{1,2})\s+al\s+(\d{1,2})\s+(?:de\s+)?(\w+)/i)
    
    if (rangeMatch) {
      // Es un rango: "4 al 8 agosto"
      const startDay = parseInt(rangeMatch[1], 10)
      const endDay = parseInt(rangeMatch[2], 10)
      const monthName = rangeMatch[3].toLowerCase()
      const monthIndex = mesesMap[monthName]
      const currentYear = new Date().getFullYear()
      
      if (monthIndex !== undefined) {
        // Agregar evento para cada día del rango
        for (let day = startDay; day <= endDay; day++) {
          events.push({
            phase,
            date: new Date(currentYear, monthIndex, day),
            completed: !!completedInfo?.completed,
            label: `${label} (día ${day - startDay + 1})`
          })
        }
      }
    } else {
      // Es una fecha simple
      events.push({
        phase,
        date: firstDate,
        completed: !!completedInfo?.completed,
        label
      })
    }
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
