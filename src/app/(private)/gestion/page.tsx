"use client"
import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'

type Cliente = {
  id: string
  cliente_code?: string
  primer_nombre?: string|null
  segundo_nombre?: string|null
  primer_apellido?: string|null
  segundo_apellido?: string|null
  email?: string|null
  telefono_celular?: string|null
}

type Poliza = {
  id: string
  cliente_id: string
  numero_poliza?: string|null
  estatus?: string|null
  forma_pago?: string|null
  prima_input?: number|null
  prima_moneda?: string|null
  sa_input?: number|null
  sa_moneda?: string|null
}

export default function GestionPage() {
  const { user } = useAuth()
  const role = (user?.rol || '').toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin'].includes(role)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [polizas, setPolizas] = useState<Poliza[]>([])
  const [qClientes, setQClientes] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [view, setView] = useState<'list' | 'cliente' | 'polizas'>('list')
  const [loading, setLoading] = useState(false)

  const [editCliente, setEditCliente] = useState<Cliente|null>(null)
  const [editPoliza, setEditPoliza] = useState<Poliza|null>(null)
  const [creating, setCreating] = useState(false)
  const [nuevo, setNuevo] = useState<Cliente & { telefono_celular?: string|null }>({ id: '', telefono_celular: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rc = await fetch(`/api/clientes?q=${encodeURIComponent(qClientes)}`)
      const jc = await rc.json()
      setClientes(jc.items || [])
    } finally { setLoading(false) }
  }, [qClientes])

  useEffect(() => { void load() }, [load])

  async function submitClienteCambio(c: Cliente) {
    // Construir payload mínimo desde el formulario
    const payload: Record<string, unknown> = {
      primer_nombre: c.primer_nombre ?? undefined,
      segundo_nombre: c.segundo_nombre ?? undefined,
      primer_apellido: c.primer_apellido ?? undefined,
      segundo_apellido: c.segundo_apellido ?? undefined,
      telefono_celular: c.telefono_celular ?? undefined,
      correo: c.email ?? undefined,
    }
    const res = await fetch('/api/clientes/updates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: c.id, payload })
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || 'Error al enviar solicitud'); return }
    if (isSuper && j.id) {
      // Opcional: aprobar de inmediato
      await fetch('/api/clientes/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: j.id }) })
    }
    alert(isSuper ? 'Guardado y aprobado' : 'Solicitud enviada')
    setEditCliente(null)
  }

  async function submitPolizaCambio(p: Poliza) {
    const payload: Record<string, unknown> = {
      numero_poliza: emptyAsUndef(p.numero_poliza),
      estatus: emptyAsUndef(p.estatus),
      forma_pago: emptyAsUndef(p.forma_pago),
      prima_input: p.prima_input ?? undefined,
      prima_moneda: emptyAsUndef(p.prima_moneda),
      sa_input: p.sa_input ?? undefined,
      sa_moneda: emptyAsUndef(p.sa_moneda),
    }
    const res = await fetch('/api/polizas/updates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poliza_id: p.id, payload })
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || 'Error al enviar solicitud'); return }
    if (isSuper && j.id) {
      await fetch('/api/polizas/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: j.id }) })
    }
    alert(isSuper ? 'Guardado y aprobado' : 'Solicitud enviada')
    setEditPoliza(null)
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Clientes y Pólizas</h1>
      {loading && <p className="text-sm text-gray-600">Cargando…</p>}
      {view === 'list' && (
        <section className="border rounded p-3">
          <header className="flex items-center gap-2 mb-3">
            <h2 className="font-medium">Clientes</h2>
            <input className="border px-2 py-1 text-sm ml-auto" placeholder="Buscar…" value={qClientes} onChange={e=>setQClientes(e.target.value)} />
            <button className="px-3 py-1 text-sm bg-gray-100 border rounded" onClick={()=>load()}>Buscar</button>
            <button className="px-3 py-1 text-sm btn btn-primary" onClick={()=>{ setCreating(true); setNuevo({ id: '', telefono_celular: '' }) }}>Nuevo cliente</button>
          </header>
          <div className="table-responsive small">
            <table className="table table-sm table-striped align-middle">
              <thead>
                <tr>
                  <th>Número de cliente</th>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id}>
                    <td className="font-mono text-xs">{c.cliente_code || c.id}</td>
                    <td className="text-xs">{fmtNombre(c)}</td>
                    <td className="text-xs">{c.email || '—'}</td>
                    <td className="text-end">
                      <div className="d-flex gap-2 justify-content-end">
                        <button className="btn btn-sm btn-outline-primary" onClick={()=>{ setSelectedCliente(c); setView('cliente') }}>Ver cliente</button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={async()=>{ setSelectedCliente(c); setView('polizas'); setLoading(true); try { const rp = await fetch(`/api/polizas?cliente_id=${c.id}`); const jp = await rp.json(); setPolizas(jp.items || []) } finally { setLoading(false) } }}>Ver pólizas</button>
                        <button className="btn btn-sm btn-primary" onClick={()=>setEditCliente({...c})}>Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!clientes.length && <tr><td colSpan={4} className="text-center text-muted py-3">Sin resultados</td></tr>}
              </tbody>
            </table>
          </div>
          {editCliente && (
            <div className="mt-3 border rounded p-3 bg-light">
              <h3 className="small fw-bold mb-2">Editar cliente</h3>
              <div className="grid grid-cols-2 gap-2">
                <input className="form-control form-control-sm" placeholder="Primer nombre" value={editCliente.primer_nombre||''} onChange={e=>setEditCliente({...editCliente, primer_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo nombre" value={editCliente.segundo_nombre||''} onChange={e=>setEditCliente({...editCliente, segundo_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Primer apellido" value={editCliente.primer_apellido||''} onChange={e=>setEditCliente({...editCliente, primer_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo apellido" value={editCliente.segundo_apellido||''} onChange={e=>setEditCliente({...editCliente, segundo_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Teléfono celular" value={editCliente.telefono_celular||''} onChange={e=>setEditCliente({...editCliente, telefono_celular: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Email" value={editCliente.email||''} onChange={e=>setEditCliente({...editCliente, email: e.target.value})} />
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setEditCliente(null)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={()=>submitClienteCambio(editCliente)}>{isSuper? 'Guardar y aprobar':'Enviar solicitud'}</button>
              </div>
            </div>
          )}
          {creating && (
            <div className="mt-3 border rounded p-3 bg-light">
              <h3 className="small fw-bold mb-2">Nuevo cliente</h3>
              <div className="grid grid-cols-2 gap-2">
                <input className="form-control form-control-sm" placeholder="Primer nombre" value={nuevo.primer_nombre||''} onChange={e=>setNuevo({...nuevo, primer_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo nombre" value={nuevo.segundo_nombre||''} onChange={e=>setNuevo({...nuevo, segundo_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Primer apellido" value={nuevo.primer_apellido||''} onChange={e=>setNuevo({...nuevo, primer_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo apellido (deja vacío si no aplica)" value={nuevo.segundo_apellido||''} onChange={e=>setNuevo({...nuevo, segundo_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Teléfono celular" value={nuevo.telefono_celular||''} onChange={e=>setNuevo({...nuevo, telefono_celular: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Email" value={nuevo.email||''} onChange={e=>setNuevo({...nuevo, email: e.target.value})} />
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setCreating(false)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={async()=>{
                  try {
                    const res = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                      primer_nombre: nuevo.primer_nombre,
                      segundo_nombre: nuevo.segundo_nombre,
                      primer_apellido: nuevo.primer_apellido,
                      segundo_apellido: nuevo.segundo_apellido,
                      telefono_celular: nuevo.telefono_celular,
                      email: nuevo.email,
                    })})
                    const j = await res.json()
                    if (!res.ok) { alert(j.error || 'Error al crear'); return }
                    setCreating(false)
                    setNuevo({ id: '', telefono_celular: '' })
                    await load()
                  } catch { alert('Error al crear') }
                }}>Crear</button>
              </div>
            </div>
          )}
        </section>
      )}

      {view === 'cliente' && selectedCliente && (
        <section className="border rounded p-3">
          <div className="d-flex align-items-center mb-3 gap-2">
            <button className="btn btn-sm btn-light border" onClick={()=>setView('list')}>← Volver</button>
            <h2 className="mb-0">Cliente</h2>
            <span className="ms-auto small text-muted">Número de cliente: {selectedCliente.cliente_code || selectedCliente.id}</span>
          </div>
          <div className="mb-3">
            <div className="row g-2">
              <div className="col-md-6">
                <label className="form-label small">Nombre</label>
                <div className="form-control form-control-sm">{fmtNombre(selectedCliente)}</div>
              </div>
              <div className="col-md-6">
                <label className="form-label small">Email</label>
                <div className="form-control form-control-sm">{selectedCliente.email || '—'}</div>
              </div>
            </div>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={async()=>{ setView('polizas'); setLoading(true); try{ const rp = await fetch(`/api/polizas?cliente_id=${selectedCliente.id}`); const jp = await rp.json(); setPolizas(jp.items || []) } finally { setLoading(false) } }}>Ver pólizas</button>
            <button className="btn btn-sm btn-primary" onClick={()=>setEditCliente({...selectedCliente})}>Editar</button>
          </div>
          {editCliente && (
            <div className="mt-3 border rounded p-3 bg-light">
              <h3 className="small fw-bold mb-2">Editar cliente</h3>
              <div className="grid grid-cols-2 gap-2">
                <input className="form-control form-control-sm" placeholder="Primer nombre" value={editCliente.primer_nombre||''} onChange={e=>setEditCliente({...editCliente, primer_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo nombre" value={editCliente.segundo_nombre||''} onChange={e=>setEditCliente({...editCliente, segundo_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Primer apellido" value={editCliente.primer_apellido||''} onChange={e=>setEditCliente({...editCliente, primer_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo apellido" value={editCliente.segundo_apellido||''} onChange={e=>setEditCliente({...editCliente, segundo_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Teléfono celular" value={editCliente.telefono_celular||''} onChange={e=>setEditCliente({...editCliente, telefono_celular: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Email" value={editCliente.email||''} onChange={e=>setEditCliente({...editCliente, email: e.target.value})} />
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setEditCliente(null)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={()=>submitClienteCambio(editCliente)}>{isSuper? 'Guardar y aprobar':'Enviar solicitud'}</button>
              </div>
            </div>
          )}
        </section>
      )}

      {view === 'polizas' && selectedCliente && (
        <section className="border rounded p-3">
          <div className="d-flex align-items-center mb-3 gap-2">
            <button className="btn btn-sm btn-light border" onClick={()=>setView('list')}>← Volver</button>
            <h2 className="mb-0">Pólizas de {fmtNombre(selectedCliente) || selectedCliente.email || selectedCliente.id}</h2>
          </div>
          <div className="table-responsive small">
            <table className="table table-sm table-striped align-middle">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>No. Póliza</th>
                  <th>Estatus</th>
                  <th>Prima</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {polizas.map(p => (
                  <tr key={p.id}>
                    <td className="font-mono text-xs">{p.id}</td>
                    <td className="text-xs">{p.numero_poliza || '—'}</td>
                    <td className="text-xs">{p.estatus || '—'}</td>
                    <td className="text-xs">{p.prima_input ?? '—'} {p.prima_moneda || ''}</td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-primary" onClick={()=>setEditPoliza({...p})}>Editar</button>
                    </td>
                  </tr>
                ))}
                {!polizas.length && <tr><td colSpan={5} className="text-center text-muted py-3">Sin resultados</td></tr>}
              </tbody>
            </table>
          </div>
          {editPoliza && (
            <div className="mt-3 border rounded p-3 bg-light">
              <h3 className="small fw-bold mb-2">Editar póliza</h3>
              <div className="grid grid-cols-2 gap-2">
                <input className="form-control form-control-sm" placeholder="Número de póliza" value={editPoliza.numero_poliza||''} onChange={e=>setEditPoliza({...editPoliza, numero_poliza: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Estatus (EN_VIGOR/ANULADA)" value={editPoliza.estatus||''} onChange={e=>setEditPoliza({...editPoliza, estatus: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Forma de pago" value={editPoliza.forma_pago||''} onChange={e=>setEditPoliza({...editPoliza, forma_pago: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Prima" value={editPoliza.prima_input ?? ''} onChange={e=>setEditPoliza({...editPoliza, prima_input: toNumOrNull(e.target.value)})} />
                <input className="form-control form-control-sm" placeholder="Moneda prima (MXN/USD/UDI)" value={editPoliza.prima_moneda||''} onChange={e=>setEditPoliza({...editPoliza, prima_moneda: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Suma Asegurada" value={editPoliza.sa_input ?? ''} onChange={e=>setEditPoliza({...editPoliza, sa_input: toNumOrNull(e.target.value)})} />
                <input className="form-control form-control-sm" placeholder="Moneda SA (MXN/USD/UDI)" value={editPoliza.sa_moneda||''} onChange={e=>setEditPoliza({...editPoliza, sa_moneda: e.target.value})} />
              </div>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setEditPoliza(null)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={()=>submitPolizaCambio(editPoliza)}>{isSuper? 'Guardar y aprobar':'Enviar solicitud'}</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function fmtNombre(c: Cliente) {
  const parts = [c.primer_nombre, c.segundo_nombre, c.primer_apellido, c.segundo_apellido].filter(Boolean)
  return parts.length ? parts.join(' ') : '—'
}
function emptyAsUndef(v?: string|null) { const s = (v||'').trim(); return s ? s : undefined }
function toNumOrNull(s: string) { const n = Number(s.replace(/,/g,'')); return isFinite(n) ? n : null }
