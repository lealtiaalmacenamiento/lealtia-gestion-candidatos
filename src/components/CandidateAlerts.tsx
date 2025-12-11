/**
 * Componente: Alertas de vencimiento de fases
 * Muestra candidatos con fechas próximas a vencer (14 días) no completadas
 */

'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import type { Candidato } from '@/types'
import { getPhaseAlerts, formatDaysUntil, type UrgencyLevel } from '@/lib/candidateFunnelUtils'

interface CandidateAlertsProps {
  candidatos: Candidato[]
}

const URGENCY_STYLES: Record<UrgencyLevel, { icon: string; bgClass: string; textClass: string; borderClass: string }> = {
  critical: { 
    icon: '🔴', 
    bgClass: 'bg-danger bg-opacity-10', 
    textClass: 'text-danger',
    borderClass: 'border-danger'
  },
  urgent: { 
    icon: '🟠', 
    bgClass: 'bg-warning bg-opacity-10', 
    textClass: 'text-warning',
    borderClass: 'border-warning'
  },
  warning: { 
    icon: '🟡', 
    bgClass: 'bg-warning bg-opacity-10', 
    textClass: 'text-warning',
    borderClass: 'border-warning'
  },
  info: { 
    icon: '🔵', 
    bgClass: 'bg-info bg-opacity-10', 
    textClass: 'text-info',
    borderClass: 'border-info'
  }
}

export default function CandidateAlerts({ candidatos }: CandidateAlertsProps) {
  const alerts = useMemo(() => getPhaseAlerts(candidatos), [candidatos])
  
  // Limitar a las primeras 10 alertas más críticas
  const topAlerts = alerts.slice(0, 10)
  
  return (
    <div className="card shadow-sm">
      <div className="card-header bg-warning text-dark d-flex align-items-center gap-2">
        <span className="fs-5">⚠️</span>
        <span className="fw-semibold">ALERTAS DE VENCIMIENTO</span>
      </div>
      <div className="card-body">
        <div className="small text-muted mb-3">
          Próximos 14 días
        </div>
        
        {topAlerts.length === 0 ? (
          <div className="text-center py-4 text-muted">
            <div className="fs-1 mb-2">✅</div>
            <div>Sin alertas pendientes</div>
            <div className="small">Todas las fases están al día</div>
          </div>
        ) : (
          <div className="d-flex flex-column gap-3" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {topAlerts.map((alert, idx) => {
              const style = URGENCY_STYLES[alert.urgency]
              
              return (
                <div 
                  key={`${alert.candidato.id_candidato}-${alert.fieldKey}`}
                  className={`border ${style.borderClass} ${style.bgClass} rounded-3 p-3`}
                >
                  <div className="d-flex align-items-start gap-2">
                    <span className="fs-5">{style.icon}</span>
                    <div className="flex-grow-1">
                      <div className="fw-semibold mb-1">
                        {alert.candidato.candidato || 'Sin nombre'}
                      </div>
                      <div className="small text-muted mb-2">
                        {alert.phaseLabel}
                      </div>
                      <div className={`small ${style.textClass} fw-semibold mb-2`}>
                        ⏰ {formatDaysUntil(alert.daysUntil)}
                      </div>
                      <div className="small text-muted mb-2">
                        Vence: {alert.date.toLocaleDateString('es-MX', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </div>
                      <Link 
                        href={`/consulta_candidatos?highlight=${alert.candidato.id_candidato}`}
                        className="btn btn-sm btn-outline-primary"
                      >
                        Ver candidato →
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
            
            {alerts.length > 10 && (
              <div className="text-center small text-muted py-2">
                Mostrando 10 de {alerts.length} alertas
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
