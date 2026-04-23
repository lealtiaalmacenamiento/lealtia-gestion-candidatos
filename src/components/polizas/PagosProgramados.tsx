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
  isSuper?: boolean            // si true, aplica cambios de pago de inmediato; si false, solicita aprobación
  onPagoRegistrado?: () => void
}

/** Parsea una fecha date-only (YYYY-MM-DD) como mediodía local para evitar
 *  el desfase UTC → CDMX que haría que 2025-11-01 se muestre como octubre. */
function localDate(dateStr: string): Date {
  // Si ya tiene hora/zona, usar tal cual
  if (dateStr.includes('T') || dateStr.includes('Z')) return new Date(dateStr)
  return new Date(dateStr + 'T12:00:00')
}

export default function PagosProgramados({ polizaId, refreshKey, isSuper, onPagoRegistrado }: PagosProgramadosProps) {
  const [pagos, setPagos] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPago, setSelectedPago] = useState<Pago | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [omitiendo, setOmitiendo] = useState<number | null>(null)
  // Periodos enviados a aprobación (sólo para usuarios no-super)
  const [pendingApproval, setPendingApproval] = useState<Set<string>>(new Set())
  // Multi-selección para marcar en bloque (solo super)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)

  const fetchPagos = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/polizas/${polizaId}/pagos`, { cache: 'no-store' })
      const json = await res.json()
      
      if (res.ok) {
        const fetched: Pago[] = json.pagos || []
        console.log('[PagosProgramados] fetchPagos result estados:', fetched.map(p => `${p.periodo_mes}=${p.estado}`).join(', '))
        setPagos(fetched)
        setSelectedIds(new Set()) // limpiar selección al recargar
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

      if (!isSuper) {
        // No-super: enviar a cola de aprobación
        const res = await fetch('/api/polizas/updates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poliza_id: pago.poliza_id,
            payload: { pago_cambios: [{ periodo_mes: pago.periodo_mes, accion: 'omitido' }] }
          })
        })
        const json = await res.json()
        if (!res.ok) {
          alert('Error al enviar solicitud: ' + (json.error || `HTTP ${res.status}`))
          return
        }
        setPendingApproval(prev => new Set([...prev, pago.periodo_mes]))
        alert('Solicitud enviada. Quedará aplicada cuando un supervisor la apruebe.')
        return
      }

      // Super: aplicar de inmediato
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
      // Actualización optimista
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
    if (pendingApproval.has(pago.periodo_mes)) return 'badge bg-warning text-dark'
    if (pago.estado === 'pagado') return 'badge bg-success'
    if (pago.estado === 'omitido') return 'badge bg-secondary'
    if (pago.estado === 'vencido' || pago.isOverdue) return 'badge bg-danger'
    if (pago.isDueSoon) return 'badge bg-warning text-dark'
    if (pago.estado === 'pendiente') return 'badge bg-light text-dark border'
    return 'badge bg-light text-dark'
  }

  const getBadgeText = (pago: Pago) => {
    if (pendingApproval.has(pago.periodo_mes)) return 'Pendiente aprob.'
    if (pago.estado === 'pagado') return 'Pagado'
    if (pago.estado === 'omitido') return 'Omitido'
    if (pago.estado === 'vencido' || pago.isOverdue) return 'Vencido'
    if (pago.isDueSoon) return `Próximo (${pago.diasRestantes}d)`
    if (pago.estado === 'pendiente') return 'Pendiente'
    return pago.estado
  }

  const selectablePagos = pagos.filter(p => p.estado === 'pendiente' || p.estado === 'vencido')
  const allSelected = selectablePagos.length > 0 && selectablePagos.every(p => selectedIds.has(p.id))

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectablePagos.map(p => p.id)))
    }
  }

  const handleSelectOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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

      {/* Barra de acción bulk (solo visible cuando hay selección y isSuper) */}
      {isSuper && selectedIds.size > 0 && (
        <div className="alert alert-info d-flex align-items-center justify-content-between py-2 px-3 mb-2">
          <span className="small">
            <i className="bi bi-check2-square me-1"></i>
            <strong>{selectedIds.size}</strong> pago{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedIds(new Set())}>
              Deseleccionar
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowBulkModal(true)}>
              <i className="bi bi-check2-all me-1"></i>Marcar como pagados
            </button>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-sm table-hover align-middle">
          <thead>
            <tr>
              {isSuper && (
                <th style={{ width: 36 }}>
                  {selectablePagos.length > 0 && (
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={allSelected}
                      onChange={handleSelectAll}
                      title="Seleccionar todos"
                    />
                  )}
                </th>
              )}
              <th>Periodo</th>
              <th>Fecha Límite</th>
              <th className="text-end">Monto</th>
              <th>Estado</th>
              <th className="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((pago) => (
              <tr key={pago.id} className={selectedIds.has(pago.id) ? 'table-active' : ''}>
                {isSuper && (
                  <td>
                    {(pago.estado === 'pendiente' || pago.estado === 'vencido') && (
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selectedIds.has(pago.id)}
                        onChange={() => handleSelectOne(pago.id)}
                      />
                    )}
                  </td>
                )}
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

      {/* Modal bulk — marcar múltiples pagos como pagados */}
      {showBulkModal && (
        <BulkMarcarModal
          polizaId={polizaId}
          pagos={pagos.filter(p => selectedIds.has(p.id))}
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => {
            setShowBulkModal(false)
            setSelectedIds(new Set())
            void fetchPagos()
            onPagoRegistrado?.()
          }}
        />
      )}

      {/* Modal para marcar pago */}
      {showModal && selectedPago && (
        <ModalMarcarPago
          pago={selectedPago}
          isSuper={isSuper}
          onClose={() => {
            setShowModal(false)
            setSelectedPago(null)
          }}
          onSuccess={() => {
            // Super: ya se aplicó directo, actualizar optimistamente
            if (selectedPago) {
              setPagos(prev => prev.map(p => p.id === selectedPago.id ? { ...p, estado: 'pagado' as const } : p))
            }
            fetchPagos()
            onPagoRegistrado?.()
            setShowModal(false)
            setSelectedPago(null)
          }}
          onApprovalRequest={(data) => {
            // No-super: enviar a cola de aprobación supervisor
            if (!selectedPago) return
            const { periodo_mes, poliza_id } = selectedPago
            void fetch('/api/polizas/updates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                poliza_id,
                payload: { pago_cambios: [{ periodo_mes, accion: 'pagado', monto_pagado: data.monto_pagado, fecha_pago: data.fecha_pago, notas: data.notas }] }
              })
            }).then(async r => {
              const j = await r.json()
              if (!r.ok) { alert('Error al enviar solicitud: ' + (j.error || '')); return }
              setPendingApproval(prev => new Set([...prev, periodo_mes]))
              alert('Solicitud enviada. Quedará aplicada cuando un supervisor la apruebe.')
            })
            setShowModal(false)
            setSelectedPago(null)
          }}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------
// Componente BulkMarcarModal — marca múltiples pagos como pagados
// -----------------------------------------------------------------------
function BulkMarcarModal({
  polizaId,
  pagos,
  onClose,
  onSuccess,
}: {
  polizaId: string
  pagos: Pago[]
  onClose: () => void
  onSuccess: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [fechaPago, setFechaPago] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalMonto = pagos.reduce((acc, p) => acc + (p.monto_programado || 0), 0)

  const handleConfirm = async () => {
    if (!fechaPago) { setError('Selecciona la fecha de pago'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/polizas/${polizaId}/pagos/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodos: pagos.map(p => p.periodo_mes),
          fecha_pago: new Date(fechaPago).toISOString(),
        }),
      })
      const j = await res.json() as { success?: boolean; marcados?: number; errores?: { periodo: string; error: string }[]; error?: string }
      if (!res.ok || !j.success) {
        setError(j.error ?? 'Error al registrar pagos')
        return
      }
      if (j.errores && j.errores.length > 0) {
        setError(`Se marcaron ${j.marcados} pago(s), pero hubo ${j.errores.length} error(es).`)
        return
      }
      onSuccess()
    } catch {
      setError('Error de red')
    } finally {
      setSaving(false)
    }
  }

  // Helper local
  const ld = (s: string) => s.includes('T') || s.includes('Z') ? new Date(s) : new Date(s + 'T12:00:00')

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title"><i className="bi bi-check2-all me-2"></i>Marcar pagos como pagados</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label">Fecha de pago</label>
              <input
                type="date"
                className="form-control"
                value={fechaPago}
                onChange={e => setFechaPago(e.target.value)}
                required
              />
            </div>
            <p className="small text-muted mb-2">Se registrarán {pagos.length} pago(s) con el monto programado de cada uno:</p>
            <ul className="list-group list-group-flush mb-3" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {pagos.map(p => (
                <li key={p.id} className="list-group-item d-flex justify-content-between px-0 py-1 small">
                  <span>{ld(p.periodo_mes).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}</span>
                  <span className="text-muted">{formatCurrency(p.monto_programado)}</span>
                </li>
              ))}
            </ul>
            <div className="d-flex justify-content-between fw-semibold border-top pt-2 small">
              <span>Total</span>
              <span>{formatCurrency(totalMonto)}</span>
            </div>
            {error && <div className="alert alert-danger small py-1 mt-2 mb-0">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
              {saving ? 'Guardando...' : `Confirmar ${pagos.length} pago(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------
// Componente Modal para registrar pago individual
// -----------------------------------------------------------------------
function ModalMarcarPago({ 
  pago, 
  isSuper,
  onClose, 
  onSuccess,
  onApprovalRequest
}: { 
  pago: Pago
  isSuper?: boolean
  onClose: () => void
  onSuccess: () => void
  onApprovalRequest: (data: { monto_pagado: number; fecha_pago: string; notas: string }) => void
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

      if (!isSuper) {
        // No-super: no llamar al API directo, devolver datos al padre para cola de aprobación
        onApprovalRequest({ monto_pagado: parseFloat(montoPagado), fecha_pago: new Date(fechaPago).toISOString(), notas })
        return
      }

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
                {saving ? 'Guardando...' : (isSuper ? 'Registrar Pago' : 'Enviar solicitud')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
