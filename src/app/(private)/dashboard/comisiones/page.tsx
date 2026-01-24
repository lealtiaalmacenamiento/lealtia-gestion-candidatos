// Página: Dashboard de Comisiones (con 2 tabs)
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { formatCurrency } from '@/lib/format'

interface ComisionConConexion {
  periodo: string
  efc_id: number
  efc_nombre: string
  agente_id: string
  agente_nombre: string
  mes_conexion: number
  total_polizas: number
  comision_vigente: number
}

interface ComisionSinConexion {
  periodo: string
  agente_id: string
  agente_nombre: string
  total_polizas: number
  total_prima: number
  comision_vigente: number
}

interface Resumen {
  total_polizas: number
  total_prima: number
  total_comision: number
  periodos_unicos: number
  efcs_unicos?: number
}

const getCurrentPeriodoCdmx = () => {
  try {
    // en-CA yields YYYY-MM; tz forces CDMX current month
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit'
    }).format(new Date())
  } catch {
    return ''
  }
}

export default function ComisionesPage() {
  // Solo supervisores/admin o agentes
  const { user, loadingUser } = useAuth()
  const role = (user?.rol || '').toLowerCase()
  const isSupervisor = role === 'supervisor' || role === 'admin'
  const notAllowed = !loadingUser && user && !['supervisor', 'admin', 'agente'].includes(role)

  useEffect(() => {
    if (notAllowed && typeof window !== 'undefined') {
      window.location.replace('/home')
    }
  }, [notAllowed])
  const defaultPeriodo = useMemo(() => getCurrentPeriodoCdmx(), [])
  const defaultYear = useMemo(() => Number(defaultPeriodo?.slice(0, 4)) || new Date().getFullYear(), [defaultPeriodo])
  const defaultMonth = useMemo(() => defaultPeriodo?.slice(5, 7) || new Intl.DateTimeFormat('en-CA', { month: '2-digit' }).format(new Date()), [defaultPeriodo])
  const [activeTab, setActiveTab] = useState<'con' | 'sin'>('con')
  const [comisionesCon, setComisionesCon] = useState<ComisionConConexion[]>([])
  const [comisionesSin, setComisionesSin] = useState<ComisionSinConexion[]>([])
  const [resumenCon, setResumenCon] = useState<Resumen | null>(null)
  const [resumenSin, setResumenSin] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(true)
  const [agentes, setAgentes] = useState<Array<{ id: string; nombre: string }>>([])
  
  // Rango de fechas
  const [yearDesde, setYearDesde] = useState<number>(defaultYear)
  const [monthDesde, setMonthDesde] = useState<string>(defaultMonth)
  const [yearHasta, setYearHasta] = useState<number>(defaultYear)
  const [monthHasta, setMonthHasta] = useState<string>(defaultMonth)

  // Filtros
  const [filtros, setFiltros] = useState({
    periodoDesde: defaultPeriodo,
    periodoHasta: defaultPeriodo,
    agente: ''
  })

  const monthOptions = useMemo(() => {
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    return months.map((label, idx) => ({ label, value: String(idx + 1).padStart(2, '0') }))
  }, [])

  const yearOptions = useMemo(() => {
    const range: number[] = []
    for (let y = defaultYear + 1; y >= defaultYear - 4; y -= 1) {
      range.push(y)
    }
    return range
  }, [defaultYear])

  const fetchComisiones = useCallback(async () => {
    try {
      setLoading(true)
      
      const params = new URLSearchParams()
      if (filtros.periodoDesde) params.set('periodo_desde', filtros.periodoDesde)
      if (filtros.periodoHasta) params.set('periodo_hasta', filtros.periodoHasta)
      if (isSupervisor && filtros.agente) params.set('agente', filtros.agente)

      if (isSupervisor) {
        // Supervisores: cargar según pestaña activa
        const endpoint = activeTab === 'con' 
          ? `/api/comisiones/con-conexion?${params}`
          : `/api/comisiones/sin-conexion?${params}`

        const res = await fetch(endpoint)
        const json = await res.json()

        if (res.ok) {
          if (activeTab === 'con') {
            setComisionesCon(json.data || [])
            setResumenCon(json.resumen || null)
          } else {
            setComisionesSin(json.data || [])
            setResumenSin(json.resumen || null)
          }
        } else {
          console.error('Error cargando comisiones:', json.error)
        }
      } else {
        // Agentes: cargar ambas vistas
        const [resCon, resSin] = await Promise.all([
          fetch(`/api/comisiones/con-conexion?${params}`),
          fetch(`/api/comisiones/sin-conexion?${params}`)
        ])
        
        const [jsonCon, jsonSin] = await Promise.all([
          resCon.json(),
          resSin.json()
        ])

        if (resCon.ok) {
          setComisionesCon(jsonCon.data || [])
          setResumenCon(jsonCon.resumen || null)
        }
        if (resSin.ok) {
          setComisionesSin(jsonSin.data || [])
          setResumenSin(jsonSin.resumen || null)
        }
      }
    } catch (error) {
      console.error('Error fetching comisiones:', error)
    } finally {
      setLoading(false)
    }
  }, [activeTab, filtros, isSupervisor])

  useEffect(() => {
    if (loadingUser || notAllowed) return
    fetchComisiones()
  }, [fetchComisiones, loadingUser, notAllowed])

  // Cargar todos los agentes disponibles (solo supervisores)
  useEffect(() => {
    if (!isSupervisor || loadingUser || notAllowed) return
    
    const fetchAgentes = async () => {
      try {
        const res = await fetch(`/api/comisiones/agentes?tab=${activeTab}`)
        const json = await res.json()
        if (res.ok) {
          setAgentes(json.data || [])
          // Resetear filtro de agente al cambiar de pestaña
          setFiltros(prev => ({ ...prev, agente: '' }))
        }
      } catch (error) {
        console.error('Error fetching agentes:', error)
      }
    }
    
    fetchAgentes()
  }, [isSupervisor, loadingUser, notAllowed, activeTab])

  const handleFilterChange = (key: string, value: string) => {
    setFiltros(prev => ({ ...prev, [key]: value }))
  }

  const handleDesdeChange = (month: string, year: number) => {
    const periodo = `${year}-${month}`
    setMonthDesde(month)
    setYearDesde(year)
    setFiltros(prev => ({ ...prev, periodoDesde: periodo }))
  }

  const handleHastaChange = (month: string, year: number) => {
    const periodo = `${year}-${month}`
    setMonthHasta(month)
    setYearHasta(year)
    setFiltros(prev => ({ ...prev, periodoHasta: periodo }))
  }

  const resetFiltros = () => {
    setYearDesde(defaultYear)
    setMonthDesde(defaultMonth)
    setYearHasta(defaultYear)
    setMonthHasta(defaultMonth)
    setFiltros({ periodoDesde: defaultPeriodo, periodoHasta: defaultPeriodo, agente: '' })
  }

  if (notAllowed) {
    return (
      <div className="container-fluid py-4">
        <div className="alert alert-warning">No tienes permisos para ver Comisiones.</div>
      </div>
    )
  }

  return (
    <div className="container-fluid py-4">
      <div className="row mb-4">
        <div className="col">
          <h2>Dashboard de Comisiones</h2>
          <p className="text-muted">
            {isSupervisor 
              ? 'Consulta las comisiones de agentes con y sin mes de conexión establecido'
              : 'Consulta tus comisiones por periodo'
            }
          </p>
        </div>
      </div>

      {/* Tabs (solo para supervisores) */}
      {isSupervisor && (
        <ul className="nav nav-tabs mb-4">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'con' ? 'active' : ''}`}
              onClick={() => setActiveTab('con')}
            >
              Con Mes de Conexión
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'sin' ? 'active' : ''}`}
              onClick={() => setActiveTab('sin')}
            >
              Sin Mes de Conexión
            </button>
          </li>
        </ul>
      )}

      {/* Filtros */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            {/* Desde */}
            <div className="col-md-2">
              <label className="form-label fw-bold">Desde</label>
              <select
                className="form-select form-select-sm"
                value={yearDesde}
                onChange={(e) => handleDesdeChange(monthDesde, Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">&nbsp;</label>
              <select
                className="form-select form-select-sm"
                value={monthDesde}
                onChange={(e) => handleDesdeChange(e.target.value, yearDesde)}
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Hasta */}
            <div className="col-md-2">
              <label className="form-label fw-bold">Hasta</label>
              <select
                className="form-select form-select-sm"
                value={yearHasta}
                onChange={(e) => handleHastaChange(monthHasta, Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label">&nbsp;</label>
              <select
                className="form-select form-select-sm"
                value={monthHasta}
                onChange={(e) => handleHastaChange(e.target.value, yearHasta)}
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            {/* Filtro de agente (solo supervisores) */}
            {isSupervisor && (
              <div className="col-md-2">
                <label className="form-label">Agente</label>
                <select
                  className="form-select form-select-sm"
                  value={filtros.agente}
                  onChange={(e) => handleFilterChange('agente', e.target.value)}
                >
                  <option value="">Todos</option>
                  {agentes.map((ag) => (
                    <option key={ag.id} value={ag.nombre}>{ag.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <div className={`col-md-${isSupervisor ? '2' : '4'} d-flex align-items-end`}>
              <button 
                className="btn btn-outline-secondary btn-sm w-100"
                onClick={resetFiltros}
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen */}
      {!loading && (resumenCon || resumenSin) && (
        <div className="row mb-4">
          <div className="col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="text-muted mb-1">Total Pólizas</h6>
                <h3>
                  {isSupervisor 
                    ? ((activeTab === 'con' ? resumenCon : resumenSin)?.total_polizas || 0)
                    : ((resumenCon?.total_polizas || 0) + (resumenSin?.total_polizas || 0))
                  }
                </h3>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="text-muted mb-1">Prima Total</h6>
                <h3>
                  {formatCurrency(
                    isSupervisor 
                      ? ((activeTab === 'con' ? resumenCon : resumenSin)?.total_prima || 0)
                      : ((resumenCon?.total_prima || 0) + (resumenSin?.total_prima || 0))
                  )}
                </h3>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="text-muted mb-1">Comisión Total</h6>
                <h3 className="text-success">
                  {formatCurrency(
                    isSupervisor 
                      ? ((activeTab === 'con' ? resumenCon : resumenSin)?.total_comision || 0)
                      : ((resumenCon?.total_comision || 0) + (resumenSin?.total_comision || 0))
                  )}
                </h3>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      ) : (
        <>
          {isSupervisor ? (
            activeTab === 'con' ? (
              <TablaConConexion data={comisionesCon} />
            ) : (
              <TablaSinConexion data={comisionesSin} />
            )
          ) : (
            // Agentes ven ambas vistas juntas
            <>
              {comisionesCon.length > 0 && (
                <div className="mb-4">
                  <h5 className="mb-3">Comisiones con Mes de Conexión</h5>
                  <TablaConConexion data={comisionesCon} />
                </div>
              )}
              {comisionesSin.length > 0 && (
                <div className="mb-4">
                  <h5 className="mb-3">Comisiones sin Mes de Conexión</h5>
                  <TablaSinConexion data={comisionesSin} />
                </div>
              )}
              {comisionesCon.length === 0 && comisionesSin.length === 0 && (
                <div className="alert alert-info">
                  No se encontraron comisiones para el rango de fechas seleccionado.
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function TablaConConexion({ data }: { data: ComisionConConexion[] }) {
  if (!data.length) {
    return (
      <div className="alert alert-info">
        No se encontraron comisiones con mes de conexión para los filtros seleccionados.
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Agente</th>
                <th className="text-center">Mes Conexión</th>
                <th className="text-center">Total Pólizas</th>
                <th className="text-end">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.periodo}</td>
                  <td>{row.agente_nombre}</td>
                  <td className="text-center">
                    <span className="badge bg-info">{row.mes_conexion}</span>
                  </td>
                  <td className="text-center fw-bold">{row.total_polizas}</td>
                  <td className="text-end fw-bold text-success">
                    {formatCurrency(row.comision_vigente)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TablaSinConexion({ data }: { data: ComisionSinConexion[] }) {
  if (!data.length) {
    return (
      <div className="alert alert-info">
        No se encontraron comisiones sin mes de conexión para los filtros seleccionados.
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Agente</th>
                <th className="text-center">Total Pólizas</th>
                <th className="text-end">Prima Total</th>
                <th className="text-end">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.periodo}</td>
                  <td>{row.agente_nombre}</td>
                  <td className="text-center fw-bold">{row.total_polizas}</td>
                  <td className="text-end">{formatCurrency(row.total_prima)}</td>
                  <td className="text-end fw-bold text-success">
                    {formatCurrency(row.comision_vigente)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}