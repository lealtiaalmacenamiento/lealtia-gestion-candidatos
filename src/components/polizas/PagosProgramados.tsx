// Componente: Tabla de pagos programados de una póliza
'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency } from '@/lib/format'

interface Pago {
  id: number
  poliza_id: string
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
  refreshKey?: number          // incrementar para forzar re-fetch
  onPagoRegistrado?: () => void
}

/** Parsea una fecha date-only (YYYY-MM-DD) como mediodía local para evitar
 *  el desfase UTC → CDMX que haría que 2025-11-01 se muestre como octubre. */
function localDate(dateStr: string): Date {
  // Si ya tiene hora/zona, usar tal cual
  if (dateStr.includes('T') || dateStr.includes('Z')) return new Date(dateStr)
  return new Date(dateStr + 'T12:00:00')
}

export default function PagosProgramados({ polizaId, refreshKey, onPagoRegistrado }: PagosProgramadosProps) {
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPago, setSelectedPago] = useState<Pago | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [omitiendo, setOmitiendo] = useState<number | null>(null)

  const fetchPagos = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/polizas/${polizaId}/pagos`, { cache: 'no-store' })
      const json = await res.json()
      
      if (res.ok) {
        const fetched: Pago[] = json.pagos || []
        console.log('[PagosProgramados] fetchPagos result estados:', fetched.map(p => `${p.periodo_mes}=${p.estado}`).join(', '))
        setPagos(fetched)
      } else {
        console.error('Error cargando pagos:', json.error)
      }
    } catch (error) {
      console.error('Error fetching pagos:', error)
    } finally {
      setLoading(false)
    }
  }, [polizaId])

  useEffect(() => {
    fetchPagos()
  }, [fetchPagos, refreshKey])

  const handleMarcarPagado = (pago: Pago) => {
    setSelectedPago(pago)
    setShowModal(true)
  }

  const handleOmitir = async (pago: Pago) => {
    if (!window.confirm(`¿Marcar el pago de ${localDate(pago.periodo_mes).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })} como omitido?`)) return
    try {
      setOmitiendo(pago.id)
      const url = `/api/polizas/${pago.poliza_id}/pagos/${encodeURIComponent(pago.periodo_mes)}`
      console.log('[PagosProgramados] omitir URL:', url, 'pago.id:', pago.id, 'poliza_id:', pago.poliza_id, 'periodo_mes:', pago.periodo_mes)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'omitido' })
      })
      const json = await res.json()
      console.log('[PagosProgramados] omitir response status:', res.status, 'body:', json)
      if (!res.ok) {
        const msg = [json.error, json.detail].filter(Boolean).join(' — ')
        alert('Error al omitir: ' + (msg || `HTTP ${res.status}`))
        return
      }
      // Actualización optimista: cambiar badge al instante sin esperar fetchPagos
      setPagos(prev => prev.map(p => p.id === pago.id ? { ...p, estado: 'omitido' as const } : p))
      await fetchPagos()
      onPagoRegistrado?.()
    } catch {
      alert('Error de red al omitir el pago')
    } finally {
      setOmitiendo(null)
    }
  }

  const getBadgeClass = (pago: Pago) => {
    if (pago.estado === 'pagado') return 'badge bg-success'
    if (pago.estado === 'omitido') return 'badge bg-secondary'
    if (pago.estado === 'vencido' || pago.isOverdue) return 'badge bg-danger'
    if (pago.isDueSoon) return 'badge bg-warning text-dark'
    if (pago.estado === 'pendiente') return 'badge bg-light text-dark border'
    return 'badge bg-light text-dark'
  }

  const getBadgeText = (pago: Pago) => {
    if (pago.estado === 'pagado') return 'Pagado'
    if (pago.estado === 'omitido') return 'Omitido'
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
                  {localDate(pago.periodo_mes).toLocaleDateString('es-MX', { 
                    year: 'numeric', 
                    month: 'long' 
                  })}
                </td>
                <td>
                  {localDate(pago.fecha_limite).toLocaleDateString('es-MX')}
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
                  {(pago.estado === 'pendiente' || pago.estado === 'vencido') && (
                    <div className="d-flex gap-1 justify-content-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => handleMarcarPagado(pago)}
                      >
                        Marcar Pagado
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => handleOmitir(pago)}
                        disabled={omitiendo === pago.id}
                      >
                        {omitiendo === pago.id ? '…' : 'Omitir'}
                      </button>
                    </div>
                  )}
                  {pago.estado === 'pagado' && pago.fecha_pago_real && (
                    <span className="text-muted small">
                      {localDate(pago.fecha_pago_real).toLocaleDateString('es-MX')}
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
            // Actualización optimista: badge pagado instantáneo
            if (selectedPago) {
              setPagos(prev => prev.map(p => p.id === selectedPago.id ? { ...p, estado: 'pagado' as const } : p))
            }
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
  const [fechaPago, setFechaPago] = useState('')
  const [notas, setNotas] = useState(pago.notas || '')
  const [saving, setSaving] = useState(false)

  // Helper local (fuera del scope del componente padre, redefinir aquí)
  const ld = (s: string) => s.includes('T') || s.includes('Z') ? new Date(s) : new Date(s + 'T12:00:00')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!fechaPago) {
      alert('Selecciona la fecha de pago real')
      return
    }
    
    try {
      setSaving(true)
      const url = `/api/polizas/${pago.poliza_id}/pagos/${encodeURIComponent(pago.periodo_mes)}`
      const body = { monto_pagado: parseFloat(montoPagado), fecha_pago: new Date(fechaPago).toISOString(), notas }
      console.log('[ModalMarcarPago] submit URL:', url, 'body:', body)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const json = await res.json()
      console.log('[ModalMarcarPago] response status:', res.status, 'body:', json)
      
      if (res.ok) {
        onSuccess()
        return
      }

      const msg = [json?.error, json?.detail].filter(Boolean).join(' — ')
      alert('Error al registrar pago: ' + (msg || `HTTP ${res.status}`))
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
                  value={ld(pago.periodo_mes).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}
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
