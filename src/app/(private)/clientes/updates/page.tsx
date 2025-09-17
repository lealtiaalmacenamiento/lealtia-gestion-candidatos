"use client"
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthProvider'
import { useDialog } from '@/components/ui/DialogProvider'

type ReqItem = {
  id: string
  cliente_id: string
  solicitante_id: string
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
  motivo_rechazo?: string | null
  creado_at: string
  resuelto_at?: string | null
  resuelto_por?: string | null
  payload_propuesto: Record<string, unknown>
}

export default function ClienteUpdatesPage() {
  const { user } = useAuth()
  const dialog = useDialog()
  const role = (user?.rol || '').toLowerCase()
  const isSuper = ['superusuario','super_usuario','supervisor','admin'].includes(role)
  const [items, setItems] = useState<ReqItem[]>([])
  const [scope, setScope] = useState<'mine' | 'pending' | 'all'>('pending')
  const [clienteId, setClienteId] = useState('')
  const [payload, setPayload] = useState('{"primer_nombre":""}')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/clientes/updates?scope=${scope}`)
    const json = await res.json()
    setItems(json.items || [])
    setLoading(false)
  }, [scope])
  useEffect(() => { void load() }, [load])

  async function submit() {
    setLoading(true)
    try {
      const parsed = JSON.parse(payload)
      await fetch('/api/clientes/updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cliente_id: clienteId, payload: parsed }) })
  } catch {
      await dialog.alert('JSON inválido en payload')
    } finally {
      setLoading(false)
      await load()
    }
  }
  async function apply(id: string) {
    setLoading(true)
    await fetch('/api/clientes/updates/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: id }) })
    setLoading(false)
    await load()
  }
  async function reject(id: string) {
    const motivo = await dialog.prompt('Motivo de rechazo', { icon: 'pencil-square', inputLabel: 'Motivo', placeholder: 'Escribe el motivo...' }) || ''
    setLoading(true)
    await fetch('/api/clientes/updates/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: id, motivo }) })
    setLoading(false)
    await load()
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Solicitudes de cambio de cliente</h1>
      <div className="flex items-center gap-2 mb-4">
        <label>Vista:</label>
  <select value={scope} onChange={e => setScope(e.target.value as 'mine' | 'pending' | 'all')} className="border px-2 py-1">
          <option value="mine">Mis solicitudes</option>
          <option value="pending">Pendientes</option>
          <option value="all">Todas</option>
        </select>
        {loading && <span className="text-sm text-gray-500">Cargando…</span>}
      </div>
      <div className="border rounded p-3 mb-6">
        <h2 className="font-medium mb-2">Enviar nueva solicitud</h2>
        <div className="flex gap-2 mb-2">
          <input placeholder="Cliente ID" value={clienteId} onChange={e => setClienteId(e.target.value)} className="border px-2 py-1 flex-1" />
          <button onClick={submit} className="bg-blue-600 text-white px-3 py-1 rounded">Enviar</button>
        </div>
        <textarea value={payload} onChange={e => setPayload(e.target.value)} className="border w-full h-32 font-mono text-sm p-2" />
        <p className="text-xs text-gray-500 mt-1">Ejemplo: {`{"primer_nombre":"MARIA"}`}</p>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-left">ID</th>
            <th className="border p-2 text-left">Cliente</th>
            <th className="border p-2">Estado</th>
            <th className="border p-2">Creado</th>
            <th className="border p-2">Payload</th>
            <th className="border p-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.id}>
              <td className="border p-2 font-mono text-xs">{it.id}</td>
              <td className="border p-2 font-mono text-xs">{it.cliente_id}</td>
              <td className="border p-2">{it.estado}</td>
              <td className="border p-2">{new Date(it.creado_at).toLocaleString()}</td>
              <td className="border p-2"><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(it.payload_propuesto, null, 2)}</pre></td>
              <td className="border p-2">
                {it.estado === 'PENDIENTE' && isSuper ? (
                  <div className="flex gap-2">
                    <button onClick={() => apply(it.id)} className="bg-green-600 text-white px-2 py-1 rounded">Aprobar</button>
                    <button onClick={() => reject(it.id)} className="bg-red-600 text-white px-2 py-1 rounded">Rechazar</button>
                  </div>
                ) : (
                  <span className="text-gray-500 text-xs">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
