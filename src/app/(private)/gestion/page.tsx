"use client"
import React, { useCallback, useEffect, useState } from 'react'
import AppModal from '@/components/ui/AppModal'
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
  fecha_nacimiento?: string|null
}

type Poliza = {
  id: string
  cliente_id: string
  numero_poliza?: string|null
  estatus?: string|null
  forma_pago?: string|null // método cobro (MODO_DIRECTO/CARGO_AUTOMATICO)
  periodicidad_pago?: string|null // A/S/T/M
  prima_input?: number|null
  prima_moneda?: string|null
  sa_input?: number|null
  sa_moneda?: string|null
  producto_nombre?: string|null
  fecha_emision?: string|null
  renovacion?: string|null
  tipo_producto?: string|null
  fecha_renovacion?: string|null
  dia_pago?: number|null
  meses_check?: Record<string, boolean>|null
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
  const [nuevo, setNuevo] = useState<Cliente & { telefono_celular?: string|null, fecha_nacimiento?: string|null }>({ id: '', telefono_celular: '', fecha_nacimiento: null })
  // creación de póliza deshabilitada temporalmente
  const [addingPoliza, setAddingPoliza] = useState(false)
  const [submittingNuevaPoliza, setSubmittingNuevaPoliza] = useState(false)
  const [productos, setProductos] = useState<Array<{ id: string; nombre_comercial: string; tipo_producto: string; moneda?: string|null; sa_min?: number|null; sa_max?: number|null }>>([])
  const [tipoProducto, setTipoProducto] = useState<string>('')
  const [nuevaPoliza, setNuevaPoliza] = useState<{ numero_poliza: string; fecha_emision: string; fecha_renovacion: string; estatus: string; forma_pago: string; periodicidad_pago?: string; dia_pago: string; prima_input: string; prima_moneda: string; producto_parametro_id?: string; meses_check: Record<string, boolean> }>({ numero_poliza: '', fecha_emision: '', fecha_renovacion: '', estatus: 'EN_VIGOR', forma_pago: '', periodicidad_pago: undefined, dia_pago: '', prima_input: '', prima_moneda: 'MXN', meses_check: {} })

  useEffect(() => {
    if (!addingPoliza) return
    ;(async()=>{
      try {
        const r = await fetch('/api/producto_parametros?debug=1', { cache: 'no-store' })
        const j = await r.json()
        if (r.ok && Array.isArray(j)) setProductos(j)
      } catch {}
    })()
  }, [addingPoliza])
  // vista meses comprimida (sin toggle por ahora)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rc = await fetch(`/api/clientes?q=${encodeURIComponent(qClientes)}`)
      const jc = await rc.json()
      setClientes(jc.items || [])
    } finally { setLoading(false) }
  }, [qClientes])

  useEffect(() => { void load() }, [load])

  // Vista unificada: se elimina redirección a /asesor para que agentes usen esta página directamente

  // Cargar productos parametrizados al abrir el modal de nueva póliza
  // efecto de carga de productos removido

  async function submitClienteCambio(c: Cliente) {
    // Construir payload mínimo desde el formulario
    const payload: Record<string, unknown> = {
      primer_nombre: c.primer_nombre ?? undefined,
      segundo_nombre: c.segundo_nombre ?? undefined,
      primer_apellido: c.primer_apellido ?? undefined,
      segundo_apellido: c.segundo_apellido ?? undefined,
      telefono_celular: c.telefono_celular ?? undefined,
      correo: c.email ?? undefined,
  fecha_nacimiento: c.fecha_nacimiento ?? undefined,
    }
    const res = await fetch('/api/clientes/updates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: c.id, payload })
    })
    const j = await res.json()
    if (!res.ok) { alert(j.error || 'Error al enviar solicitud'); return }
    if (isSuper && j.id) {
      const ra = await fetch('/api/clientes/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: j.id }) })
      const ja = await ra.json().catch(()=>({}))
      if (!ra.ok) { alert(ja.error || 'Error al aprobar'); return }
      alert('Guardado y aprobado')
    } else {
      alert('Solicitud enviada')
    }
    setEditCliente(null)
  }

  async function submitPolizaCambio(p: Poliza) {
    const payload: Record<string, unknown> = {
      numero_poliza: emptyAsUndef(p.numero_poliza),
      estatus: emptyAsUndef(p.estatus),
      forma_pago: emptyAsUndef(p.forma_pago),
      fecha_emision: emptyAsUndef(p.fecha_emision),
      fecha_renovacion: emptyAsUndef(p.fecha_renovacion),
  periodicidad_pago: emptyAsUndef(p.periodicidad_pago),
      dia_pago: p.dia_pago ?? undefined,
      prima_input: p.prima_input ?? undefined,
      prima_moneda: emptyAsUndef(p.prima_moneda),
      meses_check: p.meses_check || {},
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
      <div className="d-flex align-items-center mb-4 gap-2">
        <h1 className="text-xl font-semibold mb-0">Clientes y Pólizas</h1>
      </div>
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
                    <td className="font-mono text-xs">{c.cliente_code || c.id}</td>
                    <td className="text-xs">{fmtNombre(c)}</td>
                    <td className="text-xs">{c.telefono_celular || '—'}</td>
                    <td className="text-xs">{c.email || '—'}</td>
                    <td className="text-xs">{c.fecha_nacimiento ? new Date(c.fecha_nacimiento).toLocaleDateString() : '—'}</td>
                    <td className="text-end">
                      <div className="d-flex gap-2 justify-content-end">
                        <button className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={async()=>{ setSelectedCliente(c); setView('polizas'); setLoading(true); try { const rp = await fetch(`/api/polizas?cliente_id=${c.id}`); const jp = await rp.json(); setPolizas(jp.items || []) } finally { setLoading(false) } }}>Ver pólizas</button>
                        <button className="btn btn-sm btn-primary" onClick={()=>setEditCliente({...c})}>Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!clientes.length && <tr><td colSpan={6} className="text-center text-muted py-3">Sin resultados</td></tr>}
              </tbody>
            </table>
          </div>
          {editCliente && (
            <AppModal title="Editar cliente" icon="person-fill" onClose={()=>setEditCliente(null)}>
              <div className="grid grid-cols-2 gap-2">
                <div className="d-flex flex-column"><label className="form-label small">Primer nombre</label><input className="form-control form-control-sm" value={editCliente.primer_nombre||''} onChange={e=>setEditCliente({...editCliente, primer_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo nombre</label><input className="form-control form-control-sm" value={editCliente.segundo_nombre||''} onChange={e=>setEditCliente({...editCliente, segundo_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Primer apellido</label><input className="form-control form-control-sm" value={editCliente.primer_apellido||''} onChange={e=>setEditCliente({...editCliente, primer_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo apellido</label><input className="form-control form-control-sm" value={editCliente.segundo_apellido||''} onChange={e=>setEditCliente({...editCliente, segundo_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Teléfono celular</label><input className="form-control form-control-sm" value={editCliente.telefono_celular||''} onChange={e=>setEditCliente({...editCliente, telefono_celular: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Email</label><input className="form-control form-control-sm" type="email" value={editCliente.email||''} onChange={e=>setEditCliente({...editCliente, email: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Cumpleaños</label><input className="form-control form-control-sm" type="date" value={editCliente.fecha_nacimiento || ''} onChange={e=>setEditCliente({...editCliente, fecha_nacimiento: e.target.value})} /></div>
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setEditCliente(null)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={()=>submitClienteCambio(editCliente)}>{isSuper? 'Guardar y aprobar':'Enviar solicitud'}</button>
              </div>
            </AppModal>
          )}
          {creating && (
            <AppModal title="Nuevo cliente" icon="person-plus" onClose={()=>setCreating(false)}>
              <div className="grid grid-cols-2 gap-2">
                <div className="d-flex flex-column"><label className="form-label small">Primer nombre</label><input className="form-control form-control-sm" value={nuevo.primer_nombre||''} onChange={e=>setNuevo({...nuevo, primer_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo nombre</label><input className="form-control form-control-sm" value={nuevo.segundo_nombre||''} onChange={e=>setNuevo({...nuevo, segundo_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Primer apellido</label><input className="form-control form-control-sm" value={nuevo.primer_apellido||''} onChange={e=>setNuevo({...nuevo, primer_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo apellido</label><input className="form-control form-control-sm" value={nuevo.segundo_apellido||''} onChange={e=>setNuevo({...nuevo, segundo_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Teléfono celular</label><input className="form-control form-control-sm" value={nuevo.telefono_celular||''} onChange={e=>setNuevo({...nuevo, telefono_celular: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Email</label><input className="form-control form-control-sm" type="email" value={nuevo.email||''} onChange={e=>setNuevo({...nuevo, email: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Cumpleaños</label><input className="form-control form-control-sm" type="date" value={nuevo.fecha_nacimiento || ''} onChange={e=>setNuevo({...nuevo, fecha_nacimiento: e.target.value})} /></div>
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setCreating(false)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={async()=>{
                  // Validación mínima requerida por schema
                  if (!nuevo.primer_nombre || !nuevo.primer_apellido || !nuevo.telefono_celular || !nuevo.email) {
                    alert('Campos requeridos: Primer nombre, Primer apellido, Teléfono celular y Email')
                    return
                  }
                  try {
                    const res = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                      primer_nombre: nuevo.primer_nombre,
                      segundo_nombre: nuevo.segundo_nombre,
                      primer_apellido: nuevo.primer_apellido,
                      segundo_apellido: nuevo.segundo_apellido,
                      telefono_celular: nuevo.telefono_celular,
                      email: nuevo.email,
                      fecha_nacimiento: nuevo.fecha_nacimiento || null,
                    })})
                    const j = await res.json()
                    if (!res.ok) { alert(j.error || 'Error al crear'); return }
                    setCreating(false)
                    setNuevo({ id: '', telefono_celular: '', fecha_nacimiento: null })
                    await load()
                  } catch { alert('Error al crear') }
                }}>Crear</button>
              </div>
            </AppModal>
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
                <div className="d-flex flex-column"><label className="form-label small">Primer nombre</label><input className="form-control form-control-sm" value={editCliente.primer_nombre||''} onChange={e=>setEditCliente({...editCliente, primer_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo nombre</label><input className="form-control form-control-sm" value={editCliente.segundo_nombre||''} onChange={e=>setEditCliente({...editCliente, segundo_nombre: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Primer apellido</label><input className="form-control form-control-sm" value={editCliente.primer_apellido||''} onChange={e=>setEditCliente({...editCliente, primer_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Segundo apellido</label><input className="form-control form-control-sm" value={editCliente.segundo_apellido||''} onChange={e=>setEditCliente({...editCliente, segundo_apellido: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Teléfono celular</label><input className="form-control form-control-sm" value={editCliente.telefono_celular||''} onChange={e=>setEditCliente({...editCliente, telefono_celular: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Email</label><input className="form-control form-control-sm" type="email" value={editCliente.email||''} onChange={e=>setEditCliente({...editCliente, email: e.target.value})} /></div>
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
            <button className="btn btn-sm btn-success ms-auto" onClick={()=>{ setAddingPoliza(true); setNuevaPoliza({ numero_poliza:'', fecha_emision:'', fecha_renovacion:'', estatus:'EN_VIGOR', forma_pago:'', periodicidad_pago: undefined, dia_pago:'', prima_input:'', prima_moneda:'MXN', meses_check:{}, producto_parametro_id: undefined }) }}>Agregar póliza</button>
          </div>
    <div className="table-responsive small">
            <table className="table table-sm table-striped align-middle">
              <thead>
                <tr>
                  <th>No. Póliza</th>
                  <th>Producto</th>
                  <th>Estatus</th>
                    <th>Periodicidad</th>
                    <th>Método pago</th>
                  <th>Fecha de emisión</th>
                  <th>Fecha renovación</th>
                  <th>Tipo</th>
                  <th>Día de pago</th>
                  <th>Prima</th>
                  {generateMonthKeys().map(m => <th key={m}>{shortMonthHeader(m)}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {polizas.map(p => (
                  <tr key={p.id}>
                    <td className="text-xs">{p.numero_poliza || '—'}</td>
                    <td className="text-xs">{p.producto_nombre || '—'}</td>
                    <td className="text-xs">{p.estatus || '—'}</td>
                    <td className="text-xs">{p.periodicidad_pago || '—'}</td>
                    <td className="text-xs">{p.forma_pago || '—'}</td>
                    <td className="text-xs">{p.fecha_emision ? new Date(p.fecha_emision).toLocaleDateString() : '—'}</td>
                    <td className="text-xs">{p.fecha_renovacion ? new Date(p.fecha_renovacion).toLocaleDateString() : '—'}</td>
                    <td className="text-xs">{p.tipo_producto || '—'}</td>
                    <td className="text-xs">{p.dia_pago ?? '—'}</td>
                    <td className="text-xs">{typeof p.prima_input === 'number' ? formatMoney(p.prima_input, p.prima_moneda) : '—'}</td>
                    {generateMonthKeys().map(m => <td key={m} className="text-center text-xs">{p.meses_check && p.meses_check[m] ? '✔' : ''}</td>)}
                    <td className="text-end">
                      <button className="btn btn-sm btn-primary" onClick={()=>setEditPoliza({...p})}>Editar</button>
                    </td>
                  </tr>
                ))}
                {!polizas.length && <tr><td colSpan={12 + generateMonthKeys().length} className="text-center text-muted py-3">Sin resultados</td></tr>}
              </tbody>
            </table>
          </div>
          {editPoliza && (
            <AppModal title={`Editar póliza ${editPoliza.numero_poliza || ''}`} icon="file-earmark-text" onClose={()=>setEditPoliza(null)}>
              <div className="grid grid-cols-2 gap-2">
                <div className="d-flex flex-column"><label className="form-label small">No. Póliza</label><input className="form-control form-control-sm" value={editPoliza.numero_poliza||''} onChange={e=>setEditPoliza({...editPoliza, numero_poliza: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Estatus</label><input className="form-control form-control-sm" value={editPoliza.estatus||''} onChange={e=>setEditPoliza({...editPoliza, estatus: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Periodicidad</label>
                  <select className="form-select form-select-sm" value={editPoliza.periodicidad_pago||''} onChange={e=>setEditPoliza({...editPoliza, periodicidad_pago: e.target.value})}>
                    <option value="">—</option>
                    <option value="A">A</option>
                    <option value="S">S</option>
                    <option value="T">T</option>
                    <option value="M">M</option>
                  </select>
                </div>
                <div className="d-flex flex-column"><label className="form-label small">Método de pago</label>
                  <select className="form-select form-select-sm" value={editPoliza.forma_pago||''} onChange={e=>setEditPoliza({...editPoliza, forma_pago: e.target.value})}>
                    <option value="">—</option>
                    <option value="MODO_DIRECTO">Modo directo</option>
                    <option value="CARGO_AUTOMATICO">Cargo automático</option>
                  </select>
                </div>
                <div className="d-flex flex-column"><label className="form-label small">Fecha emisión</label><input className="form-control form-control-sm" type="date" value={editPoliza.fecha_emision || ''} onChange={e=>setEditPoliza({...editPoliza, fecha_emision: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Fecha renovación</label><input className="form-control form-control-sm" type="date" value={editPoliza.fecha_renovacion || ''} onChange={e=>setEditPoliza({...editPoliza, fecha_renovacion: e.target.value||undefined})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Tipo</label><input className="form-control form-control-sm" disabled value={editPoliza.tipo_producto || ''} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Día de pago</label><input className="form-control form-control-sm" type="number" min={1} max={31} value={editPoliza.dia_pago ?? ''} onChange={e=>{ const v = parseInt(e.target.value,10); setEditPoliza({...editPoliza, dia_pago: isFinite(v)? v:null}) }} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Prima anual</label><input className="form-control form-control-sm" value={typeof editPoliza.prima_input==='number'? editPoliza.prima_input.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}): (editPoliza.prima_input??'')} onChange={e=>{ const raw=e.target.value.replace(/[^0-9.]/g,''); const n=Number(raw); setEditPoliza({...editPoliza, prima_input: isFinite(n)? n: null}); }} /></div>
              </div>
              <div className="mt-2 small">
                <strong>Meses</strong>
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ddd' }} className="p-2 mt-1">
                  <div className="d-flex flex-wrap gap-3">
                    {generateMonthKeys().map(m => (
                      <label key={m} className="form-check-label d-flex align-items-center gap-1" style={{ width: '95px', fontSize: '11px' }}>
                        <input type="checkbox" className="form-check-input" checked={!!(editPoliza.meses_check && editPoliza.meses_check[m])} onChange={e=>{ const next = { ...(editPoliza.meses_check||{}) }; if (e.target.checked) next[m] = true; else delete next[m]; setEditPoliza({ ...editPoliza, meses_check: next }) }} />{shortMonthHeader(m)}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=>setEditPoliza(null)}>Cancelar</button>
                <button className="btn btn-sm btn-success" onClick={()=>submitPolizaCambio(editPoliza)}>{isSuper? 'Guardar y aprobar':'Enviar solicitud'}</button>
              </div>
            </AppModal>
          )}
          {addingPoliza && (
            <AppModal title="Agregar póliza" icon="file-earmark-plus" onClose={()=>!submittingNuevaPoliza && setAddingPoliza(false)}>
              <div className="grid grid-cols-2 gap-3">
                <div className="d-flex flex-column">
                  <label className="form-label small">No. Póliza</label>
                  <input className="form-control form-control-sm" value={nuevaPoliza.numero_poliza} onChange={e=>setNuevaPoliza({...nuevaPoliza, numero_poliza: e.target.value})} />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Fecha de emisión</label>
                  <input className="form-control form-control-sm" type="date" value={nuevaPoliza.fecha_emision} onChange={e=>setNuevaPoliza({...nuevaPoliza, fecha_emision: e.target.value})} />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Fecha de renovación (opcional)</label>
                  <input className="form-control form-control-sm" type="date" value={nuevaPoliza.fecha_renovacion} onChange={e=>setNuevaPoliza({...nuevaPoliza, fecha_renovacion: e.target.value})} />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Tipo de producto</label>
                  <select className="form-select form-select-sm" value={tipoProducto} onChange={e=>{ setTipoProducto(e.target.value); setNuevaPoliza({...nuevaPoliza, producto_parametro_id: undefined, prima_moneda: 'MXN'}) }}>
                    <option value="">Selecciona uno</option>
                    <option value="VI">Vida (VI)</option>
                    <option value="GMM">Gastos médicos (GMM)</option>
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Producto parametrizado (requerido)</label>
                  <select className="form-select form-select-sm" disabled={!tipoProducto} value={nuevaPoliza.producto_parametro_id || ''} onChange={e=>{
                      const value = e.target.value || undefined
                      let updated = { ...nuevaPoliza, producto_parametro_id: value }
                      if (value) {
                        const prod = productos.find(p=>p.id===value)
                        if (prod) {
                          updated = {
                            ...updated,
                            prima_moneda: prod.moneda || 'MXN'
                          }
                        }
                      } else {
                        updated = { ...updated, prima_moneda: 'MXN' }
                      }
                      setNuevaPoliza(updated)
                    }}>
                    <option value="">Sin seleccionar</option>
                    {productos.filter(p => !tipoProducto || p.tipo_producto === tipoProducto).map(p => (
                      <option key={p.id} value={p.id}>{p.nombre_comercial} ({p.tipo_producto})</option>
                    ))}
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Periodicidad</label>
                  <select className="form-select form-select-sm" value={nuevaPoliza.periodicidad_pago || ''} onChange={e=>setNuevaPoliza({...nuevaPoliza, periodicidad_pago: e.target.value})}>
                    <option value="">Selecciona…</option>
                    <option value="A">A</option>
                    <option value="S">S</option>
                    <option value="T">T</option>
                    <option value="M">M</option>
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Método de pago</label>
                  <select className="form-select form-select-sm" value={nuevaPoliza.forma_pago} onChange={e=>setNuevaPoliza({...nuevaPoliza, forma_pago: e.target.value})}>
                    <option value="">Selecciona…</option>
                    <option value="MODO_DIRECTO">Modo directo</option>
                    <option value="CARGO_AUTOMATICO">Cargo automático</option>
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Prima anual</label>
                  <input className="form-control form-control-sm" value={nuevaPoliza.prima_input ? Number(nuevaPoliza.prima_input).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2}) : ''} onChange={e=>{ const raw=e.target.value.replace(/[^0-9.]/g,''); setNuevaPoliza({...nuevaPoliza, prima_input: raw}); }} placeholder="0.00" />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Día de pago</label>
                  <input className="form-control form-control-sm" type="number" min={1} max={31} value={nuevaPoliza.dia_pago} onChange={e=>setNuevaPoliza({...nuevaPoliza, dia_pago: e.target.value})} />
                </div>
                {/* Moneda prima oculta autocompletada */}
                <input type="hidden" value={nuevaPoliza.prima_moneda} />
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" disabled={submittingNuevaPoliza} onClick={()=>setAddingPoliza(false)}>Cancelar</button>
                <button className="btn btn-sm btn-success" disabled={submittingNuevaPoliza} onClick={async()=>{
                  if (submittingNuevaPoliza) return
                  const primaNum = Number((nuevaPoliza.prima_input||'').replace(/,/g,''))
                  if (!selectedCliente?.id || !nuevaPoliza.producto_parametro_id || !nuevaPoliza.numero_poliza || !nuevaPoliza.fecha_emision || !nuevaPoliza.periodicidad_pago || !nuevaPoliza.forma_pago || !isFinite(primaNum)) { alert('Campos requeridos: Producto, No. Póliza, Fecha de emisión, Periodicidad, Método de pago, Prima anual'); return }
                  const payload: Record<string, unknown> = {
                    cliente_id: selectedCliente.id,
                    numero_poliza: nuevaPoliza.numero_poliza,
                    fecha_emision: nuevaPoliza.fecha_emision,
                    fecha_renovacion: nuevaPoliza.fecha_renovacion || null,
                    estatus: nuevaPoliza.estatus || null,
                    forma_pago: nuevaPoliza.forma_pago,
                    periodicidad_pago: nuevaPoliza.periodicidad_pago,
                    // tipo_pago removido
                    dia_pago: nuevaPoliza.dia_pago ? Number(nuevaPoliza.dia_pago) : null,
                    prima_input: primaNum,
                    prima_moneda: nuevaPoliza.prima_moneda || 'MXN',
                    meses_check: nuevaPoliza.meses_check,
                  }
                  if (nuevaPoliza.producto_parametro_id) payload.producto_parametro_id = nuevaPoliza.producto_parametro_id
                  try {
                    setSubmittingNuevaPoliza(true)
                    const r = await fetch('/api/polizas', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) })
                    const j = await r.json()
                    if (!r.ok) { alert(j.error || 'Error al crear'); return }
                    setAddingPoliza(false)
                    setLoading(true)
                    try { const rp = await fetch(`/api/polizas?cliente_id=${selectedCliente.id}`); const jp = await rp.json(); setPolizas(jp.items||[]) } finally { setLoading(false) }
                  } catch { alert('Error al crear') } finally { setSubmittingNuevaPoliza(false) }
                }}>Crear</button>
              </div>
            </AppModal>
          )}
          {/* agregar póliza modal deshabilitado temporalmente */}
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
function formatMoney(v: number, moneda?: string|null) {
  try { return (moneda ? (moneda + ' ') : '$') + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } catch { return (moneda? moneda+' ':'$') + v.toFixed(2) }
}
function generateMonthKeys() {
  // Meses fijos comenzando en enero 2025 (24 meses)
  const keys: string[] = []
  const startYear = 2025
  const startMonthIndex = 0 // enero
  for (let i=0;i<24;i++) {
    const d = new Date(startYear, startMonthIndex + i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    keys.push(`${y}-${m}`)
  }
  return keys
}
function shortMonthHeader(key: string) {
  const [y,m] = key.split('-')
  return `${m}/${y.slice(2)}`
}
