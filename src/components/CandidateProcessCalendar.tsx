/**
 * Componente de calendario para ficha de candidato en PDF
 * Muestra solo los meses con eventos/etapas del proceso
 */

import React from 'react'
import { View, Text, StyleSheet } from '@react-pdf/renderer'
import type { MonthCalendarData } from '../lib/calendarUtils'
import { PHASE_CALENDAR_THEME, type PhaseKey } from '../lib/candidatePhases'

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    marginBottom: 16
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1f2937'
  },
  calendarsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  monthContainer: {
    width: '48%',
    marginBottom: 12,
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    padding: 8
  },
  monthHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 6,
    textAlign: 'center',
    color: '#374151'
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 4,
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 2
  },
  weekday: {
    width: '14.28%',
    fontSize: 7,
    textAlign: 'center',
    color: '#6b7280',
    fontWeight: 'bold'
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2
  },
  dayCell: {
    width: '14.28%',
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  dayNumber: {
    fontSize: 8,
    color: '#374151'
  },
  dayCellEmpty: {
    opacity: 0
  },
  eventMarker: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2
  },
  legend: {
    marginTop: 16,
    padding: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 4
  },
  legendTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#374151'
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 4
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4
  },
  legendLabel: {
    fontSize: 8,
    color: '#4b5563'
  }
})

interface CandidateProcessCalendarProps {
  months: MonthCalendarData[]
}

export function CandidateProcessCalendar({ months }: CandidateProcessCalendarProps) {
  if (months.length === 0) {
    return null
  }

  // Obtener fases únicas presentes en los eventos
  const uniquePhases = new Set<PhaseKey>()
  for (const month of months) {
    for (const event of month.events) {
      uniquePhases.add(event.phase)
    }
  }

  const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calendario de Etapas del Proceso</Text>
      
      <View style={styles.calendarsGrid}>
        {months.map((month) => (
          <View key={month.monthKey} style={styles.monthContainer}>
            <Text style={styles.monthHeader}>{month.monthLabel}</Text>
            
            {/* Fila de días de la semana */}
            <View style={styles.weekdaysRow}>
              {weekdays.map((day, idx) => (
                <Text key={idx} style={styles.weekday}>{day}</Text>
              ))}
            </View>
            
            {/* Semanas del mes */}
            {month.weeks.map((week, weekIdx) => (
              <View key={weekIdx} style={styles.weekRow}>
                {week.days.map((day, dayIdx) => {
                  if (!day.isCurrentMonth || !day.date) {
                    return <View key={dayIdx} style={[styles.dayCell, styles.dayCellEmpty]} />
                  }
                  
                  const hasEvents = day.events.length > 0
                  const primaryEvent = day.events[0] // Mostrar primer evento si hay varios
                  
                  return (
                    <View key={dayIdx} style={styles.dayCell}>
                      <Text style={styles.dayNumber}>{day.day}</Text>
                      {hasEvents && primaryEvent && (
                        <View 
                          style={[
                            styles.eventMarker,
                            { backgroundColor: PHASE_CALENDAR_THEME[primaryEvent.phase].color }
                          ]} 
                        />
                      )}
                    </View>
                  )
                })}
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Leyenda de fases */}
      {uniquePhases.size > 0 && (
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Leyenda</Text>
          <View style={styles.legendItems}>
            {Array.from(uniquePhases).map((phase) => {
              const theme = PHASE_CALENDAR_THEME[phase]
              return (
                <View key={phase} style={styles.legendItem}>
                  <View 
                    style={[
                      styles.legendDot,
                      { backgroundColor: theme.color }
                    ]} 
                  />
                  <Text style={styles.legendLabel}>{theme.label}</Text>
                </View>
              )
            })}
          </View>
        </View>
      )}
    </View>
  )
}
