"use client"
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  forma_pago?: string|null
  prima_input?: number|null
  prima_moneda?: string|null
  sa_input?: number|null
  sa_moneda?: string|null
  producto_nombre?: string|null
  fecha_emision?: string|null
  renovacion?: string|null
  tipo_producto?: string|null
}

export default function GestionPage() {
  const { user } = useAuth()
  const role = (user?.rol || '').toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin'].includes(role)
  const router = useRouter()

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
  const [addingPoliza, setAddingPoliza] = useState(false)
  const [nuevaPoliza, setNuevaPoliza] = useState<{ numero_poliza: string; fecha_emision: string; forma_pago: string; prima_input: string; prima_moneda: string; producto_parametro_id?: string; sa_input?: string; sa_moneda?: string }>({ numero_poliza: '', fecha_emision: '', forma_pago: '', prima_input: '', prima_moneda: '' })
  const [submittingNuevaPoliza, setSubmittingNuevaPoliza] = useState(false)
  const [productos, setProductos] = useState<Array<{ id: string; nombre_comercial: string; tipo_producto: string; moneda?: string|null; sa_min?: number|null; sa_max?: number|null }>>([])
  const [tipoProducto, setTipoProducto] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rc = await fetch(`/api/clientes?q=${encodeURIComponent(qClientes)}`)
      const jc = await rc.json()
      setClientes(jc.items || [])
    } finally { setLoading(false) }
  }, [qClientes])

  useEffect(() => { void load() }, [load])

  // Redirigir asesores a Vista Asesor al entrar al módulo Clientes y Pólizas
  useEffect(() => {
    if (!isSuper) {
      router.replace('/asesor')
    }
  }, [isSuper, router])

  // Cargar productos parametrizados al abrir el modal de nueva póliza
  useEffect(() => {
    if (!addingPoliza) return
    ;(async () => {
      try {
        const res = await fetch('/api/producto_parametros?debug=1', { cache: 'no-store' })
        const data = await res.json()
        if (res.ok) setProductos(Array.isArray(data) ? data : [])
      } catch {}
    })()
  }, [addingPoliza])

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
      <div className="d-flex align-items-center mb-4 gap-2">
        <h1 className="text-xl font-semibold mb-0">Clientes y Pólizas</h1>
        <a href="/asesor" className="btn btn-sm btn-outline-primary ms-auto">Abrir Vista Asesor</a>
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
                <input className="form-control form-control-sm" placeholder="Primer nombre" value={editCliente.primer_nombre||''} onChange={e=>setEditCliente({...editCliente, primer_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo nombre" value={editCliente.segundo_nombre||''} onChange={e=>setEditCliente({...editCliente, segundo_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Primer apellido" value={editCliente.primer_apellido||''} onChange={e=>setEditCliente({...editCliente, primer_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo apellido" value={editCliente.segundo_apellido||''} onChange={e=>setEditCliente({...editCliente, segundo_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Teléfono celular" value={editCliente.telefono_celular||''} onChange={e=>setEditCliente({...editCliente, telefono_celular: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Email" value={editCliente.email||''} onChange={e=>setEditCliente({...editCliente, email: e.target.value})} />
                <input className="form-control form-control-sm" type="date" placeholder="Cumpleaños" value={editCliente.fecha_nacimiento || ''} onChange={e=>setEditCliente({...editCliente, fecha_nacimiento: e.target.value})} />
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
                <input className="form-control form-control-sm" placeholder="Primer nombre" value={nuevo.primer_nombre||''} onChange={e=>setNuevo({...nuevo, primer_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo nombre" value={nuevo.segundo_nombre||''} onChange={e=>setNuevo({...nuevo, segundo_nombre: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Primer apellido" value={nuevo.primer_apellido||''} onChange={e=>setNuevo({...nuevo, primer_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Segundo apellido (deja vacío si no aplica)" value={nuevo.segundo_apellido||''} onChange={e=>setNuevo({...nuevo, segundo_apellido: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Teléfono celular" value={nuevo.telefono_celular||''} onChange={e=>setNuevo({...nuevo, telefono_celular: e.target.value})} />
                <input className="form-control form-control-sm" placeholder="Email" value={nuevo.email||''} onChange={e=>setNuevo({...nuevo, email: e.target.value})} />
                <input className="form-control form-control-sm" type="date" placeholder="Cumpleaños" value={nuevo.fecha_nacimiento || ''} onChange={e=>setNuevo({...nuevo, fecha_nacimiento: e.target.value})} />
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
            {isSuper && (
              <button className="btn btn-sm btn-success ms-auto" onClick={()=>{ setAddingPoliza(true); setNuevaPoliza({ numero_poliza: '', fecha_emision: '', forma_pago: '', prima_input: '', prima_moneda: '' }); setSubmittingNuevaPoliza(false) }}>Agregar póliza</button>
            )}
          </div>
          <div className="table-responsive small">
            <table className="table table-sm table-striped align-middle">
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {polizas.map(p => (
                  <tr key={p.id}>
                    <td className="text-xs">{p.numero_poliza || '—'}</td>
                    <td className="text-xs">{p.producto_nombre || '—'}</td>
                    <td className="text-xs">{p.estatus || '—'}</td>
                    <td className="text-xs">{p.forma_pago || '—'}</td>
                    <td className="text-xs">{p.fecha_emision ? new Date(p.fecha_emision).toLocaleDateString() : '—'}</td>
                    <td className="text-xs">{p.renovacion ? new Date(p.renovacion).toLocaleDateString() : '—'}</td>
                    <td className="text-xs">{p.tipo_producto || '—'}</td>
                    <td className="text-xs">{(p.prima_input ?? '—')} {p.prima_moneda || ''}</td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-primary" onClick={()=>setEditPoliza({...p})}>Editar</button>
                    </td>
                  </tr>
                ))}
                {!polizas.length && <tr><td colSpan={9} className="text-center text-muted py-3">Sin resultados</td></tr>}
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
          {addingPoliza && (
            <AppModal title="Agregar póliza" icon="file-earmark-plus" onClose={()=>setAddingPoliza(false)}>
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
                  <label className="form-label small">Tipo de producto</label>
                  <select className="form-select form-select-sm" value={tipoProducto} onChange={e=>{ setTipoProducto(e.target.value); setNuevaPoliza({...nuevaPoliza, producto_parametro_id: undefined}) }}>
                    <option value="">Todos</option>
                    <option value="VI">Vida (VI)</option>
                    <option value="GMM">Gastos médicos (GMM)</option>
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Producto parametrizado</label>
                  <select className="form-select form-select-sm" value={nuevaPoliza.producto_parametro_id || ''} onChange={e=>{
                      const value = e.target.value || undefined
                      let updated = { ...nuevaPoliza, producto_parametro_id: value }
                      if (value) {
                        const prod = productos.find(p=>p.id===value)
                        if (prod) {
                          updated = {
                            ...updated,
                            prima_moneda: prod.moneda || '',
                            sa_moneda: prod.moneda || '',
                            sa_input: prod.sa_min != null ? String(prod.sa_min) : ''
                          }
                        }
                      } else {
                        updated = { ...updated, prima_moneda: '', sa_moneda: '', sa_input: '' }
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
                  <label className="form-label small">Forma de pago</label>
                  <select className="form-select form-select-sm" value={nuevaPoliza.forma_pago} onChange={e=>setNuevaPoliza({...nuevaPoliza, forma_pago: e.target.value})}>
                    <option value="">Selecciona…</option>
                    <option value="MODO_DIRECTO">Modo directo</option>
                    <option value="CARGO_AUTOMATICO">Cargo automático</option>
                  </select>
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Prima</label>
                  <input className="form-control form-control-sm" value={nuevaPoliza.prima_input} onChange={e=>setNuevaPoliza({...nuevaPoliza, prima_input: e.target.value})} />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Moneda prima (desde producto)</label>
                  <input className="form-control form-control-sm" value={nuevaPoliza.prima_moneda} disabled readOnly />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Suma asegurada (desde producto)</label>
                  <input className="form-control form-control-sm" value={nuevaPoliza.sa_input || ''} disabled readOnly />
                </div>
                <div className="d-flex flex-column">
                  <label className="form-label small">Moneda SA (desde producto)</label>
                  <input className="form-control form-control-sm" value={nuevaPoliza.sa_moneda || ''} disabled readOnly />
                </div>
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" disabled={submittingNuevaPoliza} onClick={()=>setAddingPoliza(false)}>Cancelar</button>
                <button className="btn btn-sm btn-success" disabled={submittingNuevaPoliza} onClick={async()=>{
                  if (submittingNuevaPoliza) return
                  const prima = Number((nuevaPoliza.prima_input||'').replace(/,/g,''))
                  if (!selectedCliente?.id || !nuevaPoliza.producto_parametro_id || !nuevaPoliza.numero_poliza || !nuevaPoliza.fecha_emision || !nuevaPoliza.forma_pago || !nuevaPoliza.prima_moneda || !isFinite(prima)) {
                    alert('Campos requeridos: Producto, No. Póliza, Fecha de emisión, Forma de pago, Prima (y cliente seleccionado)')
                    return
                  }
                  const payload: Record<string, unknown> = {
                    cliente_id: selectedCliente.id,
                    numero_poliza: nuevaPoliza.numero_poliza,
                    fecha_emision: nuevaPoliza.fecha_emision,
                    forma_pago: nuevaPoliza.forma_pago,
                    prima_input: prima,
                    prima_moneda: nuevaPoliza.prima_moneda,
                  }
                  if (nuevaPoliza.producto_parametro_id) payload.producto_parametro_id = nuevaPoliza.producto_parametro_id
                  if (nuevaPoliza.sa_input) payload.sa_input = Number((nuevaPoliza.sa_input||'').replace(/,/g,''))
                  if (nuevaPoliza.sa_moneda) payload.sa_moneda = nuevaPoliza.sa_moneda
                  try {
                    setSubmittingNuevaPoliza(true)
                    const res = await fetch('/api/polizas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                    const j = await res.json()
                    if (!res.ok) { alert(j.error || 'Error al crear póliza'); return }
                    setAddingPoliza(false)
                    setLoading(true)
                    try { const rp = await fetch(`/api/polizas?cliente_id=${selectedCliente.id}`); const jp = await rp.json(); setPolizas(jp.items || []) } finally { setLoading(false) }
                  } catch {
                    alert('Error al crear póliza')
                  } finally {
                    setSubmittingNuevaPoliza(false)
                  }
                }}>Crear</button>
              </div>
            </AppModal>
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
