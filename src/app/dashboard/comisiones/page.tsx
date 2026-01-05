// Página: Dashboard de Comisiones (con 2 tabs)
'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatCurrency } from '@/lib/format'

interface ComisionConConexion {
  periodo: string
  efc_id: number
  efc_nombre: string
  agente_id: string
  agente_nombre: string
  mes_conexion: number
  total_polizas: number
  polizas_mes_1: number
  polizas_mes_2: number
  polizas_mes_3: number
  polizas_mes_4_plus: number
  prima_mes_1: number
  prima_mes_2: number
  prima_mes_3: number
  prima_mes_4_plus: number
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

export default function ComisionesPage() {
  const [activeTab, setActiveTab] = useState<'con' | 'sin'>('con')
  const [comisionesCon, setComisionesCon] = useState<ComisionConConexion[]>([])
  const [comisionesSin, setComisionesSin] = useState<ComisionSinConexion[]>([])
  const [resumenCon, setResumenCon] = useState<Resumen | null>(null)
  const [resumenSin, setResumenSin] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtros, setFiltros] = useState({
    periodo: '',
    efc: '',
    agente: ''
  })

  const fetchComisiones = useCallback(async () => {
    try {
      setLoading(true)
      
      const params = new URLSearchParams()
      if (filtros.periodo) params.set('periodo', filtros.periodo)
      if (filtros.efc && activeTab === 'con') params.set('efc', filtros.efc)
      if (filtros.agente) params.set('agente', filtros.agente)

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
    } catch (error) {
      console.error('Error fetching comisiones:', error)
    } finally {
      setLoading(false)
    }
  }, [activeTab, filtros])

  useEffect(() => {
    fetchComisiones()
  }, [fetchComisiones])

  const handleFilterChange = (key: string, value: string) => {
    setFiltros(prev => ({ ...prev, [key]: value }))
  }

  const resetFiltros = () => {
    setFiltros({ periodo: '', efc: '', agente: '' })
  }

  return (
    <div className="container-fluid py-4">
      <div className="row mb-4">
        <div className="col">
          <h2>Dashboard de Comisiones</h2>
          <p className="text-muted">
            Consulta las comisiones de agentes con y sin mes de conexión establecido
          </p>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Filtros */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Periodo</label>
              <input
                type="month"
                className="form-control"
                value={filtros.periodo}
                onChange={(e) => handleFilterChange('periodo', e.target.value)}
              />
            </div>
            
            {activeTab === 'con' && (
              <div className="col-md-3">
                <label className="form-label">EFC ID</label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="ID del EFC"
                  value={filtros.efc}
                  onChange={(e) => handleFilterChange('efc', e.target.value)}
                />
              </div>
            )}

            <div className="col-md-3">
              <label className="form-label">Agente</label>
              <input
                type="text"
                className="form-control"
                placeholder="Nombre o ID"
                value={filtros.agente}
                onChange={(e) => handleFilterChange('agente', e.target.value)}
              />
            </div>

            <div className="col-md-3 d-flex align-items-end">
              <button 
                className="btn btn-outline-secondary w-100"
                onClick={resetFiltros}
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen */}
      {(resumenCon || resumenSin) && (
        <div className="row mb-4">
          <div className="col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="text-muted mb-1">Total Pólizas</h6>
                <h3>{(activeTab === 'con' ? resumenCon : resumenSin)?.total_polizas || 0}</h3>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="text-muted mb-1">Prima Total</h6>
                <h3>{formatCurrency((activeTab === 'con' ? resumenCon : resumenSin)?.total_prima || 0)}</h3>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="text-muted mb-1">Comisión Total</h6>
                <h3 className="text-success">
                  {formatCurrency((activeTab === 'con' ? resumenCon : resumenSin)?.total_comision || 0)}
                </h3>
              </div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="text-muted mb-1">Periodos</h6>
                <h3>{(activeTab === 'con' ? resumenCon : resumenSin)?.periodos_unicos || 0}</h3>
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
          {activeTab === 'con' ? (
            <TablaConConexion data={comisionesCon} />
          ) : (
            <TablaSinConexion data={comisionesSin} />
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
                <th>EFC</th>
                <th>Agente</th>
                <th className="text-center">Mes Conexión</th>
                <th className="text-center">Total Pólizas</th>
                <th className="text-center">Mes 1</th>
                <th className="text-center">Mes 2</th>
                <th className="text-center">Mes 3</th>
                <th className="text-center">Mes 4+</th>
                <th className="text-end">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.periodo}</td>
                  <td>{row.efc_nombre}</td>
                  <td>{row.agente_nombre}</td>
                  <td className="text-center">
                    <span className="badge bg-info">{row.mes_conexion}</span>
                  </td>
                  <td className="text-center fw-bold">{row.total_polizas}</td>
                  <td className="text-center">
                    {row.polizas_mes_1}
                    <br />
                    <small className="text-muted">{formatCurrency(row.prima_mes_1)}</small>
                  </td>
                  <td className="text-center">
                    {row.polizas_mes_2}
                    <br />
                    <small className="text-muted">{formatCurrency(row.prima_mes_2)}</small>
                  </td>
                  <td className="text-center">
                    {row.polizas_mes_3}
                    <br />
                    <small className="text-muted">{formatCurrency(row.prima_mes_3)}</small>
                  </td>
                  <td className="text-center">
                    {row.polizas_mes_4_plus}
                    <br />
                    <small className="text-muted">{formatCurrency(row.prima_mes_4_plus)}</small>
                  </td>
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
