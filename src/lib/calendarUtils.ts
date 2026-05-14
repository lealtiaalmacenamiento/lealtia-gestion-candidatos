/**
 * Utilidades para generar calendarios mensuales
 * Usado para visualizar etapas de candidatos en formato calendario
 *
 * NOTA: Todas las fechas de candidato se almacenan como UTC midnight (Date.UTC).
 * Para evitar desfases de zona horaria (p. ej. CDMX UTC-6 haría que el 1 de septiembre
 * apareciera como 31 de agosto) usamos getUTCDate/getUTCMonth/getUTCFullYear en todo
 * el proceso de agrupación y comparación de días.
 */

import { format } from 'date-fns'
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
 * Agrupa eventos por mes (YYYY-MM) usando UTC para evitar desfases de zona horaria.
 */
export function groupEventsByMonth(events: CandidateEvent[]): Map<string, CandidateEvent[]> {
  const grouped = new Map<string, CandidateEvent[]>()
  
  for (const event of events) {
    // Usar UTC para que "1 sep 00:00 UTC" no se convierta en "31 ago" en CDMX (UTC-6)
    const y = event.date.getUTCFullYear()
    const m = event.date.getUTCMonth() + 1
    const monthKey = `${y}-${String(m).padStart(2, '0')}`
    const existing = grouped.get(monthKey) || []
    existing.push(event)
    grouped.set(monthKey, existing)
  }
  
  return grouped
}

/**
 * Genera estructura de calendario para un mes específico
 * con eventos marcados en los días correspondientes.
 * Opera en UTC para que las fechas de candidato (UTC midnight) no se desplacen.
 */
export function generateMonthCalendar(
  year: number,
  month: number, // 0-11 (enero = 0)
  events: CandidateEvent[]
): MonthCalendarData {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  // Etiqueta del mes en español — se crea con hora local (no importa hora, solo el nombre)
  const monthLabel = format(new Date(year, month, 1), 'MMMM yyyy', { locale: es })

  // Días en el mes (UTC)
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  // Día de la semana del primer día en UTC (0 = domingo)
  const startDayOfWeek = new Date(Date.UTC(year, month, 1)).getUTCDay()

  // Celdas vacías antes del primer día (semanas L..D)
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
  for (let d = 1; d <= daysInMonth; d++) {
    const dayDateUTC = new Date(Date.UTC(year, month, d))

    // Comparar usando UTC para que los eventos (UTC midnight) coincidan con el día correcto
    const dayEvents = events.filter(e =>
      e.date.getUTCFullYear() === year &&
      e.date.getUTCMonth() === month &&
      e.date.getUTCDate() === d
    )
    
    currentWeek.push({
      date: dayDateUTC,
      day: d,
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
