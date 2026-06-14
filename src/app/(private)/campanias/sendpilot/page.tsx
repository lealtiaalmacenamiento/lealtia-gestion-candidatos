'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import BasePage from '@/components/BasePage'
import Link from 'next/link'
import { useAuth } from '@/context/AuthProvider'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

interface Campana {
  id: string
  nombre: string
  sendpilot_campaign_id: string
  calcom_linkedin_identifier: string
  estado: 'activa' | 'pausada' | 'terminada'
  existe_en_sp: boolean
  sp_analytics: {
    totalLeads: number
    connectionsSent: number
    messagesSent: number
    repliesReceived: number
  } | null
  precandidatos_activos: number
  created_at: string
}

const ESTADO_BADGE: Record<string, string> = {
  activa: 'bg-success-subtle text-success',
  pausada: 'bg-warning-subtle text-warning',
  terminada: 'bg-secondary-subtle text-secondary'
}

export default function CampaniasPage() {
  const { user, loadingUser } = useAuth()
  const router = useRouter()
  const isSuper = user?.rol === 'admin' || user?.rol === 'supervisor'

  const esReclutador = user?.segmentos?.includes('reclutador') ?? false

  useEffect(() => {
    if (!loadingUser && user && !esReclutador) router.replace('/home')
  }, [loadingUser, user, esReclutador, router])

  const [items, setItems] = useState<Campana[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notif, setNotif] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sp/campanas', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json() as { items: Campana[] }
      setItems(data.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar campañas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load().catch(() => {}) }, [load])

  const handleToggle = async (campana: Campana) => {
    const action = campana.estado === 'activa' ? 'pause' : 'resume'
    setActioning(campana.id)
    setNotif(null)
    try {
      const res = await fetch(`/api/sendpilot/campaigns/${campana.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const d = await res.json() as { ok?: boolean; estado?: string; error?: string }
      if (!res.ok) throw new Error(d.error ?? `Error ${res.status}`)
      setItems(prev => prev.map(c => c.id === campana.id
        ? { ...c, estado: (d.estado ?? (action === 'pause' ? 'pausada' : 'activa')) as Campana['estado'] }
        : c
      ))
      setNotif({ type: 'success', message: action === 'pause' ? 'Campaña pausada.' : 'Campaña reanudada.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error' })
    } finally {
      setActioning(null)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setNotif(null)
    try {
      const res = await fetch('/api/sp/campanas/sync', { method: 'POST' })
      const d = await res.json() as { inserted?: number; updated?: number; removed?: number; total?: number; leadsInserted?: number; leadsUpdated?: number; error?: string }
      if (!res.ok) throw new Error(d.error ?? `Error ${res.status}`)
      const parts: string[] = []
      if (d.inserted) parts.push(`${d.inserted} campaña(s) importada(s)`)
      if (d.updated) parts.push(`${d.updated} campaña(s) actualizada(s)`)
      if (d.removed) parts.push(`${d.removed} campaña(s) ya no encontrada(s) en SP`)
      const leadParts: string[] = []
      if (d.leadsInserted) leadParts.push(`${d.leadsInserted} leads nuevos`)
      if (d.leadsUpdated) leadParts.push(`${d.leadsUpdated} leads actualizados`)
      if (leadParts.length) parts.push(leadParts.join(', '))
      setNotif({
        type: 'success',
        message: parts.length
          ? parts.join(' · ') + '.'
          : `Todo al día. ${d.total} campaña(s) sincronizada(s).`
      })
      await load()
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al sincronizar' })
    } finally {
      setSyncing(false)
    }
  }

  // Copy redirect link to clipboard
  const copyLink = (campana: Campana) => {
    const url = `${window.location.origin}/api/cal/${campana.sendpilot_campaign_id}/`
    void navigator.clipboard.writeText(url)
    setNotif({ type: 'success', message: 'Enlace base copiado al portapapeles.' })
  }

  if (loadingUser || !esReclutador) {
    return (
      <BasePage title="Campañas SendPilot">
        <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
      </BasePage>
    )
  }

  return (
    <BasePage
      title="Campañas SendPilot"
      alert={notif ? { type: notif.type === 'error' ? 'danger' : 'success', message: notif.message, show: true } : undefined}
    >
      {isSuper && (
        <div className="d-flex justify-content-end mb-3">
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <><span className="spinner-border spinner-border-sm me-1" />Sincronizando...</> : '↻ Sincronizar desde SendPilot'}
          </button>
        </div>
      )}
      {loading && <div className="text-center py-4"><div className="spinner-border" /></div>}
      {!loading && error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && items.some(c => c.sp_analytics) && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body">
            <h6 className="text-muted mb-3 small text-uppercase fw-semibold">Métricas por campaña (SendPilot)</h6>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={items
                  .filter(c => c.sp_analytics)
                  .map(c => ({
                    name: c.nombre.length > 22 ? c.nombre.slice(0, 20) + '…' : c.nombre,
                    Mensajes: c.sp_analytics!.messagesSent,
                  }))}
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ecef" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                <Tooltip />
                <Bar dataKey="Mensajes" fill="#0d6efd" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!loading && !error && (
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle">
            <thead className="table-light">
              <tr>
                <th>Nombre</th>
                <th>ID SendPilot</th>
                <th>Estado</th>
                <th className="text-center">Precandidatos</th>
                <th className="text-center" title="Mensajes enviados (SendPilot)">Mensajes SP</th>
                {isSuper && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={isSuper ? 6 : 5} className="text-center text-muted py-4">
                    No hay campañas. Se crean automáticamente vía webhook o manualmente.
                  </td>
                </tr>
              )}
              {items.map(campana => (
                <tr key={campana.id}>
                  <td className="fw-semibold">
                    <Link href={`/campanias/sendpilot/${campana.id}`}>{campana.nombre}</Link>
                    {campana.existe_en_sp === false && (
                      <span className="badge bg-danger-subtle text-danger ms-2 small fw-normal">No encontrada en SP</span>
                    )}
                  </td>
                  <td><code className="small">{campana.sendpilot_campaign_id}</code></td>
                  <td>
                    <span className={`badge ${ESTADO_BADGE[campana.estado] ?? 'bg-secondary-subtle text-secondary'}`}>
                      {campana.estado}
                    </span>
                  </td>
                  <td className="text-center">{campana.precandidatos_activos}</td>
                  <td className="text-center">{campana.sp_analytics?.messagesSent ?? <span className="text-muted">—</span>}</td>
                  {isSuper && (
                    <td>
                      <div className="d-flex gap-1 flex-wrap">
                        <Link href={`/campanias/sendpilot/${campana.id}`} className="btn btn-outline-primary btn-sm">
                          Detalle
                        </Link>
                        <button
                          className={`btn btn-sm ${campana.estado === 'activa' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                          onClick={() => handleToggle(campana)}
                          disabled={actioning === campana.id}
                        >
                          {actioning === campana.id
                            ? '…'
                            : campana.estado === 'activa' ? 'Pausar' : 'Reanudar'}
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => copyLink(campana)}
                          title="Copiar enlace de redirección Cal.com"
                        >
                          <i className="bi bi-link-45deg"></i>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BasePage>
  )
}
