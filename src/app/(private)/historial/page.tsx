"use client"
import { useEffect, useMemo, useState } from 'react'

type Item = {
  id: string
  tipo: 'cliente' | 'poliza'
  ref_id: string
  solicitante_id: string
  solicitante_email?: string | null
  solicitante_nombre?: string | null
  estado: string
  motivo_rechazo?: string | null
  creado_at: string
  resuelto_at?: string | null
  resuelto_por?: string | null
  resuelto_por_email?: string | null
  resuelto_por_nombre?: string | null
  payload_propuesto: Record<string, unknown>
}

export default function HistorialPage() {
  const [items, setItems] = useState<Item[]>([])
  const [scope, setScope] = useState<'all'|'cliente'|'poliza'|'pending'|'resolved'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const r = await fetch('/api/historial/solicitudes')
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
    else if (scope === 'pending') v = v.filter(i => i.estado === 'PENDIENTE')
    else if (scope === 'resolved') v = v.filter(i => i.estado !== 'PENDIENTE')
    return v
  }, [items, scope])

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Historial de solicitudes</h1>
      <div className="flex items-center gap-2 mb-3">
        <label>Filtro:</label>
  <select value={scope} onChange={e=>setScope(e.target.value as 'all'|'cliente'|'poliza'|'pending'|'resolved')} className="border px-2 py-1">
          <option value="all">Todas</option>
          <option value="cliente">Solo cliente</option>
          <option value="poliza">Solo póliza</option>
          <option value="pending">Pendientes</option>
          <option value="resolved">Resueltas</option>
        </select>
        {loading && <span className="text-sm text-gray-500">Cargando…</span>}
      </div>
      <div className="table-responsive small">
        <table className="table table-striped table-hover align-middle shadow-sm mb-0">
          <thead className="table-dark">
            <tr>
              <th>Tipo</th>
              <th>ID Solicitud</th>
              <th>Referencia</th>
              <th>Estado</th>
              <th>Solicitante</th>
              <th>Creado</th>
              <th>Resuelto</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {view.map(r => (
              <tr key={r.id}>
                <td className="small">{r.tipo}</td>
                <td className="small font-mono">{r.id}</td>
                <td className="small font-mono">{r.ref_id}</td>
                <td className="small">{r.estado}{r.motivo_rechazo ? ` – ${r.motivo_rechazo}`: ''}</td>
                <td className="small">{r.solicitante_nombre || r.solicitante_email || r.solicitante_id}</td>
                <td className="small">{new Date(r.creado_at).toLocaleString()}</td>
                <td className="small">{r.resuelto_at ? `${new Date(r.resuelto_at).toLocaleString()}${r.resuelto_por_nombre ? ` – ${r.resuelto_por_nombre}` : r.resuelto_por_email ? ` – ${r.resuelto_por_email}` : ''}` : '—'}</td>
                <td className="small" style={{minWidth:240, maxWidth:560}}>
                  <pre className="mb-0 small bg-light p-2 border rounded" style={{whiteSpace:'pre-wrap', maxHeight:200, overflow:'auto'}}>{fmt(r.payload_propuesto)}</pre>
                </td>
              </tr>
            ))}
            {view.length===0 && (<tr><td colSpan={7} className="text-center text-muted small py-3">Sin solicitudes</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmt(v: unknown) {
  if (v == null) return '—'
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}
