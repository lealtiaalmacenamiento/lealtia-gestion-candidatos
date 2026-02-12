/**
 * Calculadora de UDI - Componente de ejemplo
 * Permite calcular el valor futuro de un monto en pesos usando UDI
 */

'use client'

import { useState } from 'react'
import { calcularValorFuturoUDI } from '@/lib/udi'

export default function UDICalculator() {
  const [monto, setMonto] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [resultado, setResultado] = useState<{
    udiActual: number
    udiFutura: number
    montoFuturo: number
    esProyeccion: boolean
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCalculate = async () => {
    if (!monto || !fechaInicio || !fechaFin) return

    setLoading(true)
    setError(null)
    
    try {
      const result = await calcularValorFuturoUDI(
        Number(monto),
        fechaInicio,
        fechaFin
      )
      
      if (!result) {
        setError('No se encontraron valores de UDI para las fechas especificadas')
        setResultado(null)
      } else {
        setResultado(result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al calcular')
      setResultado(null)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2
    }).format(value)
  }

  const incremento = resultado 
    ? ((resultado.montoFuturo / Number(monto)) - 1) * 100
    : 0

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title">Calculadora de UDI</h5>
        <p className="text-muted small">
          Calcula el valor futuro de un monto considerando la inflación (UDI)
        </p>
        
        <div className="mb-3">
          <label className="form-label">Monto inicial (MXN)</label>
          <input
            type="number"
            className="form-control"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            placeholder="10000"
            min="0"
            step="0.01"
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Fecha inicial</label>
          <input
            type="date"
            className="form-control"
            value={fechaInicio}
            onChange={e => setFechaInicio(e.target.value)}
          />
        </div>

        <div className="mb-3">
          <label className="form-label">Fecha futura</label>
          <input
            type="date"
            className="form-control"
            value={fechaFin}
            onChange={e => setFechaFin(e.target.value)}
          />
          <div className="form-text">
            Puede consultar hasta 65 años en el futuro (proyecciones)
          </div>
        </div>

        <button
          className="btn btn-primary w-100"
          onClick={handleCalculate}
          disabled={loading || !monto || !fechaInicio || !fechaFin}
        >
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              Calculando...
            </>
          ) : (
            'Calcular'
          )}
        </button>

        {error && (
          <div className="alert alert-danger mt-3 mb-0" role="alert">
            {error}
          </div>
        )}

        {resultado && (
          <div className="mt-4">
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="card-subtitle mb-3">Resultado:</h6>
                
                <dl className="row mb-2">
                  <dt className="col-sm-6">UDI actual ({fechaInicio}):</dt>
                  <dd className="col-sm-6">{resultado.udiActual.toFixed(6)}</dd>
                  
                  <dt className="col-sm-6">UDI futura ({fechaFin}):</dt>
                  <dd className="col-sm-6">
                    {resultado.udiFutura.toFixed(6)}
                    {resultado.esProyeccion && (
                      <span className="badge bg-warning text-dark ms-2">
                        Proyección
                      </span>
                    )}
                  </dd>
                </dl>

                <hr />

                <dl className="row mb-2">
                  <dt className="col-sm-6">Monto inicial:</dt>
                  <dd className="col-sm-6">{formatCurrency(Number(monto))}</dd>
                  
                  <dt className="col-sm-6 text-success">Valor futuro:</dt>
                  <dd className="col-sm-6 fw-bold text-success">
                    {formatCurrency(resultado.montoFuturo)}
                  </dd>
                  
                  <dt className="col-sm-6">Incremento:</dt>
                  <dd className="col-sm-6">
                    <span className={incremento >= 0 ? 'text-success' : 'text-danger'}>
                      {incremento >= 0 ? '+' : ''}{incremento.toFixed(2)}%
                    </span>
                  </dd>
                </dl>

                {resultado.esProyeccion && (
                  <div className="alert alert-info mb-0 small">
                    <strong>Nota:</strong> Este cálculo usa valores proyectados de UDI 
                    basados en la meta de inflación de Banxico (3% anual).
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
