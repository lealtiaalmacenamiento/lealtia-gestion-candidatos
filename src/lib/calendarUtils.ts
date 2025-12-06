/**
 * Utilidades para generar calendarios mensuales
 * Usado para visualizar etapas de candidatos en formato calendario
 */

import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CandidateEvent } from './candidatePhases'

export interface MonthCalendarData {
  monthKey: string // YYYY-MM
  monthLabel: string // "Enero 2025"
  weeks: CalendarWeek[]
  events: CandidateEvent[]
}

export interface CalendarWeek {
  days: CalendarDay[]
}

export interface CalendarDay {
  date: Date | null // null para celdas vacías
  day: number // 1-31
  isCurrentMonth: boolean
  events: CandidateEvent[]
}

/**
 * Agrupa eventos por mes (YYYY-MM)
 */
export function groupEventsByMonth(events: CandidateEvent[]): Map<string, CandidateEvent[]> {
  const grouped = new Map<string, CandidateEvent[]>()
  
  for (const event of events) {
    const monthKey = format(event.date, 'yyyy-MM')
    const existing = grouped.get(monthKey) || []
    existing.push(event)
    grouped.set(monthKey, existing)
  }
  
  return grouped
}

/**
 * Genera estructura de calendario para un mes específico
 * con eventos marcados en los días correspondientes
 */
export function generateMonthCalendar(
  year: number,
  month: number, // 0-11 (enero = 0)
  events: CandidateEvent[]
): MonthCalendarData {
  const date = new Date(year, month, 1)
  const monthKey = format(date, 'yyyy-MM')
  const monthLabel = format(date, 'MMMM yyyy', { locale: es })
  
  const firstDay = startOfMonth(date)
  const lastDay = endOfMonth(date)
  
  // Determinar día de la semana del primer día (0 = domingo, 1 = lunes, etc.)
  const startDayOfWeek = getDay(firstDay)
  
  // Calcular días previos necesarios (para completar primera semana)
  // Si el mes empieza en domingo (0), necesitamos 0 días previos
  // Si empieza en lunes (1), necesitamos 1 día previo, etc.
  const daysBeforeMonth = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1
  
  const weeks: CalendarWeek[] = []
  let currentWeek: CalendarDay[] = []
  
  // Agregar días vacíos antes del mes
  for (let i = 0; i < daysBeforeMonth; i++) {
    currentWeek.push({
      date: null,
      day: 0,
      isCurrentMonth: false,
      events: []
    })
  }
  
  // Agregar todos los días del mes
  const allDaysInMonth = eachDayOfInterval({ start: firstDay, end: lastDay })
  
  for (const dayDate of allDaysInMonth) {
    const dayNum = dayDate.getDate()
    
    // Filtrar eventos de este día específico
    const dayEvents = events.filter(e => {
      return e.date.getFullYear() === dayDate.getFullYear() &&
             e.date.getMonth() === dayDate.getMonth() &&
             e.date.getDate() === dayDate.getDate()
    })
    
    currentWeek.push({
      date: dayDate,
      day: dayNum,
      isCurrentMonth: true,
      events: dayEvents
    })
    
    // Si completamos una semana (7 días), agregar a weeks
    if (currentWeek.length === 7) {
      weeks.push({ days: currentWeek })
      currentWeek = []
    }
  }
  
  // Completar última semana con días vacíos
  while (currentWeek.length > 0 && currentWeek.length < 7) {
    currentWeek.push({
      date: null,
      day: 0,
      isCurrentMonth: false,
      events: []
    })
  }
  
  if (currentWeek.length > 0) {
    weeks.push({ days: currentWeek })
  }
  
  return {
    monthKey,
    monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), // Capitalizar
    weeks,
    events
  }
}

/**
 * Genera calendarios solo para los meses que tienen eventos
 * Devuelve array ordenado cronológicamente
 */
export function generateCalendarsForEvents(events: CandidateEvent[]): MonthCalendarData[] {
  if (events.length === 0) return []
  
  const grouped = groupEventsByMonth(events)
  const calendars: MonthCalendarData[] = []
  
  // Ordenar meses cronológicamente
  const sortedMonthKeys = Array.from(grouped.keys()).sort()
  
  for (const monthKey of sortedMonthKeys) {
    const [yearStr, monthStr] = monthKey.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10) - 1 // Convertir a 0-indexed
    
    const monthEvents = grouped.get(monthKey) || []
    const calendar = generateMonthCalendar(year, month, monthEvents)
    
    calendars.push(calendar)
  }
  
  return calendars
}

/**
 * Obtiene lista única de fases presentes en los eventos
 * Para generar leyenda automática
 */
export function getUniquePhasesFromEvents(events: CandidateEvent[]): Set<string> {
  return new Set(events.map(e => e.phase))
}
