'use client'
import React from 'react'

type Cliente = {
  id: string
  cliente_code: string
  primer_nombre: string
  segundo_nombre: string | null
  primer_apellido: string
  segundo_apellido: string
  telefono_celular: string
  email: string
  fecha_nacimiento?: string | null
}

type Poliza = {
  id: string
  cliente_id: string
  numero_poliza: string
  producto_nombre: string | null
  estatus: string
  forma_pago: string
  prima_input: number
  prima_moneda: string
  fecha_emision: string | null
  renovacion: string | null
  tipo_producto: string | null
}

export default function VistaAsesorPage() {
  const [clientes, setClientes] = React.useState<Cliente[]>([])
  const [loadingClientes, setLoadingClientes] = React.useState(true)
  const [error, setError] = React.useState<string>('')
  const [selectedCliente, setSelectedCliente] = React.useState<Cliente | null>(null)
  const [polizas, setPolizas] = React.useState<Poliza[]>([])
  const [loadingPolizas, setLoadingPolizas] = React.useState(false)

  React.useEffect(() => {
    ;(async () => {
      try {
        setLoadingClientes(true)
        const res = await fetch('/api/clientes?q=')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error clientes')
        setClientes(data.items || [])
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error cargando clientes'
        setError(msg)
      } finally {
        setLoadingClientes(false)
      }
    })()
  }, [])

  const loadPolizas = async (cliente: Cliente) => {
    setSelectedCliente(cliente)
    setLoadingPolizas(true)
    setPolizas([])
    try {
      const res = await fetch(`/api/polizas?cliente_id=${encodeURIComponent(cliente.id)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error pólizas')
      setPolizas(data.items || [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error cargando pólizas'
      setError(msg)
    } finally {
      setLoadingPolizas(false)
    }
  }

  const nombreCompleto = (c: Cliente) => [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean).join(' ')

  return (
    <div className="container py-4">
      <h4 className="mb-3">Vista Asesor</h4>
      {error ? <div className="alert alert-danger">{error}</div> : null}

      {/* Paso 1: Seleccionar cliente */}
      <div className="card mb-4 shadow-sm">
        <div className="card-header bg-light fw-semibold">Selecciona un cliente</div>
        <div className="card-body">
          {loadingClientes ? (
            <div>Cargando clientes...</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Número de cliente</th>
                    <th>Contratante</th>
                    <th>Teléfono</th>
                    <th>Correo</th>
                    <th>Cumpleaños</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map(c => (
                    <tr key={c.id}>
                      <td>{c.cliente_code}</td>
                      <td>{nombreCompleto(c)}</td>
                      <td>{c.telefono_celular}</td>
                      <td>{c.email}</td>
                      <td>{c.fecha_nacimiento ? new Date(c.fecha_nacimiento).toLocaleDateString() : '—'}</td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => loadPolizas(c)}>Ver pólizas</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Paso 2: Pólizas del cliente seleccionado */}
      {selectedCliente && (
        <div className="card shadow-sm">
          <div className="card-header bg-light d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Pólizas de: {nombreCompleto(selectedCliente)}</span>
            <button className="btn btn-link btn-sm" onClick={() => setSelectedCliente(null)}>Cambiar cliente</button>
          </div>
          <div className="card-body">
            {loadingPolizas ? (
              <div>Cargando pólizas...</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle">
                  <thead>
                    <tr>
                      <th>No. Póliza</th>
                      <th>Producto</th>
                      <th>Estatus</th>
                      <th>Forma de pago</th>
                      <th>Fecha de emisión</th>
                      <th>Renovación</th>
                      <th>Tipo</th>
                      <th>Prima</th>
                    </tr>
                  </thead>
                  <tbody>
                    {polizas.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-muted">Sin pólizas</td></tr>
                    ) : polizas.map(p => (
                      <tr key={p.id}>
                        <td>{p.numero_poliza}</td>
                        <td>{p.producto_nombre || '—'}</td>
                        <td>{p.estatus}</td>
                        <td>{p.forma_pago}</td>
                        <td>{p.fecha_emision ? new Date(p.fecha_emision).toLocaleDateString() : '—'}</td>
                        <td>{p.renovacion ? new Date(p.renovacion).toLocaleDateString() : '—'}</td>
                        <td>{p.tipo_producto || '—'}</td>
                        <td>{new Intl.NumberFormat(undefined, { style: 'currency', currency: p.prima_moneda || 'MXN' }).format(p.prima_input || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
