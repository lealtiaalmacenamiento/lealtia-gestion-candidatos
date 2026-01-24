// Widget: Alertas de pagos vencidos y próximos (para dashboard principal)
'use client'

import { useState, useEffect } from 'react'
import { formatCurrency } from '@/lib/format'
import { useAuth } from '@/context/AuthProvider'

function formatYmd(dateStr?: string | null) {
  if (!dateStr) return '—'
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return dateStr
  const [y, m, d] = parts
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

function formatMonth(dateStr?: string | null) {
  if (!dateStr) return '—'
  const parts = dateStr.split('-').map(Number)
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return dateStr
  const [y, m] = parts
  // Usar UTC para evitar desfaces de huso horario
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
  return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

interface PagoAlerta {
  id: number
  poliza_id: string
  periodo_mes: string
  fecha_limite: string
  monto_programado: number
  estado: string
  diasVencidos?: number
  diasRestantes?: number
  polizas: {
    numero_poliza: string
    prima_mxn: number
    periodicidad_pago: string
    clientes: {
      id: string
      asesor_id: string
      primer_nombre: string
      primer_apellido: string
      usuarios?: {
        id_auth: string
        nombre: string
        email: string
      }
    }
  }
}

interface AlertasResponse {
  vencidos: PagoAlerta[]
  proximos: PagoAlerta[]
}

function sortPorAsesorOCandidato(list: PagoAlerta[]) {
  const getKey = (p: PagoAlerta) => {
    const asesor = p.polizas?.clientes?.usuarios?.nombre || p.polizas?.clientes?.usuarios?.email
    const candidato = `${p.polizas?.clientes?.primer_nombre || ''} ${p.polizas?.clientes?.primer_apellido || ''}`.trim()
    return (asesor || candidato || '').toLowerCase()
  }
  return [...list].sort((a, b) => getKey(a).localeCompare(getKey(b), 'es'))
}

interface AlertasPagosProps {
  onEditPoliza?: (polizaId: string) => void
}

export default function AlertasPagos({ onEditPoliza }: AlertasPagosProps = {}) {
  const { user, loadingUser } = useAuth()
  const [alertas, setAlertas] = useState<AlertasResponse>({ vencidos: [], proximos: [] })
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<'vencidos' | 'proximos'>('vencidos')
  const [selectedAgente, setSelectedAgente] = useState<string>('all')

  useEffect(() => {
    if (user?.id_auth && !loadingUser) {
      fetchAlertas()
      // Refrescar cada 5 minutos
      const interval = setInterval(fetchAlertas, 5 * 60 * 1000)
      return () => clearInterval(interval)
    } else if (!loadingUser) {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadingUser])

  const fetchAlertas = async () => {
    if (!user?.id_auth) return

    // Determinar scope según el rol
    const scope = user.rol === 'supervisor' || user.rol === 'admin' ? 'supervisor' : 'asesor'
    
    try {
      const res = await fetch(`/api/pagos/alertas?usuario_id=${user.id_auth}&scope=${scope}`)
      const json = await res.json()

      if (res.ok) {
        setAlertas({
          vencidos: sortPorAsesorOCandidato(json.vencidos || []),
          proximos: sortPorAsesorOCandidato(json.proximos || [])
        })
      } else {
        console.error('Error al cargar alertas:', json)
      }
    } catch (error) {
      console.error('Error fetching alertas:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalVencidos = alertas.vencidos.length
  const totalProximos = alertas.proximos.length

  // Extraer lista única de agentes
  const uniqueAgentes = Array.from(
    new Map(
      [...alertas.vencidos, ...alertas.proximos]
        .filter(p => p.polizas?.clientes?.usuarios)
        .map(p => {
          const usuario = p.polizas.clientes.usuarios!
          return [usuario.id_auth, { id: usuario.id_auth, nombre: usuario.nombre || usuario.email }]
        })
    ).values()
  ).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))

  // Filtrar alertas por agente seleccionado
  const alertasFiltradas = {
    vencidos: selectedAgente === 'all' 
      ? alertas.vencidos 
      : alertas.vencidos.filter(p => p.polizas?.clientes?.usuarios?.id_auth === selectedAgente),
    proximos: selectedAgente === 'all' 
      ? alertas.proximos 
      : alertas.proximos.filter(p => p.polizas?.clientes?.usuarios?.id_auth === selectedAgente)
  }

  const totalVencidosFiltrados = alertasFiltradas.vencidos.length
  const totalProximosFiltrados = alertasFiltradas.proximos.length

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
        {/* Filtro de agente */}
        {uniqueAgentes.length > 0 && (
          <div className="mb-3">
            <select 
              className="form-select form-select-sm"
              value={selectedAgente}
              onChange={(e) => setSelectedAgente(e.target.value)}
            >
              <option value="all">Todos los agentes</option>
              {uniqueAgentes.map(agente => (
                <option key={agente.id} value={agente.id}>
                  {agente.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tabs */}
        <ul className="nav nav-pills nav-fill mb-3">
          <li className="nav-item">
            <button
              className={`nav-link ${activeCategory === 'vencidos' ? 'active' : ''}`}
              onClick={() => setActiveCategory('vencidos')}
            >
              Vencidos
              {totalVencidosFiltrados > 0 && (
                <span className="badge bg-danger ms-2">{totalVencidosFiltrados}</span>
              )}
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeCategory === 'proximos' ? 'active' : ''}`}
              onClick={() => setActiveCategory('proximos')}
            >
              Próximos (7 días)
              {totalProximosFiltrados > 0 && (
                <span className="badge bg-warning text-dark ms-2">{totalProximosFiltrados}</span>
              )}
            </button>
          </li>
        </ul>

        {/* Lista de alertas */}
        <div className="list-group list-group-flush" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {activeCategory === 'vencidos' ? (
            totalVencidosFiltrados === 0 ? (
              <div className="text-center text-muted py-4">
                <i className="bi bi-check-circle fs-1"></i>
                <p className="mt-2">No hay pagos vencidos</p>
              </div>
            ) : (
              alertasFiltradas.vencidos.map((pago) => (
                <div
                  key={pago.id}
                  className="list-group-item list-group-item-action"
                  role="button"
                  onClick={() => onEditPoliza?.(pago.poliza_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex w-100 justify-content-between">
                    <h6 className="mb-1">
                      {pago.polizas?.clientes?.primer_nombre} {pago.polizas?.clientes?.primer_apellido}
                      <span className="badge bg-danger ms-2">Vencido</span>
                      {pago.polizas?.clientes?.usuarios && (
                        <span className="badge bg-secondary ms-2" title="Asesor responsable">
                          <i className="bi bi-person"></i> {pago.polizas.clientes.usuarios.nombre || pago.polizas.clientes.usuarios.email}
                        </span>
                      )}
                    </h6>
                    <small className="text-danger fw-bold">
                      {formatCurrency(pago.monto_programado)}
                    </small>
                  </div>
                  <p className="mb-1 small text-muted">
                    Póliza: {pago.polizas?.numero_poliza} | Periodo: {formatMonth(pago.periodo_mes)}
                  </p>
                  <small className="text-danger">
                    Límite: {formatYmd(pago.fecha_limite)}
                    {pago.diasVencidos && pago.diasVencidos > 0 && ` (${pago.diasVencidos} días atrás)`}
                  </small>
                </div>
              ))
            )
          ) : (
            totalProximosFiltrados === 0 ? (
              <div className="text-center text-muted py-4">
                <i className="bi bi-calendar-check fs-1"></i>
                <p className="mt-2">No hay pagos próximos en los próximos 7 días</p>
              </div>
            ) : (
              alertasFiltradas.proximos.map((pago) => (
                <div
                  key={pago.id}
                  className="list-group-item list-group-item-action"
                  role="button"
                  onClick={() => onEditPoliza?.(pago.poliza_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="d-flex w-100 justify-content-between">
                    <h6 className="mb-1">
                      {pago.polizas?.clientes?.primer_nombre} {pago.polizas?.clientes?.primer_apellido}
                      <span className="badge bg-warning text-dark ms-2">
                        {pago.diasRestantes && pago.diasRestantes > 0 ? `${pago.diasRestantes} días` : 'Próximo'}
                      </span>
                      {pago.polizas?.clientes?.usuarios && (
                        <span className="badge bg-secondary ms-2" title="Asesor responsable">
                          <i className="bi bi-person"></i> {pago.polizas.clientes.usuarios.nombre || pago.polizas.clientes.usuarios.email}
                        </span>
                      )}
                    </h6>
                    <small className="fw-bold">
                      {formatCurrency(pago.monto_programado)}
                    </small>
                  </div>
                  <p className="mb-1 small text-muted">
                    Póliza: {pago.polizas?.numero_poliza} | Periodo: {formatMonth(pago.periodo_mes)}
                  </p>
                  <small>
                    Límite: {formatYmd(pago.fecha_limite)}
                  </small>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  )
}
