/**
 * Componente: Embudo visual de candidatos
 * Muestra distribución por fase y permite filtrar al hacer click
 */

'use client'

import { useMemo } from 'react'
import type { Candidato } from '@/types'
import type { PhaseKey } from '@/lib/candidatePhases'
import { PHASE_CALENDAR_THEME } from '@/lib/candidatePhases'
import { calculateFunnelData } from '@/lib/candidateFunnelUtils'

interface CandidateFunnelProps {
  candidatos: Candidato[]
  selectedPhase: PhaseKey | null
  onPhaseClick: (phase: PhaseKey | null) => void
}

export default function CandidateFunnel({ candidatos, selectedPhase, onPhaseClick }: CandidateFunnelProps) {
  const funnelData = useMemo(() => calculateFunnelData(candidatos), [candidatos])
  
  // Calcular ancho máximo para escalar las barras
  const maxCount = Math.max(...funnelData.phases.map(p => p.count), 1)
  
  return (
    <div className="card shadow-sm">
      <div className="card-header bg-primary text-white d-flex align-items-center gap-2">
        <span className="fs-5">📊</span>
        <span className="fw-semibold">EMBUDO DE CANDIDATOS</span>
      </div>
      <div className="card-body">
        <div className="small text-muted mb-3">
          Actualizado: {new Date().toLocaleDateString('es-MX', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          })}
        </div>
        
        {/* Barras del embudo */}
        {funnelData.phases.length === 0 ? (
          <div className="text-center py-4 text-muted">
            <div className="fs-1 mb-2">📊</div>
            <div>No hay datos para mostrar</div>
            <div className="small">Agrega candidatos para ver el embudo</div>
          </div>
        ) : (
          <div className="d-flex flex-column gap-2 mb-3">
            {funnelData.phases.map(({ phase, count }) => {
            const theme = PHASE_CALENDAR_THEME[phase]
            const widthPercent = (count / maxCount) * 100
            const isSelected = selectedPhase === phase
            const isDisabled = count === 0
            
            return (
              <button
                key={phase}
                type="button"
                disabled={isDisabled}
                onClick={() => onPhaseClick(phase)}
                className={`btn text-start p-0 border-0 ${isDisabled ? '' : 'funnel-bar'}`}
                style={{ cursor: isDisabled ? 'default' : 'pointer' }}
              >
                <div 
                  className={`d-flex align-items-center justify-content-between px-3 py-2 rounded transition-all ${
                    isSelected ? 'funnel-bar-active' : ''
                  }`}
                  style={{
                    backgroundColor: isDisabled ? '#e9ecef' : theme.color,
                    width: isDisabled ? '100%' : `${Math.max(widthPercent, 15)}%`,
                    minWidth: '200px',
                    opacity: isDisabled ? 0.4 : (isSelected ? 1 : 0.85),
                    color: isDisabled ? '#6c757d' : '#ffffff',
                    fontWeight: isSelected ? 600 : 500,
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 0 3px rgba(13, 110, 253, 0.25)' : 'none'
                  }}
                >
                  <span className="d-flex align-items-center gap-2">
                    <span>{theme.icon}</span>
                    <span>{theme.label}</span>
                  </span>
                  <span className="badge bg-dark bg-opacity-25 ms-2">{count}</span>
                </div>
              </button>
            )
          })}
          </div>
        )}
        
        {/* Tasa de conversión */}
        {funnelData.phases.length > 0 && (
          <div className="border-top pt-3 mt-3">
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted small">Tasa de conversión:</span>
              <span className="fw-semibold text-success">
                {funnelData.conversionRate.toFixed(1)}%
                <span className="text-muted small ms-1">
                  ({funnelData.agentsCount}/{funnelData.total} agentes)
                </span>
              </span>
            </div>
          </div>
        )}
        
        {/* Botón para limpiar filtro */}
        {selectedPhase && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onPhaseClick(null)}
              className="btn btn-sm btn-outline-secondary w-100"
            >
              ✕ Limpiar filtro
            </button>
          </div>
        )}
      </div>
      
      <style jsx>{`
        .funnel-bar:hover {
          transform: translateX(4px);
        }
        .funnel-bar-active {
          transform: translateX(8px) !important;
        }
        .transition-all {
          transition: all 0.2s ease;
        }
      `}</style>
    </div>
  )
}
