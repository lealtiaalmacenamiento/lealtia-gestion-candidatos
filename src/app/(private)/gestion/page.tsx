"use client"
import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  const agentDisplayName = (user?.nombre && user.nombre.trim()) ? user.nombre.trim() : (user?.email || 'tu asesor')

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [polizas, setPolizas] = useState<Poliza[]>([])
  const [agentes, setAgentes] = useState<Array<{ id:number; id_auth?: string|null; nombre?:string|null; email:string; clientes_count?: number; badges?: { polizas_en_conteo?: number|null; conexion?: string|null; meses_para_graduacion?: number|null; polizas_para_graduacion?: number|null; necesita_mensualmente?: number|null; objetivo?: number|null; comisiones_mxn?: number|null } }>>([])
  const [selfBadges, setSelfBadges] = useState<{ polizas_en_conteo?: number|null; conexion?: string|null; meses_para_graduacion?: number|null; polizas_para_graduacion?: number|null; necesita_mensualmente?: number|null; objetivo?: number|null; comisiones_mxn?: number|null } | null>(null)
  const [editMeta, setEditMeta] = useState<{ usuario_id: number; conexion: string; objetivo: string } | null>(null)
  const [expandedAgentes, setExpandedAgentes] = useState<Record<string, boolean>>({})
  const [clientesPorAgente, setClientesPorAgente] = useState<Record<string, Cliente[]>>({})
  const [qClientes, setQClientes] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [view, setView] = useState<'list' | 'cliente' | 'polizas'>('list')
  const [loading, setLoading] = useState(false)

  const [editCliente, setEditCliente] = useState<Cliente|null>(null)
  const [editPoliza, setEditPoliza] = useState<Poliza|null>(null)
  // Edición cómoda de prima: mantener texto crudo para evitar saltos del cursor por formateo
  const [editPrimaText, setEditPrimaText] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [submittingNuevoCliente, setSubmittingNuevoCliente] = useState(false)
  const [nuevo, setNuevo] = useState<Cliente & { telefono_celular?: string|null, fecha_nacimiento?: string|null }>({ id: '', telefono_celular: '', fecha_nacimiento: null })
  // creación de póliza deshabilitada temporalmente
  const [addingPoliza, setAddingPoliza] = useState(false)
  const [submittingNuevaPoliza, setSubmittingNuevaPoliza] = useState(false)
  const [productos, setProductos] = useState<Array<{ id: string; nombre_comercial: string; tipo_producto: string; moneda?: string|null; sa_min?: number|null; sa_max?: number|null }>>([])
  const [tipoProducto, setTipoProducto] = useState<string>('')
  const [nuevaPoliza, setNuevaPoliza] = useState<{ numero_poliza: string; fecha_emision: string; fecha_renovacion: string; estatus: string; forma_pago: string; periodicidad_pago?: string; dia_pago: string; prima_input: string; prima_moneda: string; producto_parametro_id?: string; meses_check: Record<string, boolean> }>({ numero_poliza: '', fecha_emision: '', fecha_renovacion: '', estatus: 'EN_VIGOR', forma_pago: '', periodicidad_pago: undefined, dia_pago: '', prima_input: '', prima_moneda: 'MXN', meses_check: {} })
  const [savingPoliza, setSavingPoliza] = useState<boolean>(false)
  const [savingMeta, setSavingMeta] = useState(false)
  // Meta header inputs
  const [metaSelf, setMetaSelf] = useState<{ conexion: string; objetivo: string }>({ conexion: '', objetivo: '' })

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
      if (isSuper) {
        const ra = await fetch('/api/agentes', { cache: 'no-store' })
        const ja = await ra.json()
        if (Array.isArray(ja)) setAgentes(ja)
        // Prefill own meta for super (in case super is also agent)
        try {
          const rm = await fetch('/api/agentes/meta', { cache: 'no-store' })
          if (rm.ok) {
            const m = await rm.json()
            setMetaSelf({ conexion: toISODateFromDMY(m?.fecha_conexion_text || ''), objetivo: ((m?.objetivo ?? 36)).toString() })
          }
        } catch {}
      } else {
        const rc = await fetch(`/api/clientes?q=${encodeURIComponent(qClientes)}`)
        const jc = await rc.json()
        setClientes(jc.items || [])
        // cargar meta propia (conexión/objetivo)
        try {
          const rm = await fetch('/api/agentes/meta', { cache: 'no-store' })
          if (rm.ok) {
            const m = await rm.json()
            setMetaSelf({ conexion: toISODateFromDMY(m?.fecha_conexion_text || ''), objetivo: ((m?.objetivo ?? 36)).toString() })
          }
        } catch {}
        // cargar badges propios
        try {
          const ra = await fetch('/api/agentes', { cache: 'no-store' })
          const ja = await ra.json()
          if (Array.isArray(ja) && ja[0]?.badges) setSelfBadges(ja[0].badges)
        } catch {}
      }
    } finally { setLoading(false) }
  }, [qClientes, isSuper])

  useEffect(() => { void load() }, [load])

  // Sincronizar texto de prima SOLAMENTE cuando se cambia de póliza (por id),
  // no en cada tecleo del usuario (cuando solo cambia prima_input).
  const prevEditPolizaId = useRef<string|undefined>(undefined)
  useEffect(() => {
    const currentId = editPoliza?.id
    if (prevEditPolizaId.current !== currentId) {
      prevEditPolizaId.current = currentId
      if (!editPoliza) { setEditPrimaText(''); return }
      const v = editPoliza.prima_input
      if (typeof v === 'number' && isFinite(v)) setEditPrimaText(v.toFixed(2))
      else setEditPrimaText('')
    }
  }, [editPoliza])

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
    if (savingPoliza) return
    setSavingPoliza(true)
    // Guardar una referencia del estado esperado para verificación post-guardar
    const expectedId = p.id
    const expectedPrima = typeof p.prima_input === 'number' ? Number(p.prima_input.toFixed(2)) : null
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
    try {
      const res = await fetch('/api/polizas/updates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poliza_id: p.id, payload })
      })
      const j = await res.json().catch(()=>({}))
      if (!res.ok) { alert(j.error || 'Error al enviar solicitud'); return }
      if (isSuper && j.id) {
        const ra = await fetch('/api/polizas/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: j.id, debug: true }) })
        const ja = await ra.json().catch(()=>({}))
        if (!ra.ok) {
          const details = typeof ja === 'object' ? (ja.error || ja.details || ja.hint || ja.code) : null
          alert(`Error al aprobar${details ? `: ${details}` : ''}`)
          return
        }
        // Usar la respuesta para validar que la prima persistió y reflejar en UI al instante
        const approvedPrima = (typeof ja?.poliza?.prima_input === 'number') ? Number(ja.poliza.prima_input.toFixed(2)) : null
        if (ja?.poliza?.id && typeof ja?.poliza?.id === 'string') {
          // Optimistic update inmediata en la lista actual (si visible)
          setPolizas(prev => prev.map(it => it.id === ja.poliza.id ? { ...it, prima_input: (typeof ja.poliza.prima_input === 'number' ? ja.poliza.prima_input : it.prima_input), prima_moneda: (typeof ja.poliza.prima_moneda === 'string' ? ja.poliza.prima_moneda : it.prima_moneda) } : it))
        }
        if (expectedPrima != null && approvedPrima != null && approvedPrima !== expectedPrima) {
          alert(`Aviso: el backend no reflejó el cambio de prima. Valor actual: ${approvedPrima} (esperado ${expectedPrima}). Revisa permisos o validaciones.`)
        } else {
          alert('Guardado y aprobado')
        }
      } else if (!isSuper) {
        alert('Solicitud enviada')
      }

      // Refrescar datos para reflejar el recálculo en UI (sólo si se aprobó o si queremos reflejar último estado)
      try {
        if (selectedCliente?.id) {
          const rp = await fetch(`/api/polizas?cliente_id=${selectedCliente.id}`, { cache: 'no-store' })
          const jp = await rp.json().catch(()=>({}))
          if (Array.isArray(jp.items)) {
            setPolizas(jp.items)
            // Verificación: si se aprobó como super, confirmar que la prima persistió
            if (isSuper && expectedId) {
              const updated = (jp.items as Array<{ id: string; prima_input?: number | null }>).find((it) => it.id === expectedId)
              const backendPrima = typeof updated?.prima_input === 'number' ? Number(updated.prima_input.toFixed(2)) : null
              if (expectedPrima != null && backendPrima != null && backendPrima !== expectedPrima) {
                alert(`Aviso: el backend no reflejó el cambio de prima. Valor actual: ${backendPrima} (esperado ${expectedPrima}). Revisa permisos o validaciones.`)
              }
            }
          }
        }
        try {
          const ra = await fetch('/api/agentes', { cache: 'no-store' })
          const ja = await ra.json().catch(()=>[])
          if (isSuper) {
            if (Array.isArray(ja)) setAgentes(ja)
          } else {
            if (Array.isArray(ja) && ja[0]?.badges) setSelfBadges(ja[0].badges)
          }
        } catch {}
      } finally {
        setEditPoliza(null)
      }
    } finally {
      setSavingPoliza(false)
    }
  }

  // Parser robusto para montos con separadores de miles y decimal en diferentes formatos
  function parseMoneyInput(text: string): number | null {
    if (!text) return null
    const s0 = text.trim()
    if (!s0) return null
    // Mantener sign negativo si aplica
    const sign = s0.startsWith('-') ? -1 : 1
    const s = sign === -1 ? s0.slice(1) : s0
    // Si no hay separadores, intenta parsear directo
    if (!/[.,]/.test(s)) {
      const n = Number(s.replace(/\s+/g, ''))
      return Number.isFinite(n) ? sign * n : null
    }
    // Determinar último separador como decimal
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    const lastSep = Math.max(lastDot, lastComma)
    const decSep = lastSep >= 0 ? s.charAt(lastSep) : null
    if (!decSep) {
      const n = Number(s.replace(/[^0-9-]/g, ''))
      return Number.isFinite(n) ? sign * n : null
    }
    const otherSep = decSep === ',' ? '.' : ','
    // Quitar todos los separadores distintos al decimal
    const noOther = s.replace(new RegExp(`\\${otherSep}`, 'g'), '')
    // Dividir por el separador decimal (puede aparecer múltiples veces). Usar la última como decimal
    const parts = noOther.split(decSep)
    if (parts.length === 1) {
      const n = Number(parts[0].replace(/[^0-9]/g, ''))
      return Number.isFinite(n) ? sign * n : null
    }
    const decimalPart = parts.pop() || ''
    const intPart = parts.join('')
    const assembled = `${intPart}.${decimalPart}`
    const n = Number(assembled)
    return Number.isFinite(n) ? sign * n : null
  }

  return (
    <div className="p-4">
      <div className="d-flex align-items-center mb-4 gap-2">
        <h1 className="text-xl font-semibold mb-0">Clientes y Pólizas</h1>
      </div>
      {loading && <p className="text-sm text-gray-600">Cargando…</p>}
      {view === 'list' && (
        <section className="border rounded p-3">
          {isSuper ? (
            <>
              <header className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 className="font-medium">Agentes</h2>
                <div className="d-flex align-items-end gap-2 ms-auto flex-wrap">
                  {/* Meta rápida también para super si es agente */}
                  {user && agentes.some(a=>a.id===user.id) && (
                    <>
                      <div className="d-flex flex-column" style={{width:180}}>
                        <label className="form-label small mb-1">Conexión</label>
                        <input className="form-control form-control-sm" type="date" value={metaSelf.conexion} onChange={e=> setMetaSelf({ ...metaSelf, conexion: e.target.value })} />
                      </div>
                      <div className="d-flex flex-column" style={{width:140}}>
                        <label className="form-label small mb-1">Objetivo</label>
                        <input className="form-control form-control-sm" type="number" value={metaSelf.objetivo} onChange={e=> setMetaSelf({ ...metaSelf, objetivo: e.target.value })} />
                      </div>
                      <button className="btn btn-sm btn-success" disabled={savingMeta} onClick={async()=>{
                        try {
                          setSavingMeta(true)
                          const body: { fecha_conexion_text: string | null; objetivo: number | null } = {
                            fecha_conexion_text: metaSelf.conexion ? toDMYFromISO(metaSelf.conexion) : null,
                            objetivo: metaSelf.objetivo? Number(metaSelf.objetivo): null
                          }
                          const r=await fetch('/api/agentes/meta',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
                          const j=await r.json(); if (!r.ok) { alert(j.error || 'Error al guardar meta'); return }
                          await load()
                        } finally { setSavingMeta(false) }
                      }}>Guardar meta</button>
                    </>
                  )}
                  <button className="px-3 py-1 text-sm bg-gray-100 border rounded" onClick={()=> window.location.reload()}>Refrescar</button>
                  {/* Total comisiones (superusuario) */}
                  {agentes.length > 0 && (
                    <span className="badge text-bg-primary">
                      Total comisiones: {
                        (()=>{
                          try {
                            const total = agentes.reduce((acc, a)=> acc + (a.badges?.comisiones_mxn || 0), 0)
                            return (total).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
                          } catch { return 'MXN $0.00' }
                        })()
                      }
                    </span>
                  )}
                  <button className="px-3 py-1 text-sm btn btn-primary" onClick={()=>{ setCreating(true); setNuevo({ id: '', telefono_celular: '' }) }}>Nuevo cliente</button>
                </div>
              </header>
              <div className="accordion" id="agentesAccordion">
                {agentes.map(ag => {
                  const key = ag.id_auth || String(ag.id)
                  const expanded = !!expandedAgentes[key]
                  return (
                    <div key={key} className="accordion-item mb-2">
                      <h2 className="accordion-header">
                        <button
                          className={`accordion-button ${expanded ? '' : 'collapsed'}`}
                          type="button"
                          onClick={async()=>{
                            setExpandedAgentes(prev=>({ ...prev, [key]: !expanded }))
                            if (!expanded && !clientesPorAgente[key]) {
                              try {
                                // Preferir id_auth; si no existe, enviar usuario_id para que el API resuelva id_auth
                                const url = ag.id_auth
                                  ? `/api/clientes/by-asesor?asesor_id=${encodeURIComponent(ag.id_auth)}`
                                  : `/api/clientes/by-asesor?usuario_id=${encodeURIComponent(String(ag.id))}`
                                const rc = await fetch(url, { cache: 'no-store' })
                                const jc = await rc.json().catch(()=>({ error: 'parse' }))
                                if (!rc.ok) {
                                  console.error('Error cargando clientes por asesor', jc)
                                  alert(jc?.error || 'Error al cargar clientes del asesor')
                                  return
                                }
                                setClientesPorAgente(prev=>({ ...prev, [key]: jc.items || [] }))
                              } catch (e) {
                                console.error(e)
                                alert('Error al cargar clientes del asesor')
                              }
                            }
                          }}
                        >
                          <div className="d-flex w-100 justify-content-between gap-2 align-items-center">
                            <div className="me-2">
                              <div className="fw-semibold">{ag.nombre || ag.email}</div>
                              <div className="small text-muted">{ag.email}</div>
                            </div>
                            <div className="d-flex flex-wrap gap-2 align-items-center ms-auto">
                              <span className="badge bg-secondary">{(clientesPorAgente[key]?.length) ?? (ag.clientes_count || 0)} clientes</span>
                              {ag.badges?.polizas_en_conteo!=null && <span className="badge bg-info text-dark">Pólizas en conteo: {ag.badges.polizas_en_conteo}</span>}
                              {ag.badges?.conexion && <span className="badge bg-light text-dark border">Conexión: {ag.badges.conexion}</span>}
                              {ag.badges?.meses_para_graduacion!=null && <span className="badge bg-warning text-dark">Meses para graduación: {ag.badges.meses_para_graduacion}</span>}
                              {ag.badges?.polizas_para_graduacion!=null && <span className="badge bg-primary">Pólizas para graduación: {ag.badges.polizas_para_graduacion}</span>}
                              {ag.badges?.necesita_mensualmente!=null && <span className="badge bg-success">Necesita mens.: {ag.badges.necesita_mensualmente}</span>}
                              {ag.badges?.objetivo!=null && <span className="badge bg-dark">Objetivo: {ag.badges.objetivo}</span>}
                              {typeof ag.badges?.comisiones_mxn === 'number' && (
                                <span className="badge text-bg-primary">
                                  Comisión: {(()=>{ try { return (ag.badges!.comisiones_mxn || 0).toLocaleString('es-MX', { style:'currency', currency:'MXN' }) } catch { return 'MXN $0.00' } })()}
                                </span>
                              )}
                              {(user && user.id===ag.id) && (
                                <button className="btn btn-sm btn-outline-secondary" type="button" onClick={async(e)=>{ e.stopPropagation();
                                  try{
                                    const r=await fetch(`/api/agentes/meta`)
                                    const j=await r.json()
                                    if(r.ok){ setEditMeta({ usuario_id: ag.id, conexion: j.fecha_conexion_text||'', objetivo: (j.objetivo??'').toString() }) }
                                  }catch{}
                                }}>Editar meta</button>
                              )}
                            </div>
                          </div>
                        </button>
                      </h2>
                      {expanded && (
                        <div className="accordion-body p-2" style={{ background: '#f8fafc' }}>
                          <div className="table-responsive small">
                            <table className="table table-sm table-striped align-middle mb-0">
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
                                {(clientesPorAgente[key] || []).map(c => (
                                  <tr key={c.id}>
                                    <td className="font-mono text-xs">{c.cliente_code || c.id}</td>
                                    <td className="text-xs">{fmtNombre(c)}</td>
                                    <td className="text-xs">
                                      {c.telefono_celular ? (
                                        <a
                                          href={buildWhatsAppLink(c.telefono_celular, ag.nombre || ag.email || agentDisplayName)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          {c.telefono_celular}
                                        </a>
                                      ) : '—'}
                                    </td>
                                    <td className="text-xs">
                                      {c.email ? (
                                        <a href={`mailto:${c.email}`}>{c.email}</a>
                                      ) : '—'}
                                    </td>
                                    <td className="text-xs">{c.fecha_nacimiento ? new Date(c.fecha_nacimiento).toLocaleDateString() : '—'}</td>
                                    <td className="text-end">
                                      <div className="d-flex gap-2 justify-content-end">
                                        <button className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={async()=>{ setSelectedCliente(c); setView('polizas'); setLoading(true); try { const rp = await fetch(`/api/polizas?cliente_id=${c.id}`); const jp = await rp.json(); setPolizas(jp.items || []) } finally { setLoading(false) } }}>Ver pólizas</button>
                                        <button className="btn btn-sm btn-primary" onClick={()=>setEditCliente({...c})}>Editar</button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {!((clientesPorAgente[key] || []).length) && <tr><td colSpan={6} className="text-center text-muted py-3">Sin clientes</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!agentes.length && <div className="text-center text-muted small">Sin agentes</div>}
              </div>
            </>
          ) : (
            <>
              <header className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 className="font-medium">Clientes</h2>
                <div className="d-flex ms-auto align-items-end gap-2 flex-wrap">
                  <input className="border px-2 py-1 text-sm" placeholder="Buscar…" value={qClientes} onChange={e=>setQClientes(e.target.value)} />
                  <button className="px-3 py-1 text-sm bg-gray-100 border rounded" onClick={()=>load()}>Buscar</button>
                  {/* Meta rápida del asesor */}
                  <div className="d-flex flex-column" style={{width:180}}>
                    <label className="form-label small mb-1">Conexión</label>
                    <input className="form-control form-control-sm" type="date" value={metaSelf.conexion} onChange={e=> setMetaSelf({ ...metaSelf, conexion: e.target.value })} />
                  </div>
                  <div className="d-flex flex-column" style={{width:140}}>
                    <label className="form-label small mb-1">Objetivo</label>
                    <input className="form-control form-control-sm" type="number" value={metaSelf.objetivo} onChange={e=> setMetaSelf({ ...metaSelf, objetivo: e.target.value })} />
                  </div>
                  <button className="btn btn-sm btn-success" disabled={savingMeta} onClick={async()=>{
                    try {
                      setSavingMeta(true)
                      const body: { fecha_conexion_text: string | null; objetivo: number | null } = {
                        fecha_conexion_text: metaSelf.conexion ? toDMYFromISO(metaSelf.conexion) : null,
                        objetivo: metaSelf.objetivo? Number(metaSelf.objetivo): null
                      }
                      const r=await fetch('/api/agentes/meta',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)})
                      const j=await r.json(); if (!r.ok) { alert(j.error || 'Error al guardar meta'); return }
                      await load()
                    } finally { setSavingMeta(false) }
                  }}>Guardar meta</button>
                  {/* Badges del asesor */}
                  {selfBadges && (
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      {selfBadges.polizas_en_conteo!=null && <span className="badge bg-info text-dark">Pólizas en conteo: {selfBadges.polizas_en_conteo}</span>}
                      {selfBadges.conexion && <span className="badge bg-light text-dark border">Conexión: {selfBadges.conexion}</span>}
                      {selfBadges.meses_para_graduacion!=null && <span className="badge bg-warning text-dark">Meses para graduación: {selfBadges.meses_para_graduacion}</span>}
                      {selfBadges.polizas_para_graduacion!=null && <span className="badge bg-primary">Pólizas para graduación: {selfBadges.polizas_para_graduacion}</span>}
                      {selfBadges.necesita_mensualmente!=null && <span className="badge bg-success">Necesita mens.: {selfBadges.necesita_mensualmente}</span>}
                      {selfBadges.objetivo!=null && <span className="badge bg-dark">Objetivo: {selfBadges.objetivo}</span>}
                    </div>
                  )}
                  <button className="px-3 py-1 text-sm btn btn-primary" onClick={()=>{ setCreating(true); setNuevo({ id: '', telefono_celular: '' }) }}>Nuevo cliente</button>
                </div>
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
                        <td className="text-xs">
                          {c.telefono_celular ? (
                            <a
                              href={buildWhatsAppLink(c.telefono_celular, agentDisplayName)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {c.telefono_celular}
                            </a>
                          ) : '—'}
                        </td>
                        <td className="text-xs">
                          {c.email ? (
                            <a href={`mailto:${c.email}`}>{c.email}</a>
                          ) : '—'}
                        </td>
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
            </>
          )}
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
            <AppModal title="Nuevo cliente" icon="person-plus" onClose={()=>!submittingNuevoCliente && setCreating(false)}>
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
                <button className="btn btn-sm btn-secondary" disabled={submittingNuevoCliente} onClick={()=>setCreating(false)}>Cancelar</button>
                <button className="btn btn-sm btn-success" disabled={submittingNuevoCliente} onClick={async()=>{
                  if (submittingNuevoCliente) return
                  // Validación mínima requerida por schema
                  if (!nuevo.primer_nombre || !nuevo.primer_apellido || !nuevo.telefono_celular || !nuevo.email) {
                    alert('Campos requeridos: Primer nombre, Primer apellido, Teléfono celular y Email')
                    return
                  }
                  try {
                    setSubmittingNuevoCliente(true)
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
                  } catch { alert('Error al crear') } finally { setSubmittingNuevoCliente(false) }
                }}>Crear</button>
              </div>
            </AppModal>
          )}
          {editMeta && (
            <AppModal title="Editar meta del asesor" icon="pencil" onClose={()=> setEditMeta(null)}>
              <div className="d-flex flex-column gap-2">
                <div>
                  <label className="form-label small">Conexión (fecha firma contrato)</label>
                  <input className="form-control form-control-sm" type="date" value={toISODateFromDMY(editMeta.conexion)} onChange={e=> setEditMeta({...editMeta, conexion: toDMYFromISO(e.target.value)})} />
                </div>
                <div>
                  <label className="form-label small">Objetivo</label>
                  <input className="form-control form-control-sm" type="number" value={editMeta.objetivo} onChange={e=> setEditMeta({...editMeta, objetivo: e.target.value})} />
                </div>
              </div>
              <div className="mt-3 d-flex justify-content-end gap-2">
                <button className="btn btn-sm btn-secondary" onClick={()=> setEditMeta(null)}>Cancelar</button>
                <button className="btn btn-sm btn-success" disabled={savingMeta} onClick={async()=>{
                  try{
                    setSavingMeta(true)
                    const body: { usuario_id?: number; fecha_conexion_text: string | null; objetivo: number | null } = { fecha_conexion_text: editMeta.conexion ? editMeta.conexion.trim() : null, objetivo: editMeta.objetivo? Number(editMeta.objetivo): null }
                    if(isSuper && editMeta.usuario_id) body.usuario_id = editMeta.usuario_id
                    const r = await fetch('/api/agentes/meta', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
                    const j = await r.json()
                    if(!r.ok){ alert(j.error || 'Error al guardar meta'); return }
                    setEditMeta(null)
                    await load()
                  } finally { setSavingMeta(false) }
                }}>Guardar</button>
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
              <div className="col-md-4">
                <label className="form-label small">Nombre</label>
                <div className="form-control form-control-sm">{fmtNombre(selectedCliente)}</div>
              </div>
              <div className="col-md-4">
                <label className="form-label small">Teléfono</label>
                <div className="form-control form-control-sm">
                  {selectedCliente.telefono_celular ? (
                    <a
                      href={buildWhatsAppLink(selectedCliente.telefono_celular, agentDisplayName)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {selectedCliente.telefono_celular}
                    </a>
                  ) : '—'}
                </div>
              </div>
              <div className="col-md-4">
                <label className="form-label small">Email</label>
                <div className="form-control form-control-sm">
                  {selectedCliente.email ? (
                    <a href={`mailto:${selectedCliente.email}`}>{selectedCliente.email}</a>
                  ) : '—'}
                </div>
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
              </tbody>
            </table>
          </div>
          {editPoliza && (
            <AppModal title={`Editar póliza ${editPoliza.numero_poliza || ''}`} icon="file-earmark-text" onClose={()=>setEditPoliza(null)}>
              <div className="grid grid-cols-2 gap-2">
                <div className="d-flex flex-column"><label className="form-label small">No. Póliza</label><input className="form-control form-control-sm" value={editPoliza.numero_poliza||''} onChange={e=>setEditPoliza({...editPoliza, numero_poliza: e.target.value})} /></div>
                <div className="d-flex flex-column"><label className="form-label small">Estatus</label>
                  <select
                    className="form-select form-select-sm"
                    value={editPoliza.estatus || 'EN_VIGOR'}
                    onChange={e=> setEditPoliza({ ...editPoliza, estatus: e.target.value })}
                  >
                    <option value="EN_VIGOR">En vigor</option>
                    <option value="ANULADA">Anulada</option>
                  </select>
                </div>
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
                <div className="d-flex flex-column"><label className="form-label small">Prima anual</label>
                  <input
                    className="form-control form-control-sm"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    placeholder="0.00"
                    value={editPrimaText}
                    onChange={e=>{
                      // Permitir dígitos, punto o coma como decimal; no aplicar formateo aquí
                      const v = e.target.value
                      // Mantener sólo dígitos, separadores y signo
                      const cleaned = v.replace(/[^0-9.,-]/g, '')
                      setEditPrimaText(cleaned)
                      const asNumber = parseMoneyInput(cleaned)
                      setEditPoliza({ ...editPoliza, prima_input: (asNumber!=null && Number.isFinite(asNumber)) ? asNumber : null })
                    }}
                    onBlur={() => {
                      // Normalizar a 2 decimales si es un número válido
                      const asNumber = parseMoneyInput(editPrimaText)
                      if (asNumber!=null && Number.isFinite(asNumber)) setEditPrimaText(asNumber.toFixed(2))
                    }}
                  />
                </div>
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
                <button className="btn btn-sm btn-success" disabled={savingPoliza} onClick={()=>submitPolizaCambio(editPoliza)}>{savingPoliza ? 'Guardando…' : (isSuper? 'Guardar y aprobar':'Enviar solicitud')}</button>
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
                  <input
                    className="form-control form-control-sm"
                    inputMode="decimal"
                    pattern="[0-9]*[.,]?[0-9]*"
                    placeholder="0.00"
                    value={nuevaPoliza.prima_input}
                    onChange={e=>{
                      const v = e.target.value
                      const cleaned = v.replace(/[^0-9.,]/g, '')
                      setNuevaPoliza({ ...nuevaPoliza, prima_input: cleaned })
                    }}
                    onBlur={()=>{
                      const asNumber = Number((nuevaPoliza.prima_input||'').replace(',', '.'))
                      if (isFinite(asNumber)) {
                        setNuevaPoliza({ ...nuevaPoliza, prima_input: asNumber.toFixed(2) })
                      }
                    }}
                  />
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
                {(() => {
                  const dup = !!(nuevaPoliza.numero_poliza && polizas.some(p => (p.numero_poliza||'').trim() === nuevaPoliza.numero_poliza.trim()))
                  return (
                    <>
                      {dup && <span className="text-danger small me-2">Este número de póliza ya existe en la lista.</span>}
                      <button className="btn btn-sm btn-success" disabled={submittingNuevaPoliza || dup} onClick={async()=>{
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
                    </>
                  )
                })()}
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

// Helpers: convert between D/M/YYYY (API text) and YYYY-MM-DD (input type=date)
function toISODateFromDMY(text: string): string {
  if (!text) return ''
  const parts = text.split('/')
  if (parts.length !== 3) return ''
  const [d, m, y] = parts.map(p=>p.trim())
  const day = String(Number(d)).padStart(2, '0')
  const mon = String(Number(m)).padStart(2, '0')
  if (!y || day === 'NaN' || mon === 'NaN') return ''
  return `${y}-${mon}-${day}`
}
function toDMYFromISO(iso: string): string {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length !== 3) return ''
  const [y, m, d] = parts
  const day = String(Number(d)).replace(/^0+/, '') || '0'
  const mon = String(Number(m)).replace(/^0+/, '') || '0'
  if (!y || day === 'NaN' || mon === 'NaN') return ''
  return `${day}/${mon}/${y}`
}

// Helpers para hipervínculos
function normalizePhoneMx(raw: string): string {
  // Quitar todo excepto dígitos
  const digits = (raw || '').replace(/\D/g, '')
  // Si ya parece tener lada país (11-13 dígitos), devolver tal cual
  if (digits.length >= 11) return digits
  // Asumir México (+52)
  return `52${digits}`
}
function buildWhatsAppLink(phone: string, agentName: string): string {
  const normalized = normalizePhoneMx(phone)
  const saludo = `Hola, soy ${agentName} tu asesor de seguros Lealtia`
  const text = encodeURIComponent(saludo)
  return `https://wa.me/${normalized}?text=${text}`
}
