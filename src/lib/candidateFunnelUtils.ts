/**
 * Utilidades para el embudo de candidatos y alertas de vencimiento
 */

import type { Candidato } from '@/types'
import type { PhaseKey } from './candidatePhases'

/**
 * Orden secuencial de fases en el embudo
 */
export const PHASE_ORDER: PhaseKey[] = [
  'prospeccion',
  'registro',
  'capacitacion_a1',
  'examen',
  'folio_ov',
  'playbook',
  'pre_escuela',
  'curricula_cdp',
  'escuela_fundamental',
  'agente'
]

/**
 * Mapeo de columnas de candidatos a PhaseKey
 */
export const PHASE_FIELD_MAP: Record<PhaseKey, keyof Candidato | null> = {
  prospeccion: 'fecha_creacion_pop', // o fecha_creacion_ct como fallback
  registro: 'periodo_para_registro_y_envio_de_documentos',
  capacitacion_a1: 'capacitacion_cedula_a1',
  examen: 'fecha_tentativa_de_examen',
  folio_ov: 'periodo_para_ingresar_folio_oficina_virtual',
  playbook: 'periodo_para_playbook',
  pre_escuela: 'pre_escuela_sesion_unica_de_arranque',
  curricula_cdp: 'fecha_limite_para_presentar_curricula_cdp',
  escuela_fundamental: 'inicio_escuela_fundamental',
  agente: null // No tiene campo específico, se determina por etapas completadas
}

/**
 * Parsea una fecha en múltiples formatos
 */
export function parsePhaseDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null
  
  // Formato ISO (2025-10-21)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parsed = new Date(dateStr)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  
  // Formato DD/MM/YYYY
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10)
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1 // 0-indexed
    const year = parseInt(ddmmyyyyMatch[3], 10)
    const date = new Date(year, month, day)
    return isNaN(date.getTime()) ? null : date
  }
  
  // Formato español: "4 al 8 agosto", "29 de agosto", "12 de December"
  const mesesMap: Record<string, number> = {
    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
    'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
    'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11,
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  }
  
  const currentYear = new Date().getFullYear()
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

/**
 * Determina la fase actual de un candidato
 * Devuelve la primera fase que:
 * - Tiene fecha asignada
 * - La fecha es futura o es hoy
 * - O la fase anterior está completada pero esta NO
 */
export function getCurrentPhase(candidato: Candidato): PhaseKey | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const etapasCompletadas = candidato.etapas_completadas as Record<string, { completed: boolean }> | undefined
  
  for (const phase of PHASE_ORDER) {
    const fieldKey = PHASE_FIELD_MAP[phase]
    
    // Prospección: siempre tiene fase si existe el candidato
    if (phase === 'prospeccion') {
      const popDate = parsePhaseDate(candidato.fecha_creacion_pop as string) || 
                     parsePhaseDate(candidato.fecha_creacion_ct as string)
      if (popDate) {
        // Si tiene fecha de prospección, verificar si está completada
        const isCompleted = etapasCompletadas?.['fecha_creacion_pop']?.completed || 
                           etapasCompletadas?.['fecha_creacion_ct']?.completed
        if (!isCompleted) return 'prospeccion'
      }
      continue
    }
    
    if (!fieldKey) continue
    
    const dateStr = candidato[fieldKey] as string | undefined
    if (!dateStr) continue
    
    const phaseDate = parsePhaseDate(dateStr)
    if (!phaseDate) continue
    
    // Verificar si está completada
    const isCompleted = etapasCompletadas?.[fieldKey]?.completed === true
    
    // Si no está completada, esta es la fase actual
    if (!isCompleted) {
      return phase
    }
  }
  
  // Si todas están completadas, está en la última fase
  // Si llegó aquí, verificar si es agente
  const isAgent = requiredEtapas.every(k => !!etapasCompletadas?.[k as string]?.completed)
  if (isAgent) return 'agente'
  
  return 'escuela_fundamental'
}

// Claves de etapas requeridas para ser agente
const requiredEtapas: (keyof Candidato)[] = [
  'periodo_para_registro_y_envio_de_documentos',
  'capacitacion_cedula_a1',
  'periodo_para_ingresar_folio_oficina_virtual',
  'periodo_para_playbook',
  'pre_escuela_sesion_unica_de_arranque',
  'fecha_limite_para_presentar_curricula_cdp',
  'inicio_escuela_fundamental'
]

/**
 * Datos agregados del embudo por fase
 */
export interface FunnelPhaseData {
  phase: PhaseKey
  count: number
  percentage: number // Respecto al total de candidatos
}

/**
 * Calcula datos agregados del embudo
 */
export function calculateFunnelData(candidatos: Candidato[]): {
  phases: FunnelPhaseData[]
  conversionRate: number
  total: number
  agentsCount: number
} {
  if (candidatos.length === 0) {
    return { phases: [], conversionRate: 0, total: 0, agentsCount: 0 }
  }
  
  // Usar la constante requiredEtapas definida arriba
  
  // Contar candidatos por fase actual
  const phaseCounts = new Map<PhaseKey, number>()
  
  for (const phase of PHASE_ORDER) {
    phaseCounts.set(phase, 0)
  }
  
  // Contar candidatos que ya son agentes (todas las etapas completadas)
  let agentsCount = 0
  
  for (const candidato of candidatos) {
    // Verificar si todas las etapas están completadas
    const etapasCompletadas = candidato.etapas_completadas as Record<string, { completed: boolean }> | undefined
    const isAgent = requiredEtapas.every(k => !!etapasCompletadas?.[k as string]?.completed)
    
    if (isAgent) {
      agentsCount++
      phaseCounts.set('agente', (phaseCounts.get('agente') || 0) + 1)
      continue // Ya es agente, contado
    }
    
    const currentPhase = getCurrentPhase(candidato)
    if (currentPhase) {
      phaseCounts.set(currentPhase, (phaseCounts.get(currentPhase) || 0) + 1)
    }
  }
  
  // Calcular porcentajes
  const total = candidatos.length
  const phases: FunnelPhaseData[] = PHASE_ORDER.map(phase => ({
    phase,
    count: phaseCounts.get(phase) || 0,
    percentage: ((phaseCounts.get(phase) || 0) / total) * 100
  }))
  
  // Tasa de conversión: candidatos que llegaron a ser agentes / total
  const conversionRate = (agentsCount / total) * 100
  
  return { phases, conversionRate, total, agentsCount }
}

/**
 * Nivel de urgencia de una alerta
 */
export type UrgencyLevel = 'critical' | 'urgent' | 'warning' | 'info'

/**
 * Alerta de vencimiento de una fase
 */
export interface PhaseAlert {
  candidato: Candidato
  phase: PhaseKey
  phaseLabel: string
  date: Date
  daysUntil: number
  urgency: UrgencyLevel
  fieldKey: keyof Candidato
}

/**
 * Calcula días hasta una fecha (negativos si ya pasó)
 */
export function getDaysUntil(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(date)
  targetDate.setHours(0, 0, 0, 0)
  
  const diffMs = targetDate.getTime() - today.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Clasifica nivel de urgencia según días restantes
 */
export function getUrgencyLevel(daysUntil: number): UrgencyLevel {
  if (daysUntil < 0) return 'critical' // Vencido
  if (daysUntil <= 3) return 'urgent'   // 1-3 días
  if (daysUntil <= 7) return 'warning'  // 4-7 días
  if (daysUntil <= 14) return 'info'    // 8-14 días
  return 'info' // Más de 14 días (no debería mostrarse)
}

/**
 * Extrae alertas de vencimiento (próximos 14 días, no completadas)
 */
export function getPhaseAlerts(candidatos: Candidato[]): PhaseAlert[] {
  const alerts: PhaseAlert[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  for (const candidato of candidatos) {
    const etapasCompletadas = candidato.etapas_completadas as Record<string, { completed: boolean }> | undefined
    
    // Recorrer todas las fases excepto prospección (siempre tiene fecha pasada)
    for (const phase of PHASE_ORDER) {
      if (phase === 'prospeccion') continue
      
      const fieldKey = PHASE_FIELD_MAP[phase]
      if (!fieldKey) continue
      
      const dateStr = candidato[fieldKey] as string | undefined
      if (!dateStr) continue
      
      const phaseDate = parsePhaseDate(dateStr)
      if (!phaseDate) continue
      
      // Verificar si está completada
      const isCompleted = etapasCompletadas?.[fieldKey]?.completed === true
      if (isCompleted) continue
      
      // Calcular días hasta vencimiento
      const daysUntil = getDaysUntil(phaseDate)
      
      // Solo incluir si está dentro de 14 días o ya venció
      if (daysUntil <= 14) {
        const urgency = getUrgencyLevel(daysUntil)
        
        // Importar dinámicamente para evitar ciclo
        const phaseLabel = getPhaseLabelByKey(phase)
        
        alerts.push({
          candidato,
          phase,
          phaseLabel,
          date: phaseDate,
          daysUntil,
          urgency,
          fieldKey
        })
      }
    }
  }
  
  // Ordenar por urgencia (crítico primero) y luego por fecha
  alerts.sort((a, b) => {
    const urgencyOrder = { critical: 0, urgent: 1, warning: 2, info: 3 }
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    if (urgencyDiff !== 0) return urgencyDiff
    
    // Mismo nivel de urgencia: ordenar por fecha (más urgente primero)
    return a.date.getTime() - b.date.getTime()
  })
  
  return alerts
}

/**
 * Helper: obtener label de fase sin importar PHASE_CALENDAR_THEME
 * (para evitar dependencia circular)
 */
function getPhaseLabelByKey(phase: PhaseKey): string {
  const labels: Record<PhaseKey, string> = {
    prospeccion: 'Prospección',
    registro: 'Registro y envío',
    capacitacion_a1: 'Capacitación A1',
    examen: 'Examen',
    folio_ov: 'Folio Oficina Virtual',
    playbook: 'Playbook',
    pre_escuela: 'Pre-escuela',
    curricula_cdp: 'Currícula CDP',
    escuela_fundamental: 'Escuela Fundamental',
    agente: 'Agente'
  }
  return labels[phase]
}

/**
 * Formatea días restantes en texto legible
 */
export function formatDaysUntil(daysUntil: number): string {
  if (daysUntil < 0) {
    const daysPast = Math.abs(daysUntil)
    return `Vencido hace ${daysPast} día${daysPast === 1 ? '' : 's'}`
  }
  if (daysUntil === 0) return 'Vence hoy'
  if (daysUntil === 1) return 'Vence mañana'
  return `Vence en ${daysUntil} días`
}
