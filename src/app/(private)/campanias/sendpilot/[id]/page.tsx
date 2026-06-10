'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BasePage from '@/components/BasePage'
import Link from 'next/link'
import { useAuth } from '@/context/AuthProvider'

interface Reclutador {
  id: string
  campana_id: string
  reclutador_id: string
  calcom_event_type_id: number | null
  calcom_scheduling_url: string | null
  activo: boolean
  usuario: { id: number; email: string; nombre: string | null } | null
}

interface Campana {
  id: string
  nombre: string
  sendpilot_campaign_id: string
  calcom_linkedin_identifier: string
  estado: 'activa' | 'pausada' | 'inactiva'
  stats: Record<string, number>
  sp_sender_ids: string[]
  sp_campana_reclutadores: Reclutador[]
}

interface EventType {
  id: number
  slug: string
  title: string
  schedulingUrl: string
}

interface SecuenciaPaso {
  id: string
  campana_id: string
  paso: number
  dias_espera: number
  mensaje: string
  activo: boolean
}

export default function CampanaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()
  const isSuper = user?.rol === 'admin' || user?.rol === 'supervisor'

  const [campana, setCampana] = useState<Campana | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notif, setNotif] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Users for recruiter select
  const [usuarios, setUsuarios] = useState<{ id_auth: string; nombre: string | null; email: string }[]>([])

  useEffect(() => {
    fetch('/api/usuarios', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.resolve([]))
      .then((d: { id_auth: string; nombre: string | null; email: string }[]) => setUsuarios(d ?? []))
      .catch(() => {})
  }, [])

  // Event types for adding a recruiter
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [newReclutadorId, setNewReclutadorId] = useState('')
  const [newEventTypeId, setNewEventTypeId] = useState<number | null>(null)
  const [newSchedulingUrl, setNewSchedulingUrl] = useState('')
  const [addingReclutador, setAddingReclutador] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sp/campanas/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setCampana(await res.json() as Campana)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load().catch(() => {}) }, [load])

  // Load current user's Cal.com event types
  useEffect(() => {
    fetch('/api/integraciones/calcom/event-types', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.resolve([]))
      .then((d: EventType[]) => setEventTypes(d ?? []))
      .catch(() => {})
  }, [])

  const handleAddReclutador = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newReclutadorId.trim()) return
    setAddingReclutador(true)
    setNotif(null)
    try {
      const res = await fetch(`/api/sp/campanas/${id}/reclutadores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reclutador_id: newReclutadorId.trim(),
          calcom_event_type_id: newEventTypeId,
          calcom_scheduling_url: newSchedulingUrl.trim() || null
        })
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? `Error ${res.status}`)
      }
      setNotif({ type: 'success', message: 'Reclutador agregado.' })
      setNewReclutadorId('')
      setNewEventTypeId(null)
      setNewSchedulingUrl('')
      await load()
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error' })
    } finally {
      setAddingReclutador(false)
    }
  }

  const handleRemoveReclutador = async (reclutadorRowId: string) => {
    setRemovingId(reclutadorRowId)
    try {
      const res = await fetch(`/api/sp/campanas/${id}/reclutadores/${reclutadorRowId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error(`Error ${res.status}`)
      setCampana(prev => prev
        ? { ...prev, sp_campana_reclutadores: prev.sp_campana_reclutadores.filter(r => r.id !== reclutadorRowId) }
        : prev
      )
      setNotif({ type: 'success', message: 'Reclutador eliminado.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error' })
    } finally {
      setRemovingId(null)
    }
  }

  const [syncing, setSyncing] = useState(false)

  const handleSyncLeads = async () => {
    setSyncing(true)
    setNotif(null)
    try {
      const res = await fetch(`/api/sp/campanas/${id}/sync-leads`, { method: 'POST' })
      const d = await res.json() as { inserted?: number; updated?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(d.error ?? `Error ${res.status}`)
      setNotif({
        type: 'success',
        message: `Sincronizados ${d.total} leads: ${d.inserted} nuevos, ${d.updated} actualizados.`
      })
      await load()
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error al sincronizar leads' })
    } finally {
      setSyncing(false)
    }
  }

  // ── Secuencia de recuperación ──────────────────
  const [pasos, setPasos] = useState<SecuenciaPaso[]>([])
  const [editingPaso, setEditingPaso] = useState<SecuenciaPaso | null>(null)
  const [newPasoMsg, setNewPasoMsg] = useState('')
  const [newPasoDias, setNewPasoDias] = useState(3)
  const [savingPaso, setSavingPaso] = useState(false)
  const [deletingPasoId, setDeletingPasoId] = useState<string | null>(null)

  const loadPasos = useCallback(async () => {
    const res = await fetch(`/api/sp/campanas/${id}/secuencia`, { cache: 'no-store' })
    if (res.ok) {
      const d = await res.json() as { pasos: SecuenciaPaso[] }
      setPasos(d.pasos ?? [])
    }
  }, [id])

  useEffect(() => { loadPasos().catch(() => {}) }, [loadPasos])

  const handleAddPaso = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPasoMsg.trim()) return
    setSavingPaso(true)
    setNotif(null)
    try {
      const nextPaso = (pasos.at(-1)?.paso ?? 0) + 1
      const res = await fetch(`/api/sp/campanas/${id}/secuencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paso: nextPaso, dias_espera: newPasoDias, mensaje: newPasoMsg.trim() }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error) }
      setNewPasoMsg('')
      setNewPasoDias(3)
      await loadPasos()
      setNotif({ type: 'success', message: 'Paso agregado.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error' })
    } finally {
      setSavingPaso(false)
    }
  }

  const handleUpdatePaso = async (paso: SecuenciaPaso) => {
    setSavingPaso(true)
    setNotif(null)
    try {
      const res = await fetch(`/api/sp/campanas/${id}/secuencia/${paso.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias_espera: paso.dias_espera, mensaje: paso.mensaje }),
      })
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error) }
      setEditingPaso(null)
      await loadPasos()
      setNotif({ type: 'success', message: 'Paso actualizado.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error' })
    } finally {
      setSavingPaso(false)
    }
  }

  const handleDeletePaso = async (pasoId: string) => {
    setDeletingPasoId(pasoId)
    try {
      await fetch(`/api/sp/campanas/${id}/secuencia/${pasoId}`, { method: 'DELETE' })
      await loadPasos()
      setNotif({ type: 'success', message: 'Paso eliminado.' })
    } catch (err) {
      setNotif({ type: 'error', message: err instanceof Error ? err.message : 'Error' })
    } finally {
      setDeletingPasoId(null)
    }
  }

  // Auto-fill scheduling URL when an event type is selected
  const handleEventTypeChange = (etId: number) => {
    setNewEventTypeId(etId)
    const et = eventTypes.find(e => e.id === etId)
    if (et) setNewSchedulingUrl(et.schedulingUrl)
  }

  const redirectBase = typeof window !== 'undefined'
    ? `${window.location.origin}/api/cal/${campana?.sendpilot_campaign_id}/`
    : ''

  return (
    <BasePage
      title={campana?.nombre ?? 'Detalle campaña'}
      alert={notif ? { type: notif.type === 'error' ? 'danger' : 'success', message: notif.message, show: true } : undefined}
    >
      <div className="mb-3">
        <button className="btn btn-outline-secondary btn-sm" onClick={() => router.back()}>← Volver</button>
      </div>

      {loading && <div className="text-center py-4"><div className="spinner-border" /></div>}
      {!loading && error && <div className="alert alert-danger">{error}</div>}

      {!loading && campana && (
        <div className="row g-4">
          {/* Info card */}
          <div className="col-12 col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body d-flex flex-column gap-2">
                <h6 className="fw-semibold">Información</h6>
                <div className="small"><span className="text-muted">ID SP:</span> <code>{campana.sendpilot_campaign_id}</code></div>
                <div className="small"><span className="text-muted">Identificador LinkedIn:</span> {campana.calcom_linkedin_identifier}</div>
                <div className="small"><span className="text-muted">Estado:</span> {campana.estado}</div>
                {redirectBase && (
                  <div className="small">
                    <span className="text-muted">Enlace de redirección:</span>
                    <code className="ms-1 text-break">{redirectBase}{'<contactId>'}</code>
                    <button
                      className="btn btn-link btn-sm p-0 ms-2"
                      onClick={() => { void navigator.clipboard.writeText(redirectBase); setNotif({ type: 'success', message: 'Enlace copiado.' }) }}
                    >
                      <i className="bi bi-clipboard"></i>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats card */}
          <div className="col-12 col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body">
                <h6 className="fw-semibold mb-3">Precandidatos por estado</h6>
                <div className="row g-2">
                  {Object.entries({
                    en_secuencia: 'En secuencia',
                    respondio: 'Respondió',
                    link_enviado: 'Link enviado',
                    cita_agendada: 'Cita agendada',
                    promovido: 'Promovido',
                    descartado: 'Descartado'
                  }).map(([k, label]) => (
                    <div className="col-6 col-sm-4" key={k}>
                      <div className="text-center">
                        <div className="fw-bold fs-5">{campana.stats[k] ?? 0}</div>
                        <div className="small text-muted">{label}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 d-flex gap-2 flex-wrap">
                  <Link href={`/precandidatos?campana_id=${campana.id}`} className="btn btn-outline-primary btn-sm">
                    Ver precandidatos
                  </Link>
                  {isSuper && (
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={handleSyncLeads}
                      disabled={syncing}
                    >
                      {syncing
                        ? <><span className="spinner-border spinner-border-sm me-1" />Sincronizando...</>
                        : '↻ Sincronizar leads desde SP'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recruiters */}
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <h6 className="fw-semibold mb-3">Reclutadores asignados</h6>
                {campana.sp_campana_reclutadores.length === 0 && (
                  <p className="text-muted small">Sin reclutadores asignados.</p>
                )}
                <ul className="list-group list-group-flush mb-3">
                  {campana.sp_campana_reclutadores.map(r => (
                    <li key={r.id} className="list-group-item d-flex justify-content-between align-items-center px-0">
                      <div>
                        <div className="fw-semibold small">{r.usuario?.nombre ?? r.reclutador_id}</div>
                        <div className="text-muted small">{r.usuario?.email}</div>
                        {r.calcom_scheduling_url && (
                          <div className="small">
                            <span className="text-muted">Cal.com URL:</span>
                            <a href={r.calcom_scheduling_url} target="_blank" rel="noopener noreferrer" className="ms-1 small">{r.calcom_scheduling_url}</a>
                          </div>
                        )}
                      </div>
                      {isSuper && (
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleRemoveReclutador(r.id)}
                          disabled={removingId === r.id}
                        >
                          {removingId === r.id ? '…' : <i className="bi bi-trash"></i>}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {isSuper && (
                  <form className="row g-2 align-items-end" onSubmit={handleAddReclutador}>
                    <div className="col-12 col-md-4">
                      <label className="form-label small">Reclutador</label>
                      <select
                        className="form-select form-select-sm"
                        value={newReclutadorId}
                        onChange={e => setNewReclutadorId(e.target.value)}
                        required
                      >
                        <option value="">— Seleccionar usuario —</option>
                        {usuarios.filter(u => u.id_auth).map(u => (
                          <option key={u.id_auth} value={u.id_auth!}>
                            {u.nombre ?? u.email}
                          </option>
                        ))}
                      </select>
                    </div>
                    {eventTypes.length > 0 && (
                      <div className="col-12 col-md-4">
                        <label className="form-label small">Event type Cal.com</label>
                        <select
                          className="form-select form-select-sm"
                          value={newEventTypeId ?? ''}
                          onChange={e => handleEventTypeChange(Number(e.target.value))}
                        >
                          <option value="">— Seleccionar —</option>
                          {eventTypes.map(et => (
                            <option key={et.id} value={et.id}>{et.title}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="col-12 col-md-3">
                      <label className="form-label small">URL Cal.com</label>
                      <input
                        type="url"
                        className="form-control form-control-sm"
                        value={newSchedulingUrl}
                        onChange={e => setNewSchedulingUrl(e.target.value)}
                        placeholder="https://cal.com/..."
                      />
                    </div>
                    <div className="col-auto">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={addingReclutador}>
                        {addingReclutador ? 'Agregando…' : 'Agregar'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
          {/* Secuencia de recuperación */}
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <div className="d-flex align-items-start justify-content-between mb-1 gap-2 flex-wrap">
                  <h6 className="fw-semibold mb-0">Secuencia de recuperación (CRM)</h6>
                  {campana.stats['sp_secuencia_terminada'] !== undefined && (
                    <span
                      className="badge fw-normal"
                      className="badge fw-normal bg-warning-subtle text-warning-emphasis"
                      title="Leads en los que SP agotó su secuencia y el CRM continuará el seguimiento">
                      {campana.stats['sp_secuencia_terminada'] ?? 0} SP finalizado
                    </span>
                  )}
                </div>
                <p className="text-muted small mb-2">
                  Configura los mismos mensajes y tiempos que en SendPilot. Si SP no envía un paso
                  a tiempo (pausada, límite de tasa, o secuencia agotada), el CRM lo enviará
                  automáticamente como respaldo. Usa <code>{'{nombre}'}</code> para el primer nombre
                  y <code>{'{cal_url}'}</code> para el enlace de agenda.
                </p>
                {(!campana.sp_sender_ids || campana.sp_sender_ids.length === 0) && (
                  <div className="alert alert-warning py-2 small mb-3">
                    <i className="bi bi-exclamation-triangle me-1" />
                    Sin cuenta de LinkedIn configurada. Sincroniza las campañas para detectarla automáticamente desde el inbox.
                  </div>
                )}

                {pasos.length === 0 && (
                  <p className="text-muted small">No hay pasos configurados.</p>
                )}

                <ul className="list-group list-group-flush mb-3">
                  {pasos.map(p => (
                    <li key={p.id} className="list-group-item px-0">
                      {editingPaso?.id === p.id ? (
                        <div className="row g-2 align-items-end">
                          <div className="col-12 col-md-1">
                            <label className="form-label small">Paso</label>
                            <input type="number" className="form-control form-control-sm" value={editingPaso.paso} readOnly />
                          </div>
                          <div className="col-6 col-md-2">
                            <label className="form-label small">Días espera</label>
                            <input
                              type="number" min={1} className="form-control form-control-sm"
                              value={editingPaso.dias_espera}
                              onChange={e => setEditingPaso(prev => prev ? { ...prev, dias_espera: Number(e.target.value) } : prev)}
                            />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label small">Mensaje</label>
                            <textarea
                              className="form-control form-control-sm" rows={2}
                              value={editingPaso.mensaje}
                              onChange={e => setEditingPaso(prev => prev ? { ...prev, mensaje: e.target.value } : prev)}
                            />
                          </div>
                          <div className="col-auto d-flex gap-2">
                            <button
                              className="btn btn-primary btn-sm" disabled={savingPaso}
                              onClick={() => handleUpdatePaso(editingPaso)}
                            >
                              {savingPaso ? '…' : 'Guardar'}
                            </button>
                            <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditingPaso(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div style={{ minWidth: 0 }}>
                            <div className="small fw-semibold">
                              Paso {p.paso} — espera {p.dias_espera} día{p.dias_espera !== 1 ? 's' : ''}
                              {!p.activo && <span className="badge bg-secondary ms-2">Inactivo</span>}
                            </div>
                            {/* Template source */}
                            <div className="small text-muted mt-1" style={{ whiteSpace: 'pre-wrap', maxWidth: 600 }}>{p.mensaje}</div>
                            {/* Preview with variables resolved */}
                            <div className="mt-2 p-2 rounded border bg-body-secondary" style={{ maxWidth: 600 }}>
                              <div className="text-muted small mb-1" style={{ fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Preview</div>
                              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
                                {p.mensaje
                                  .replace(/\{nombre\}/gi, 'María')
                                  .replace(/\{cal_url\}/gi, campana
                                    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/cal/${campana.sendpilot_campaign_id}/<contactId>`
                                    : '{cal_url}'
                                  )
                                }
                              </div>
                            </div>
                          </div>
                          {isSuper && (
                            <div className="d-flex gap-1 flex-shrink-0">
                              <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditingPaso(p)}>
                                <i className="bi bi-pencil" />
                              </button>
                              <button
                                className="btn btn-outline-danger btn-sm"
                                disabled={deletingPasoId === p.id}
                                onClick={() => handleDeletePaso(p.id)}
                              >
                                {deletingPasoId === p.id ? '…' : <i className="bi bi-trash" />}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {isSuper && !editingPaso && (
                  <form className="row g-2 align-items-end" onSubmit={handleAddPaso}>
                    <div className="col-6 col-md-2">
                      <label className="form-label small">Días espera</label>
                      <input
                        type="number" min={1} className="form-control form-control-sm"
                        value={newPasoDias}
                        onChange={e => setNewPasoDias(Number(e.target.value))}
                      />
                    </div>
                    <div className="col-12 col-md-7">
                      <label className="form-label small">Mensaje</label>
                      <textarea
                        className="form-control form-control-sm" rows={2}
                        placeholder={`Hola {nombre}, quería asegurarme de que recibiste mi mensaje...`}
                        value={newPasoMsg}
                        onChange={e => setNewPasoMsg(e.target.value)}
                        required
                      />
                    </div>
                    <div className="col-auto">
                      <button type="submit" className="btn btn-outline-primary btn-sm" disabled={savingPaso}>
                        {savingPaso ? '…' : '+ Agregar paso'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </BasePage>
  )
}
