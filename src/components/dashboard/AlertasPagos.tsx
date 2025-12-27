// Widget: Alertas de pagos vencidos y próximos (para dashboard principal)
'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/format'
import Link from 'next/link'

interface PagoAlerta {
  id: number
  poliza_id: number
  poliza_numero: string
  cliente_nombre: string
  periodo_mes: string
  fecha_limite: string
  monto_programado: number
  estado: string
  diasRestantes: number | null
}

interface AlertasResponse {
  vencidos: PagoAlerta[]
  proximos: PagoAlerta[]
}

export default function AlertasPagos() {
  const [alertas, setAlertas] = useState<AlertasResponse>({ vencidos: [], proximos: [] })
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<'vencidos' | 'proximos'>('vencidos')

  useEffect(() => {
    fetchAlertas()
    
    // Refrescar cada 5 minutos
    const interval = setInterval(fetchAlertas, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const fetchAlertas = async () => {
    try {
      const res = await fetch('/api/pagos/alertas')
      const json = await res.json()
      
      if (res.ok) {
        setAlertas(json)
      }
    } catch (error) {
      console.error('Error fetching alertas:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalVencidos = alertas.vencidos.length
  const totalProximos = alertas.proximos.length

  if (loading) {
    return (
      <div className="card">
        <div className="card-body text-center">
          <div className="spinner-border spinner-border-sm" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0">Alertas de Pagos</h5>
        <div>
          {totalVencidos > 0 && (
            <span className="badge bg-danger me-2">
              {totalVencidos} vencidos
            </span>
          )}
          {totalProximos > 0 && (
            <span className="badge bg-warning text-dark">
              {totalProximos} próximos
            </span>
          )}
        </div>
      </div>

      <div className="card-body">
        {/* Tabs */}
        <ul className="nav nav-pills nav-fill mb-3">
          <li className="nav-item">
            <button
              className={`nav-link ${activeCategory === 'vencidos' ? 'active' : ''}`}
              onClick={() => setActiveCategory('vencidos')}
            >
              Vencidos
              {totalVencidos > 0 && (
                <span className="badge bg-danger ms-2">{totalVencidos}</span>
              )}
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeCategory === 'proximos' ? 'active' : ''}`}
              onClick={() => setActiveCategory('proximos')}
            >
              Próximos (7 días)
              {totalProximos > 0 && (
                <span className="badge bg-warning text-dark ms-2">{totalProximos}</span>
              )}
            </button>
          </li>
        </ul>

        {/* Lista de alertas */}
        <div className="list-group list-group-flush" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {activeCategory === 'vencidos' ? (
            totalVencidos === 0 ? (
              <div className="text-center text-muted py-4">
                <i className="bi bi-check-circle fs-1"></i>
                <p className="mt-2">No hay pagos vencidos</p>
              </div>
            ) : (
              alertas.vencidos.map((pago) => (
                <Link
                  key={pago.id}
                  href={`/dashboard/polizas/${pago.poliza_id}`}
                  className="list-group-item list-group-item-action"
                >
                  <div className="d-flex w-100 justify-content-between">
                    <h6 className="mb-1">
                      {pago.cliente_nombre}
                      <span className="badge bg-danger ms-2">Vencido</span>
                    </h6>
                    <small className="text-danger fw-bold">
                      {formatCurrency(pago.monto_programado)}
                    </small>
                  </div>
                  <p className="mb-1 small text-muted">
                    Póliza: {pago.poliza_numero} | Periodo: {new Date(pago.periodo_mes).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}
                  </p>
                  <small className="text-danger">
                    Límite: {new Date(pago.fecha_limite).toLocaleDateString('es-MX')}
                    {pago.diasRestantes !== null && ` (${Math.abs(pago.diasRestantes)} días atrás)`}
                  </small>
                </Link>
              ))
            )
          ) : (
            totalProximos === 0 ? (
              <div className="text-center text-muted py-4">
                <i className="bi bi-calendar-check fs-1"></i>
                <p className="mt-2">No hay pagos próximos en los próximos 7 días</p>
              </div>
            ) : (
              alertas.proximos.map((pago) => (
                <Link
                  key={pago.id}
                  href={`/dashboard/polizas/${pago.poliza_id}`}
                  className="list-group-item list-group-item-action"
                >
                  <div className="d-flex w-100 justify-content-between">
                    <h6 className="mb-1">
                      {pago.cliente_nombre}
                      <span className="badge bg-warning text-dark ms-2">
                        {pago.diasRestantes !== null && `${pago.diasRestantes} días`}
                      </span>
                    </h6>
                    <small className="fw-bold">
                      {formatCurrency(pago.monto_programado)}
                    </small>
                  </div>
                  <p className="mb-1 small text-muted">
                    Póliza: {pago.poliza_numero} | Periodo: {new Date(pago.periodo_mes).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}
                  </p>
                  <small>
                    Límite: {new Date(pago.fecha_limite).toLocaleDateString('es-MX')}
                  </small>
                </Link>
              ))
            )
          )}
        </div>
      </div>

      {(totalVencidos > 0 || totalProximos > 0) && (
        <div className="card-footer text-center">
          <Link href="/dashboard/pagos" className="btn btn-sm btn-outline-primary">
            Ver todos los pagos
          </Link>
        </div>
      )}
    </div>
  )
}
