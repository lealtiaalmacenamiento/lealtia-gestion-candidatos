"use client"
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { useDialog } from '@/components/ui/DialogProvider'

type Item = {
  id: string
  tipo: 'cliente' | 'poliza'
  ref_id: string
  creado_at: string
  solicitante_id: string
  solicitante_nombre?: string | null
  solicitante_email?: string | null
  cliente_id?: string | null
  cliente_nombre?: string | null
  cliente_code?: string | null
  poliza_numero?: string | null
  ref_label?: string | null
  changes?: Array<{ campo: string, actual: unknown, propuesto: unknown }>
}

export default function PendientesPage() {
  const { user } = useAuth()
  const dialog = useDialog()
  const role = (user?.rol || '').toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin'].includes(role)
  const [items, setItems] = useState<Item[]>([])
  const [scope, setScope] = useState<'all'|'cliente'|'poliza'>('all')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const debugOn = useMemo(() => {
    // Activa debug automáticamente en desarrollo o si la URL incluye ?debug=1
    if (process.env.NODE_ENV !== 'production') return true
    try {
      const sp = new URLSearchParams(window.location.search)
      return sp.has('debug') || sp.get('debug') === '1' || sp.get('debug') === 'true'
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const r = await fetch('/api/historial/pendientes')
      const j = await r.json()
      setItems(j.items || [])
      setLoading(false)
    }
    void run()
  }, [])

  const view = useMemo(() => {
    let v = items
    if (scope === 'cliente') v = v.filter(i => i.tipo === 'cliente')
    else if (scope === 'poliza') v = v.filter(i => i.tipo === 'poliza')
    return v
  }, [items, scope])

  async function refresh() {
    setLoading(true)
    try {
      const r = await fetch('/api/historial/pendientes')
      const j = await r.json()
      setItems(j.items || [])
    } finally {
      setLoading(false)
    }
  }

  async function aprobar(it: Item) {
    if (!isSuper) return
    setActing(it.id)
    try {
      let res: Response
      if (it.tipo === 'cliente') {
        res = await fetch('/api/clientes/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: it.id, debug: debugOn }) })
      } else {
        res = await fetch('/api/polizas/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: it.id, debug: debugOn }) })
      }
      if (!res.ok) {
        try {
          const j = await res.json()
          await dialog.alert(`Error al aprobar: ${j.error || res.status} \n${j.details || ''} ${j.hint || ''}`)
        } catch {
          await dialog.alert(`Error al aprobar (${res.status})`)
        }
        return
      }
      await refresh()
    } finally { setActing(null) }
  }

  async function rechazar(it: Item) {
    if (!isSuper) return
  const motivo = await dialog.prompt('Motivo de rechazo', { icon: 'pencil-square', inputLabel: 'Motivo', placeholder: 'Escribe el motivo...' }) || ''
    setActing(it.id)
    try {
      if (it.tipo === 'cliente') {
  await fetch('/api/clientes/updates/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: it.id, motivo, debug: debugOn }) })
      } else {
  await fetch('/api/polizas/updates/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: it.id, motivo, debug: debugOn }) })
      }
      await refresh()
    } finally { setActing(null) }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Cambios pendientes</h1>
      <div className="flex items-center gap-2 mb-3">
        <label>Filtro:</label>
        <select value={scope} onChange={e=>setScope(e.target.value as 'all'|'cliente'|'poliza')} className="border px-2 py-1">
          <option value="all">Todos</option>
          <option value="cliente">Solo cliente</option>
          <option value="poliza">Solo póliza</option>
        </select>
        {loading && <span className="text-sm text-gray-500">Cargando…</span>}
      </div>
      <div className="table-responsive small">
        <table className="table table-striped table-hover align-middle shadow-sm mb-0">
          <thead className="table-dark">
            <tr>
              <th>Tipo</th>
              <th>Referencia</th>
              <th>Cliente</th>
              <th>Asesor</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <>
              <tr key={r.id}>
                <td className="small">{r.tipo}</td>
                <td className="small">{r.tipo==='poliza' ? (r.poliza_numero || '—') : (r.cliente_code || r.cliente_id || r.ref_label || '—')}</td>
                <td className="small">{r.cliente_nombre || r.ref_label || '—'}</td>
                <td className="small">{r.solicitante_nombre || r.solicitante_email || r.solicitante_id}</td>
                <td className="small">{new Date(r.creado_at).toLocaleString()}</td>
                <td className="small">
                  {isSuper ? (
                    <div className="d-flex gap-2">
                      <button disabled={!!acting} onClick={()=>aprobar(r)} className="btn btn-sm btn-success">{acting===r.id? 'Aplicando…':'Aprobar'}</button>
                      <button disabled={!!acting} onClick={()=>rechazar(r)} className="btn btn-sm btn-danger">{acting===r.id? 'Rechazando…':'Rechazar'}</button>
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
        {['cliente','poliza'].includes(r.tipo) && Array.isArray(r.changes) && r.changes.length>0 && (
                <tr key={`${r.id}-details`}>
                  <td colSpan={6} className="bg-light">
                    <div className="p-2 small">
          <strong>Cambios propuestos {r.tipo==='poliza' ? 'de póliza' : 'de cliente'}</strong>
                      <ul className="mb-0 mt-1" style={{columns: 2, columnGap: '2rem'}}>
                        {r.changes.map((c: { campo: string; actual: unknown; propuesto: unknown }, i: number) => {
                          let actual = renderVal(c.actual)
                          let propuesto = renderVal(c.propuesto)
                          if (c.campo === 'estatus') {
                            const map: Record<string,string> = { EN_VIGOR: 'EN_VIGOR', ANULADA: 'ANULADA' }
                            if (typeof c.actual === 'string') actual = map[c.actual] || c.actual
                            if (typeof c.propuesto === 'string') propuesto = map[c.propuesto] || c.propuesto
                          }
                          return (
                            <li key={i} style={{breakInside:'avoid'}}>
                              <span className="text-muted">{c.campo}:</span> {actual} → <strong>{propuesto}</strong>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  </td>
                </tr>
              )}
              </>
            ))}
            {view.length===0 && (<tr><td colSpan={6} className="text-center text-muted small py-3">Sin pendientes</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function renderVal(v: unknown) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return v.toString()
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  try { return JSON.stringify(v) } catch { return String(v) }
}
