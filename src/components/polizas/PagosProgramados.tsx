// Componente: Tabla de pagos programados de una póliza
'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/format'

interface Pago {
  id: number
  poliza_id: number
  periodo_mes: string
  fecha_programada: string
  fecha_limite: string
  monto_programado: number
  monto_pagado: number | null
  fecha_pago_real: string | null
  estado: 'pendiente' | 'pagado' | 'vencido' | 'omitido'
  notas: string | null
  isOverdue?: boolean
  isDueSoon?: boolean
  diasRestantes?: number | null
}

interface PagosProgramadosProps {
  polizaId: string
  onPagoRegistrado?: () => void
}

export default function PagosProgramados({ polizaId, onPagoRegistrado }: PagosProgramadosProps) {
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPago, setSelectedPago] = useState<Pago | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetchPagos()
  }, [polizaId])

  const fetchPagos = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/polizas/${polizaId}/pagos`)
      const json = await res.json()
      
      if (res.ok) {
        setPagos(json.pagos || [])
      } else {
        console.error('Error cargando pagos:', json.error)
      }
    } catch (error) {
      console.error('Error fetching pagos:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarcarPagado = (pago: Pago) => {
    setSelectedPago(pago)
    setShowModal(true)
  }

  const getBadgeClass = (pago: Pago) => {
    if (pago.estado === 'pagado') return 'badge bg-success'
    if (pago.estado === 'vencido' || pago.isOverdue) return 'badge bg-danger'
    if (pago.isDueSoon) return 'badge bg-warning text-dark'
    if (pago.estado === 'pendiente') return 'badge bg-secondary'
    return 'badge bg-light text-dark'
  }

  const getBadgeText = (pago: Pago) => {
    if (pago.estado === 'pagado') return 'Pagado'
    if (pago.estado === 'vencido' || pago.isOverdue) return 'Vencido'
    if (pago.isDueSoon) return `Próximo (${pago.diasRestantes}d)`
    if (pago.estado === 'pendiente') return 'Pendiente'
    return pago.estado
  }

  if (loading) {
    return <div className="text-center py-4">Cargando pagos...</div>
  }

  if (!pagos.length) {
    return (
      <div className="alert alert-info">
        No hay pagos programados. Asegúrate de que la póliza tenga periodicidad configurada.
      </div>
    )
  }

  return (
    <div>
      <h5 className="mb-3">Pagos Programados</h5>
      
      <div className="table-responsive">
        <table className="table table-sm table-hover align-middle">
          <thead>
            <tr>
              <th>Periodo</th>
              <th>Fecha Límite</th>
              <th className="text-end">Monto</th>
              <th>Estado</th>
              <th className="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago) => (
              <tr key={pago.id}>
                <td>
                  {new Date(pago.periodo_mes).toLocaleDateString('es-MX', { 
                    year: 'numeric', 
                    month: 'long' 
                  })}
                </td>
                <td>
                  {new Date(pago.fecha_limite).toLocaleDateString('es-MX')}
                  {pago.isOverdue && (
                    <span className="text-danger ms-2">
                      <i className="bi bi-exclamation-triangle-fill"></i>
                    </span>
                  )}
                </td>
                <td className="text-end">
                  {pago.estado === 'pagado' && pago.monto_pagado 
                    ? formatCurrency(pago.monto_pagado)
                    : formatCurrency(pago.monto_programado)
                  }
                </td>
                <td>
                  <span className={getBadgeClass(pago)}>
                    {getBadgeText(pago)}
                  </span>
                </td>
                <td className="text-end">
                  {pago.estado === 'pendiente' && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => handleMarcarPagado(pago)}
                    >
                      Marcar Pagado
                    </button>
                  )}
                  {pago.estado === 'pagado' && (
                    <span className="text-muted small">
                      {new Date(pago.fecha_pago_real!).toLocaleDateString('es-MX')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal para marcar pago */}
      {showModal && selectedPago && (
        <ModalMarcarPago
          pago={selectedPago}
          onClose={() => {
            setShowModal(false)
            setSelectedPago(null)
          }}
          onSuccess={() => {
            fetchPagos()
            onPagoRegistrado?.()
            setShowModal(false)
            setSelectedPago(null)
          }}
        />
      )}
    </div>
  )
}

// Componente Modal para registrar pago
function ModalMarcarPago({ 
  pago, 
  onClose, 
  onSuccess 
}: { 
  pago: Pago
  onClose: () => void
  onSuccess: () => void
}) {
  const [montoPagado, setMontoPagado] = useState(pago.monto_programado.toString())
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState(pago.notas || '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setSaving(true)
      const res = await fetch(`/api/polizas/${pago.poliza_id}/pagos/${pago.periodo_mes}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto_pagado: parseFloat(montoPagado),
          fecha_pago: new Date(fechaPago).toISOString(),
          notas
        })
      })

      const json = await res.json()
      
      if (res.ok) {
        onSuccess()
      } else {
        alert('Error: ' + json.error)
      }
    } catch (error) {
      console.error('Error marcando pago:', error)
      alert('Error al registrar pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Registrar Pago</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="mb-3">
                <label className="form-label">Periodo</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={new Date(pago.periodo_mes).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}
                  disabled 
                />
              </div>
              
              <div className="mb-3">
                <label className="form-label">Monto Pagado</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    value={montoPagado}
                    onChange={(e) => setMontoPagado(e.target.value)}
                    required
                  />
                  <span className="input-group-text">MXN</span>
                </div>
                <small className="text-muted">
                  Monto programado: {formatCurrency(pago.monto_programado)}
                </small>
              </div>

              <div className="mb-3">
                <label className="form-label">Fecha de Pago</label>
                <input
                  type="date"
                  className="form-control"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                  required
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Notas (opcional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Número de transacción, método de pago, etc."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={onClose}
                disabled={saving}
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Guardando...' : 'Registrar Pago'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
