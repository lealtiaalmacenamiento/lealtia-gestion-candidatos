"use client"

import { useEffect, useMemo, useState } from 'react'
import BasePage from '@/components/BasePage'
import Notification from '@/components/ui/Notification'
import { useAuth } from '@/context/AuthProvider'
import {
  getAgendaDevelopers,
  updateAgendaDevelopers,
  createAgendaCita,
  cancelAgendaCita,
  getAgendaCitas,
  getAgendaSlots
} from '@/lib/api'
import type { AgendaCita, AgendaDeveloper, AgendaSlotsResponse } from '@/types'

const providerLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams'
}

const integrationLabels: Record<string, string> = {
  google: 'Google',
  microsoft: 'Microsoft',
  zoom: 'Zoom'
}

type ToastState = { type: 'success' | 'error'; message: string } | null

type AgendaFormState = {
  agenteId: string
  supervisorId: string
  inicio: string
  fin: string
  meetingProvider: 'google_meet' | 'zoom' | 'teams'
  meetingUrl: string
  generarEnlace: boolean
  prospectoId: string
  prospectoNombre: string
  notas: string
}

function formatLocalInputValue(date: Date): string {
  const safe = new Date(date.getTime())
  const tzOffset = safe.getTimezoneOffset()
  const local = new Date(safe.getTime() - tzOffset * 60000)
  return local.toISOString().slice(0, 16)
}

function initialFormState(): AgendaFormState {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    agenteId: '',
    supervisorId: '',
    inicio: formatLocalInputValue(start),
    fin: formatLocalInputValue(end),
    meetingProvider: 'google_meet',
    meetingUrl: '',
    generarEnlace: true,
    prospectoId: '',
    prospectoNombre: '',
    notas: ''
  }
}

function isoFromLocalInput(value: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

function formatTimeRange(inicioIso: string, finIso: string): string {
  const inicio = new Date(inicioIso)
  const fin = new Date(finIso)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return `${inicioIso} - ${finIso}`
  const timeFormatter = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' })
  return `${timeFormatter.format(inicio)} — ${timeFormatter.format(fin)}`
}

export default function AgendaPage() {
  const { user } = useAuth()
  const [developers, setDevelopers] = useState<AgendaDeveloper[]>([])
  const [developerSearch, setDeveloperSearch] = useState('')
  const [loadingDevelopers, setLoadingDevelopers] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const [form, setForm] = useState<AgendaFormState>(() => initialFormState())
  const [creating, setCreating] = useState(false)
  const [cancelingId, setCancelingId] = useState<number | null>(null)

  const [citas, setCitas] = useState<AgendaCita[]>([])
  const [loadingCitas, setLoadingCitas] = useState(false)

  const [slots, setSlots] = useState<AgendaSlotsResponse | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [toast, setToast] = useState<ToastState>(null)

  const authorized = user?.rol === 'superusuario' || user?.rol === 'admin'

  useEffect(() => {
    if (!authorized) return
    const bootstrap = async () => {
      await loadDevelopers()
      await loadCitas()
    }
    bootstrap().catch(() => {})
  }, [authorized])

  useEffect(() => {
    if (form.meetingProvider !== 'google_meet' && form.generarEnlace) {
      setForm((prev) => ({ ...prev, generarEnlace: false }))
    }
  }, [form.meetingProvider, form.generarEnlace])

  const developerMap = useMemo(() => {
    const map = new Map<number, AgendaDeveloper>()
    developers.forEach((dev) => map.set(dev.id, dev))
    return map
  }, [developers])

  useEffect(() => {
    if (developers.length === 0) return
    if (!form.agenteId) {
      const firstActive = developers.find((dev) => dev.activo)
      if (firstActive) {
        setForm((prev) => ({ ...prev, agenteId: String(firstActive.id) }))
      }
    }
  }, [developers, form.agenteId])

  async function loadDevelopers() {
    setLoadingDevelopers(true)
    try {
      const data = await getAgendaDevelopers()
      setDevelopers(data)
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'No se pudieron cargar los usuarios' })
    } finally {
      setLoadingDevelopers(false)
    }
  }

  async function loadCitas() {
    setLoadingCitas(true)
    try {
      const data = await getAgendaCitas({ estado: 'confirmada', desde: new Date().toISOString(), limit: 20 })
      setCitas(data)
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'No se pudieron cargar las citas' })
    } finally {
      setLoadingCitas(false)
    }
  }

  const filteredDevelopers = useMemo(() => {
    const term = developerSearch.trim().toLowerCase()
    if (!term) return developers
    return developers.filter((dev) => {
      const target = `${dev.email} ${dev.nombre || ''}`.toLowerCase()
      return target.includes(term)
    })
  }, [developers, developerSearch])

  async function handleToggleDeveloper(dev: AgendaDeveloper) {
    setTogglingId(dev.id)
    try {
      const updated = await updateAgendaDevelopers({ usuarioId: dev.id, isDesarrollador: !dev.is_desarrollador })
      setDevelopers((prev) => {
        const map = new Map(prev.map((item) => [item.id, item]))
        for (const record of updated) {
          map.set(record.id, record)
        }
        return Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email))
      })
      setToast({ type: 'success', message: !dev.is_desarrollador ? 'Usuario marcado como desarrollador' : 'Usuario removido de desarrolladores' })
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo actualizar el usuario' })
    } finally {
      setTogglingId(null)
    }
  }

  async function handleCheckAvailability() {
    const ids = [] as number[]
    if (form.agenteId) ids.push(Number(form.agenteId))
    if (form.supervisorId) ids.push(Number(form.supervisorId))
    if (ids.length === 0) {
      setToast({ type: 'error', message: 'Seleccione al menos un usuario para consultar disponibilidad' })
      return
    }
    const inicioIso = isoFromLocalInput(form.inicio)
    if (!inicioIso) {
      setToast({ type: 'error', message: 'Fecha de inicio inválida' })
      return
    }
    const rangeStart = new Date(inicioIso)
    rangeStart.setHours(0, 0, 0, 0)
    const rangeEnd = new Date(rangeStart.getTime())
    rangeEnd.setHours(23, 59, 59, 999)

    setSlotsLoading(true)
    setSlotsError(null)
    try {
      const data = await getAgendaSlots(ids, { desde: rangeStart.toISOString(), hasta: rangeEnd.toISOString() })
      setSlots(data)
      if (data.busy.length === 0) {
        setToast({ type: 'success', message: 'Sin conflictos para el día seleccionado' })
      }
    } catch (err) {
      setSlots(null)
      setSlotsError(err instanceof Error ? err.message : 'No se pudo consultar disponibilidad')
    } finally {
      setSlotsLoading(false)
    }
  }

  async function handleCreateCita(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.agenteId) {
      setToast({ type: 'error', message: 'Seleccione un agente para la cita' })
      return
    }
    const inicioIso = isoFromLocalInput(form.inicio)
    const finIso = isoFromLocalInput(form.fin)
    if (!inicioIso || !finIso) {
      setToast({ type: 'error', message: 'Fechas de inicio o fin inválidas' })
      return
    }
    if (new Date(finIso) <= new Date(inicioIso)) {
      setToast({ type: 'error', message: 'La hora de fin debe ser posterior a la de inicio' })
      return
    }
    if (!form.generarEnlace && !form.meetingUrl.trim()) {
      setToast({ type: 'error', message: 'Capture un enlace de reunión o activa la generación automática' })
      return
    }

    const payload = {
      agenteId: Number(form.agenteId),
      supervisorId: form.supervisorId ? Number(form.supervisorId) : null,
      inicio: inicioIso,
      fin: finIso,
      meetingProvider: form.meetingProvider,
      meetingUrl: form.meetingUrl.trim() || null,
      generarEnlace: form.generarEnlace,
      prospectoId: form.prospectoId ? Number(form.prospectoId) : null,
      prospectoNombre: form.prospectoNombre.trim() || null,
      notas: form.notas.trim() || null
    }

    setCreating(true)
    try {
      await createAgendaCita(payload)
      setToast({ type: 'success', message: 'Cita creada y notificada' })
      const next = initialFormState()
      next.agenteId = form.agenteId
      next.supervisorId = form.supervisorId
      next.meetingProvider = form.meetingProvider
      next.generarEnlace = form.meetingProvider === 'google_meet'
      setForm(next)
      setSlots(null)
      await loadCitas()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo crear la cita' })
    } finally {
      setCreating(false)
    }
  }

  async function handleCancelCita(cita: AgendaCita) {
    const motivo = typeof window !== 'undefined' ? window.prompt('Motivo de cancelación (opcional)', '') ?? undefined : undefined
    if (motivo === null) return
    setCancelingId(cita.id)
    try {
      await cancelAgendaCita(cita.id, motivo)
      setToast({ type: 'success', message: 'Cita cancelada' })
      await loadCitas()
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'No se pudo cancelar la cita' })
    } finally {
      setCancelingId(null)
    }
  }

  const developerBadges = (tokens: AgendaDeveloper['tokens']) => tokens.map((token) => (
    <span key={token} className="badge bg-success-subtle text-success border border-success-subtle me-1">
      {integrationLabels[token] || token}
    </span>
  ))

  if (!authorized) {
    return (
      <BasePage title="Agenda interna">
        <div className="alert alert-danger mt-4">No tienes permisos para acceder a este módulo.</div>
      </BasePage>
    )
  }

  return (
    <BasePage title="Agenda interna">
      <div className="row g-4">
        <div className="col-xl-5">
          <div className="card shadow-sm h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Parámetros de desarrolladores</span>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={loadDevelopers} disabled={loadingDevelopers}>
                {loadingDevelopers ? 'Actualizando...' : 'Refrescar'}
              </button>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label small text-muted">Buscar</label>
                <input className="form-control form-control-sm" placeholder="Correo o nombre" value={developerSearch} onChange={(e) => setDeveloperSearch(e.target.value)} />
              </div>
              <div className="table-responsive" style={{ maxHeight: 360 }}>
                <table className="table table-sm align-middle">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th className="text-center">Rol</th>
                      <th className="text-center">Desarrollador</th>
                      <th className="text-center">Integraciones</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDevelopers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center text-muted small py-4">
                          {loadingDevelopers ? 'Cargando usuarios...' : 'Sin resultados'}
                        </td>
                      </tr>
                    )}
                    {filteredDevelopers.map((dev) => (
                      <tr key={dev.id}>
                        <td>
                          <div className="fw-semibold">{dev.nombre || dev.email}</div>
                          <div className="text-muted small">{dev.email}</div>
                          {!dev.activo && <span className="badge bg-warning-subtle text-warning border border-warning-subtle mt-1">Inactivo</span>}
                        </td>
                        <td className="text-center small">{dev.rol}</td>
                        <td className="text-center">
                          {dev.is_desarrollador ? <span className="badge bg-primary-subtle text-primary">Sí</span> : <span className="badge bg-secondary-subtle text-secondary">No</span>}
                        </td>
                        <td className="text-center small">{dev.tokens.length > 0 ? developerBadges(dev.tokens) : <span className="text-muted">—</span>}</td>
                        <td className="text-end">
                          <button
                            type="button"
                            className={`btn btn-sm ${dev.is_desarrollador ? 'btn-outline-danger' : 'btn-outline-success'}`}
                            onClick={() => handleToggleDeveloper(dev)}
                            disabled={togglingId === dev.id}
                          >
                            {togglingId === dev.id ? 'Guardando…' : dev.is_desarrollador ? 'Quitar' : 'Marcar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small text-muted mt-3 mb-0">
                Marca como desarrollador a los usuarios que pueden acompañar citas y gestionar el módulo de agenda. Recuerda conectar sus integraciones desde el apartado correspondiente.
              </p>
            </div>
          </div>
        </div>

        <div className="col-xl-7">
          <div className="card shadow-sm mb-4">
            <div className="card-header">
              <span className="fw-semibold">Nueva cita</span>
            </div>
            <div className="card-body">
              <form className="row g-3" onSubmit={handleCreateCita}>
                <div className="col-md-6">
                  <label className="form-label small">Agente *</label>
                  <select className="form-select form-select-sm" value={form.agenteId} onChange={(e) => setForm((prev) => ({ ...prev, agenteId: e.target.value }))}>
                    <option value="">Seleccione agente</option>
                    {developers
                      .filter((dev) => dev.activo)
                      .map((dev) => (
                        <option key={dev.id} value={dev.id}>
                          {dev.nombre || dev.email}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Supervisor (opcional)</label>
                  <select className="form-select form-select-sm" value={form.supervisorId} onChange={(e) => setForm((prev) => ({ ...prev, supervisorId: e.target.value }))}>
                    <option value="">Sin acompañante</option>
                    {developers
                      .filter((dev) => dev.is_desarrollador && dev.activo)
                      .map((dev) => (
                        <option key={dev.id} value={dev.id}>
                          {dev.nombre || dev.email}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label small">Inicio *</label>
                  <input
                    type="datetime-local"
                    className="form-control form-control-sm"
                    value={form.inicio}
                    onChange={(e) => setForm((prev) => ({ ...prev, inicio: e.target.value }))}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Fin *</label>
                  <input
                    type="datetime-local"
                    className="form-control form-control-sm"
                    value={form.fin}
                    onChange={(e) => setForm((prev) => ({ ...prev, fin: e.target.value }))}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label small">Proveedor *</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.meetingProvider}
                    onChange={(e) => setForm((prev) => ({ ...prev, meetingProvider: e.target.value as AgendaFormState['meetingProvider'] }))}
                  >
                    <option value="google_meet">Google Meet</option>
                    <option value="teams">Microsoft Teams</option>
                    <option value="zoom">Zoom</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Generar enlace automáticamente</label>
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="generarEnlaceSwitch"
                      checked={form.generarEnlace}
                      disabled={form.meetingProvider !== 'google_meet'}
                      onChange={(e) => setForm((prev) => ({ ...prev, generarEnlace: e.target.checked }))}
                    />
                    <label className="form-check-label small text-muted" htmlFor="generarEnlaceSwitch">
                      Disponible solo para Google Meet
                    </label>
                  </div>
                </div>

                {!form.generarEnlace && (
                  <div className="col-12">
                    <label className="form-label small">Enlace de reunión *</label>
                    <input
                      className="form-control form-control-sm"
                      placeholder="https://..."
                      value={form.meetingUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, meetingUrl: e.target.value }))}
                    />
                  </div>
                )}

                <div className="col-md-6">
                  <label className="form-label small">Prospecto (ID)</label>
                  <input
                    className="form-control form-control-sm"
                    value={form.prospectoId}
                    onChange={(e) => setForm((prev) => ({ ...prev, prospectoId: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Nombre del prospecto</label>
                  <input
                    className="form-control form-control-sm"
                    value={form.prospectoNombre}
                    onChange={(e) => setForm((prev) => ({ ...prev, prospectoNombre: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>

                <div className="col-12">
                  <label className="form-label small">Notas internas</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={form.notas}
                    onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))}
                    placeholder="Emails adicionales, contexto, etc."
                  />
                </div>

                <div className="col-12 d-flex flex-wrap gap-2 align-items-center">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>
                    {creating ? 'Creando cita…' : 'Crear cita'}
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleCheckAvailability} disabled={slotsLoading}>
                    {slotsLoading ? 'Consultando…' : 'Ver disponibilidad'}
                  </button>
                </div>
              </form>

              {slotsError && <div className="alert alert-danger mt-3 py-2 small">{slotsError}</div>}
              {slots && (
                <div className="mt-3">
                  <h6 className="small text-uppercase text-muted mb-2">Horarios ocupados del día</h6>
                  {slots.busy.length === 0 && <div className="text-muted small">No se encontraron conflictos.</div>}
                  {slots.busy.length > 0 && (
                    <ul className="list-group list-group-flush small">
                      {slots.busy.map((slot, idx) => {
                        const owner = developerMap.get(slot.usuarioId)
                        return (
                          <li key={`${slot.usuarioId}-${idx}`} className="list-group-item px-0">
                            <div className="d-flex justify-content-between">
                              <span>{owner?.nombre || owner?.email || `Usuario #${slot.usuarioId}`}</span>
                              <span className="text-muted">{formatTimeRange(slot.inicio, slot.fin)}</span>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {slots.missingAuth.length > 0 && (
                    <div className="alert alert-warning mt-3 py-2 small">
                      Algunos usuarios no tienen <code>id_auth</code> configurado: {slots.missingAuth.join(', ')}. Actualiza sus perfiles antes de agendar.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="card shadow-sm">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Próximas citas</span>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={loadCitas} disabled={loadingCitas}>
                {loadingCitas ? 'Actualizando…' : 'Refrescar'}
              </button>
            </div>
            <div className="card-body">
              {loadingCitas && <div className="text-muted small">Cargando citas…</div>}
              {!loadingCitas && citas.length === 0 && <div className="text-muted small">No hay citas programadas a futuro.</div>}
              {!loadingCitas && citas.length > 0 && (
                <div className="list-group list-group-flush">
                  {citas.map((cita) => (
                    <div key={cita.id} className="list-group-item px-0">
                      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                        <div>
                          <div className="fw-semibold">{formatDateTime(cita.inicio)} · {providerLabels[cita.meetingProvider] || cita.meetingProvider}</div>
                          <div className="small text-muted">
                            Agente: {cita.agente.nombre || cita.agente.email || '—'}
                            {cita.supervisor && ` · Supervisor: ${cita.supervisor.nombre || cita.supervisor.email || '—'}`}
                          </div>
                          {cita.meetingUrl && (
                            <div className="small">
                              <a href={cita.meetingUrl} target="_blank" rel="noopener noreferrer">
                                Enlace de reunión
                              </a>
                            </div>
                          )}
                          {cita.prospectoNombre && <div className="small">Prospecto: {cita.prospectoNombre}</div>}
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleCancelCita(cita)}
                          disabled={cancelingId === cita.id}
                        >
                          {cancelingId === cita.id ? 'Cancelando…' : 'Cancelar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {toast && <Notification message={toast.message} type={toast.type === 'error' ? 'error' : 'success'} onClose={() => setToast(null)} />}
    </BasePage>
  )
}
