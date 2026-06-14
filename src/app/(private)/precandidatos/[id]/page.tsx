'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BasePage from '@/components/BasePage'
import Link from 'next/link'

interface Actividad {
  id: number
  tipo: string
  descripcion: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface Cita {
  id: string
  inicio: string
  fin: string
  meeting_url: string | null
  estado: string
  calcom_booking_uid: string
  reclutador_id: string
  created_at: string
}

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
  candidato_id: number | null
  notas: string | null
  created_at: string
  actividades: Actividad[]
  citas: Cita[]
}

const ESTADO_BADGE: Record<string, string> = {
  en_secuencia: 'bg-secondary-subtle text-secondary',
  respondio: 'bg-info-subtle text-info',
  link_enviado: 'bg-warning-subtle text-warning',
  cita_agendada: 'bg-primary-subtle text-primary',
  promovido: 'bg-success-subtle text-success',
  descartado: 'bg-danger-subtle text-danger'
}

const ESTADO_LABELS: Record<string, string> = {
  en_secuencia: 'En secuencia',
  respondio: 'Respondió',
  link_enviado: 'Link enviado',
  cita_agendada: 'Cita agendada',
  promovido: 'Promovido',
  descartado: 'Descartado'
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City'
  }).format(new Date(iso))
}

export default function PrecandidatoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<Precandidato | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notif, setNotif] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [promoting, setPromoting] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [notasEdit, setNotasEdit] = useState('')
  const [savingNotas, setSavingNotas] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/precandidatos/${id}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d?.error ?? `Error ${r.status}`))))
      .then((d: Precandidato) => {
        setData(d)
        setNotasEdit(d.notas ?? '')
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const handlePromotion = async () => {
    if (!data) return
    setPromoting(true)
    setNotif(null)
    try {
      const res = await fetch(`/api/precandidatos/${id}/promover`, { method: 'POST' })
      const d = await res.json() as { candidato_id?: number; error?: string }
      if (!res.ok) throw new Error(d.error ?? `Error ${res.status}`)
      setData(prev => prev ? { ...prev, estado: 'promovido', candidato_id: d.candidato_id ?? null } : prev)
      setNotif({ type: 'success', message: `Promovido a Candidato #${d.candidato_id}` })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al promover' })
    } finally {
      setPromoting(false)
    }
  }

  const handleDiscard = async () => {
    if (!data) return
    setDiscarding(true)
    setNotif(null)
    try {
      const res = await fetch(`/api/precandidatos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'descartado' })
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      setData(prev => prev ? { ...prev, estado: 'descartado' } : prev)
      setNotif({ type: 'success', message: 'Precandidato descartado.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al descartar' })
    } finally {
      setDiscarding(false)
    }
  }

  const handleSaveNotas = async () => {
    setSavingNotas(true)
    setNotif(null)
    try {
      const res = await fetch(`/api/precandidatos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas: notasEdit })
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      setData(prev => prev ? { ...prev, notas: notasEdit } : prev)
      setNotif({ type: 'success', message: 'Notas guardadas.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al guardar' })
    } finally {
      setSavingNotas(false)
    }
  }

  return (
    <BasePage title="Detalle Precandidato" alert={notif ? { type: notif.type === 'error' ? 'danger' : 'success', message: notif.message, show: true } : undefined}>
      <div className="mb-3">
        <button className="btn btn-outline-secondary btn-sm" onClick={() => router.back()}>
          ← Volver
        </button>
      </div>

      {loading && <div className="text-center py-4"><div className="spinner-border" /></div>}
      {!loading && error && <div className="alert alert-danger">{error}</div>}

      {!loading && data && (
        <div className="row g-4">
          {/* Header card */}
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-body d-flex flex-wrap align-items-start gap-4">
                <div className="flex-grow-1">
                  <h4 className="fw-bold mb-1">{data.nombre} {data.apellido}</h4>
                  {data.cargo && <div className="text-muted small">{data.cargo}{data.empresa && ` · ${data.empresa}`}</div>}
                  {data.email && <div className="small mt-1"><i className="bi bi-envelope me-1"></i>{data.email}</div>}
                  {data.linkedin_url && (
                    <a href={data.linkedin_url} target="_blank" rel="noopener noreferrer" className="small d-inline-flex align-items-center gap-1 mt-1">
                      <i className="bi bi-linkedin"></i> LinkedIn
                    </a>
                  )}
                </div>
                <div className="d-flex flex-column align-items-end gap-2">
                  <span className={`badge fs-6 ${ESTADO_BADGE[data.estado] ?? 'bg-secondary-subtle'}`}>
                    {ESTADO_LABELS[data.estado] ?? data.estado}
                  </span>
                  {data.estado === 'promovido' && data.candidato_id && (
                    <Link href={`/candidatos`} className="small text-success">
                      Ver Candidato #{data.candidato_id}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          {data.estado !== 'promovido' && data.estado !== 'descartado' && (
            <div className="col-12 col-md-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body d-flex flex-column gap-2">
                  <h6 className="fw-semibold">Acciones</h6>
                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      className="btn btn-success btn-sm"
                      onClick={handlePromotion}
                      disabled={promoting || discarding}
                    >
                      {promoting ? 'Promoviendo…' : 'Promover a Candidato'}
                    </button>
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={handleDiscard}
                      disabled={discarding || promoting}
                    >
                      {discarding ? 'Descartando…' : 'Descartar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="col-12 col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body d-flex flex-column gap-2">
                <h6 className="fw-semibold">Notas</h6>
                <textarea
                  className="form-control form-control-sm"
                  rows={3}
                  value={notasEdit}
                  onChange={e => setNotasEdit(e.target.value)}
                  placeholder="Agregar notas sobre este contacto…"
                />
                <button
                  className="btn btn-outline-primary btn-sm align-self-start"
                  onClick={handleSaveNotas}
                  disabled={savingNotas || notasEdit === (data.notas ?? '')}
                >
                  {savingNotas ? 'Guardando…' : 'Guardar notas'}
                </button>
              </div>
            </div>
          </div>

          {/* Citas */}
          {data.citas.length > 0 && (
            <div className="col-12">
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <h6 className="fw-semibold mb-3">Citas agendadas</h6>
                  <div className="table-responsive">
                    <table className="table table-sm align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Inicio</th>
                          <th>Fin</th>
                          <th>Estado</th>
                          <th>Enlace</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.citas.map(c => (
                          <tr key={c.id}>
                            <td>{formatDate(c.inicio)}</td>
                            <td>{formatDate(c.fin)}</td>
                            <td>
                              <span className={`badge ${c.estado === 'confirmada' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}>
                                {c.estado}
                              </span>
                            </td>
                            <td>
                              {c.meeting_url
                                ? <a href={c.meeting_url} target="_blank" rel="noopener noreferrer">Unirse</a>
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Activity timeline */}
          {data.actividades.length > 0 && (
            <div className="col-12">
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <h6 className="fw-semibold mb-3">Actividad</h6>
                  <ul className="list-group list-group-flush">
                    {data.actividades.map(a => (
                      <li key={a.id} className="list-group-item d-flex justify-content-between align-items-start px-0 py-2">
                        <div>
                          <div className="fw-semibold small text-capitalize">{a.tipo.replace(/_/g, ' ')}</div>
                          {a.descripcion && <div className="small text-muted">{a.descripcion}</div>}
                        </div>
                        <span className="text-muted small text-nowrap ms-3">{formatDate(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </BasePage>
  )
}
