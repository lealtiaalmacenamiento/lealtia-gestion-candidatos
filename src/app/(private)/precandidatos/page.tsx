'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import BasePage from '@/components/BasePage'
import Link from 'next/link'
import { useAuth } from '@/context/AuthProvider'

interface Precandidato {
  id: string
  campana_id: string
  reclutador_id: string | null
  nombre: string
  apellido: string | null
  email: string | null
  empresa: string | null
  cargo: string | null
  linkedin_url: string | null
  estado: 'en_secuencia' | 'respondio' | 'link_enviado' | 'cita_agendada' | 'promovido' | 'descartado'
  created_at: string
}

interface Campana {
  id: string
  nombre: string
  sendpilot_campaign_id: string
}

const ESTADO_LABELS: Record<Precandidato['estado'], string> = {
  en_secuencia: 'En secuencia',
  respondio: 'Respondió',
  link_enviado: 'Link enviado',
  cita_agendada: 'Cita agendada',
  promovido: 'Promovido',
  descartado: 'Descartado'
}

const ESTADO_BADGE: Record<Precandidato['estado'], string> = {
  en_secuencia: 'bg-secondary-subtle text-secondary',
  respondio: 'bg-info-subtle text-info',
  link_enviado: 'bg-warning-subtle text-warning',
  cita_agendada: 'bg-primary-subtle text-primary',
  promovido: 'bg-success-subtle text-success',
  descartado: 'bg-danger-subtle text-danger'
}

export default function PrecandidatosPage() {
  const { user, loadingUser } = useAuth()
  const router = useRouter()

  const esReclutador = user?.segmentos?.includes('reclutador') ?? false

  useEffect(() => {
    if (!loadingUser && user && !esReclutador) router.replace('/home')
  }, [loadingUser, user, esReclutador, router])

  const [items, setItems] = useState<Precandidato[]>([])
  const [total, setTotal] = useState(0)
  const [campanas, setCampanas] = useState<Campana[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [q, setQ] = useState('')
  const [estado, setEstado] = useState<string>('')
  const [campanaId, setCampanaId] = useState<string>('')
  const [propios, setPropios] = useState(false)
  const [offset, setOffset] = useState(0)
  const LIMIT = 50

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) })
      if (q) params.set('q', q)
      if (estado) params.set('estado', estado)
      if (campanaId) params.set('campana_id', campanaId)
      if (propios) params.set('propios', '1')

      const res = await fetch(`/api/precandidatos?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json() as { items: Precandidato[]; total: number }
      setItems(data.items)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [q, estado, campanaId, propios, offset])

  // Load campaigns for filter
  useEffect(() => {
    fetch('/api/sp/campanas', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.resolve({ items: [] }))
      .then((d: { items: Campana[] }) => setCampanas(d.items ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setOffset(0)
  }, [q, estado, campanaId, propios])

  useEffect(() => {
    loadData().catch(() => {})
  }, [loadData])

  // KPI counts
  const counts = items.reduce((acc, item) => {
    acc[item.estado] = (acc[item.estado] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loadingUser || !esReclutador) {
    return (
      <BasePage title="Precandidatos">
        <div className="text-center py-5"><div className="spinner-border text-primary" /></div>
      </BasePage>
    )
  }

  return (
    <BasePage title="Precandidatos">
      {/* KPI mini cards */}
      <div className="row g-2 mb-4">
        {(Object.entries(ESTADO_LABELS) as [Precandidato['estado'], string][]).map(([key, label]) => (
          <div className="col-6 col-md-2" key={key}>
            <div
              className={`card border-0 shadow-sm text-center py-2 px-1 h-100 cursor-pointer ${estado === key ? 'border border-primary' : ''}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setEstado(s => s === key ? '' : key)}
            >
              <div className="fs-4 fw-bold">{total > 0 ? (counts[key] ?? 0) : '—'}</div>
              <div className="small text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="d-flex flex-wrap gap-2 mb-3">
        <input
          type="search"
          className="form-control form-control-sm w-auto flex-grow-1"
          placeholder="Buscar nombre, email, empresa…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select
          className="form-select form-select-sm w-auto"
          value={estado}
          onChange={e => setEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {(Object.entries(ESTADO_LABELS) as [string, string][]).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          className="form-select form-select-sm w-auto"
          value={campanaId}
          onChange={e => setCampanaId(e.target.value)}
        >
          <option value="">Todas las campañas</option>
          {campanas.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        {user?.rol !== 'admin' && user?.rol !== 'supervisor' && (
          <div className="form-check d-flex align-items-center ms-1">
            <input
              className="form-check-input me-1"
              type="checkbox"
              id="propios"
              checked={propios}
              onChange={e => setPropios(e.target.checked)}
            />
            <label className="form-check-label small" htmlFor="propios">Solo míos</label>
          </div>
        )}
      </div>

      {/* Table */}
      {loading && <div className="text-center py-4"><div className="spinner-border" /></div>}
      {!loading && error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && (
        <>
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle">
              <thead className="table-light">
                <tr>
                  <th>Nombre</th>
                  <th>Empresa</th>
                  <th>Cargo</th>
                  <th>Email</th>
                  <th>Estado</th>
                  <th>LinkedIn</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">Sin resultados</td>
                  </tr>
                )}
                {items.map(item => (
                  <tr key={item.id}>
                    <td className="fw-semibold">{item.nombre} {item.apellido}</td>
                    <td>{item.empresa ?? '—'}</td>
                    <td>{item.cargo ?? '—'}</td>
                    <td>{item.email ?? '—'}</td>
                    <td>
                      <span className={`badge ${ESTADO_BADGE[item.estado]}`}>
                        {ESTADO_LABELS[item.estado]}
                      </span>
                    </td>
                    <td>
                      {item.linkedin_url
                        ? <a href={item.linkedin_url} target="_blank" rel="noopener noreferrer" className="small"><i className="bi bi-linkedin me-1"></i>Ver</a>
                        : '—'}
                    </td>
                    <td>
                      <Link href={`/precandidatos/${item.id}`} className="btn btn-outline-primary btn-sm">
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="d-flex align-items-center gap-3 mt-2">
            <span className="small text-muted">Total: {total}</span>
            <div className="d-flex gap-1">
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={offset === 0}
                onClick={() => setOffset(o => Math.max(0, o - LIMIT))}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(o => o + LIMIT)}
              >
                Siguiente →
              </button>
            </div>
          </div>
        </>
      )}
    </BasePage>
  )
}
