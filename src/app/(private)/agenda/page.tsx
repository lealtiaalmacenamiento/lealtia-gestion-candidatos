"use client"

import { useEffect, useMemo, useState } from 'react'
import BasePage from '@/components/BasePage'
import Notification from '@/components/ui/Notification'
import { useAuth } from '@/context/AuthProvider'
import {
  getAgendaDevelopers,
  createAgendaCita,
  cancelAgendaCita,
  getAgendaCitas,
  getAgendaSlots,
  searchAgendaProspectos
} from '@/lib/api'
import type { AgendaCita, AgendaDeveloper, AgendaSlotsResponse, AgendaProspectoOption, AgendaPlanificacionSummary } from '@/types'

const providerLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom personal',
  teams: 'Microsoft Teams (manual)'
}

const slotSourceLabels: Record<'calendar' | 'agenda' | 'planificacion', string> = {
  calendar: 'Calendario conectado',
  agenda: 'Cita interna',
  planificacion: 'Planificación semanal'
}

const ISO_WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const prospectEstadoLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  seguimiento: 'Seguimiento',
  'con_cita': 'Con cita',
  descartado: 'Descartado',
  'ya_es_cliente': 'Cliente'
}

function formatProspectEstado(estado?: string | null): string {
  if (!estado) return 'Sin estado'
  return prospectEstadoLabels[estado] || estado
}

type PlanRow = { plan: AgendaPlanificacionSummary; block: AgendaPlanificacionSummary['bloques'][number] }

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
  prospectoEmail: string
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
    prospectoEmail: '',
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
  const role = (user?.rol || '').toLowerCase()
  const isAgente = role === 'agente'
  const isAgendaManager = role === 'superusuario' || role === 'admin' || Boolean(user?.is_desarrollador)
  const authorized = isAgente || isAgendaManager
  const actorId = typeof user?.id === 'number' ? user.id : null
  const [developers, setDevelopers] = useState<AgendaDeveloper[]>([])

  const [form, setForm] = useState<AgendaFormState>(() => initialFormState())
  const [creating, setCreating] = useState(false)
  const [cancelingId, setCancelingId] = useState<number | null>(null)

  const [citas, setCitas] = useState<AgendaCita[]>([])
  const [loadingCitas, setLoadingCitas] = useState(false)

  const [slots, setSlots] = useState<AgendaSlotsResponse | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [toast, setToast] = useState<ToastState>(null)
  const [prospectSearchQuery, setProspectSearchQuery] = useState('')
  const [prospectSearchResults, setProspectSearchResults] = useState<AgendaProspectoOption[]>([])
  const [prospectSearchLoading, setProspectSearchLoading] = useState(false)
  const [prospectSearchError, setProspectSearchError] = useState<string | null>(null)
  const [selectedProspect, setSelectedProspect] = useState<AgendaProspectoOption | null>(null)
  const selectedAgente = useMemo(() => {
    if (!form.agenteId) return null
    return developers.find((dev) => String(dev.id) === form.agenteId) ?? null
  }, [developers, form.agenteId])

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

  useEffect(() => {
    if (form.meetingProvider !== 'zoom') return
    const manualUrl = selectedAgente?.zoomManual?.meetingUrl || ''
    if (!manualUrl) return
    setForm((prev) => {
      if (prev.meetingProvider !== 'zoom') return prev
      const trimmed = prev.meetingUrl.trim()
      if (trimmed === manualUrl && prev.generarEnlace === false) {
        return prev
      }
      if (trimmed.length > 0 && trimmed !== manualUrl) {
        return { ...prev, generarEnlace: false }
      }
      return { ...prev, meetingUrl: manualUrl, generarEnlace: false }
    })
  }, [form.meetingProvider, selectedAgente])

  useEffect(() => {
    if (form.meetingProvider !== 'teams') return
    const manualUrl = selectedAgente?.teamsManual?.meetingUrl || ''
    if (!manualUrl) return
    setForm((prev) => {
      if (prev.meetingProvider !== 'teams') return prev
      const trimmed = prev.meetingUrl.trim()
      if (trimmed === manualUrl) {
        return prev
      }
      if (trimmed.length > 0 && trimmed !== manualUrl) {
        return prev
      }
      return { ...prev, meetingUrl: manualUrl }
    })
  }, [form.meetingProvider, selectedAgente])

  useEffect(() => {
    if (!selectedAgente) return
    if (selectedAgente.googleMeetAutoEnabled === false && form.generarEnlace) {
      setForm((prev) => ({ ...prev, generarEnlace: false }))
    }
  }, [selectedAgente, form.generarEnlace])

  const developerMap = useMemo(() => {
    const map = new Map<number, AgendaDeveloper>()
    developers.forEach((dev) => map.set(dev.id, dev))
    return map
  }, [developers])

  const agenteOptions = useMemo(() => {
    if (isAgente && actorId != null) {
      return developers.filter((dev) => dev.id === actorId && dev.activo)
    }
    return developers.filter((dev) => dev.activo)
  }, [developers, isAgente, actorId])

  const planRows = useMemo<PlanRow[]>(() => {
    if (!slots?.planificaciones?.length) return []
    const rows: PlanRow[] = slots.planificaciones.flatMap((plan) =>
      (plan.bloques || [])
        .filter((block) => block.activity === 'CITAS')
        .map((block) => ({ plan, block }))
    )
    return rows.sort((a, b) => {
      const aTs = a.block.fecha ? new Date(a.block.fecha).getTime() : Number.POSITIVE_INFINITY
      const bTs = b.block.fecha ? new Date(b.block.fecha).getTime() : Number.POSITIVE_INFINITY
      if (Number.isFinite(aTs) && Number.isFinite(bTs)) return aTs - bTs
      if (Number.isFinite(aTs)) return -1
      if (Number.isFinite(bTs)) return 1
      return (a.block.day ?? 0) - (b.block.day ?? 0)
    })
  }, [slots])

  useEffect(() => {
    if (developers.length === 0) return
    if (isAgente && actorId != null) {
      const ownId = String(actorId)
      if (form.agenteId !== ownId) {
        setForm((prev) => ({ ...prev, agenteId: ownId }))
      }
      return
    }
    if (!form.agenteId) {
      const firstActive = developers.find((dev) => dev.activo)
      if (firstActive) {
        setForm((prev) => ({ ...prev, agenteId: String(firstActive.id) }))
      }
    }
  }, [developers, form.agenteId, isAgente, actorId])

  useEffect(() => {
    setSelectedProspect(null)
    setProspectSearchResults([])
    setProspectSearchQuery('')
    setProspectSearchError(null)
    setForm((prev) => ({ ...prev, prospectoId: '', prospectoNombre: '', prospectoEmail: '' }))
  }, [form.agenteId])

  async function loadDevelopers() {
    try {
      const data = await getAgendaDevelopers()
      setDevelopers(data)
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'No se pudieron cargar los usuarios' })
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

  async function handleSearchProspects() {
    setProspectSearchError(null)
    if (!form.agenteId) {
      setProspectSearchError('Selecciona un agente antes de buscar prospectos')
      return
    }
    const query = prospectSearchQuery.trim()
    if (query.length < 2) {
      setProspectSearchError('Escribe al menos 2 caracteres para buscar')
      return
    }
    setProspectSearchLoading(true)
    try {
      const results = await searchAgendaProspectos({
        agenteId: Number(form.agenteId),
        query,
        limit: 12,
        includeConCita: true
      })
      setProspectSearchResults(results)
      if (!results.length) {
        setProspectSearchError('Sin coincidencias para el criterio ingresado')
      }
    } catch (err) {
      setProspectSearchResults([])
      setProspectSearchError(err instanceof Error ? err.message : 'No se pudo buscar prospectos')
    } finally {
      setProspectSearchLoading(false)
    }
  }

  function handleSelectProspect(option: AgendaProspectoOption) {
    setSelectedProspect(option)
    setProspectSearchError(null)
    setForm((prev) => ({
      ...prev,
      prospectoId: String(option.id),
      prospectoNombre: option.nombre || '',
      prospectoEmail: option.email || ''
    }))
  }

  function handleClearProspect() {
    setSelectedProspect(null)
    setProspectSearchResults([])
    setProspectSearchError(null)
    setProspectSearchQuery('')
    setForm((prev) => ({ ...prev, prospectoId: '', prospectoNombre: '', prospectoEmail: '' }))
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

    const trimmedProspectoId = form.prospectoId.trim()
    const prospectoIdValue = trimmedProspectoId.length ? Number(trimmedProspectoId) : null
    if (trimmedProspectoId.length && (!Number.isFinite(prospectoIdValue) || prospectoIdValue === null || prospectoIdValue <= 0)) {
      setToast({ type: 'error', message: 'ID de prospecto inválido' })
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
      prospectoId: prospectoIdValue,
      prospectoNombre: form.prospectoNombre.trim() || null,
      prospectoEmail: form.prospectoEmail.trim() || null,
      notas: form.notas.trim() || null
    }

    setCreating(true)
    try {
      await createAgendaCita(payload)
      setToast({ type: 'success', message: 'Cita creada y notificada' })
      setSelectedProspect(null)
      setProspectSearchResults([])
      setProspectSearchQuery('')
      setProspectSearchError(null)
      const next = initialFormState()
      next.agenteId = form.agenteId
      next.supervisorId = form.supervisorId
      next.meetingProvider = form.meetingProvider
      next.generarEnlace = form.meetingProvider === 'google_meet' && selectedAgente?.googleMeetAutoEnabled !== false
      next.prospectoEmail = ''
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
        <div className="col-xl-4">
          <div className="alert alert-info shadow-sm h-100">
            {isAgente ? (
              <>
                <h6 className="fw-semibold mb-2">Conecta tus integraciones</h6>
                <p className="small mb-2">
                  Conecta tu calendario de Google desde el módulo <strong>Integraciones</strong> para generar enlaces de Google Meet automáticamente.
                </p>
                <p className="small mb-2">
                  Ahí mismo puedes guardar tus enlaces personales de Zoom o Microsoft Teams para reutilizarlos al agendar. Si necesitas activar nuevos supervisores o permisos, contacta a un administrador.
                </p>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => window.location.assign('/integraciones')}>
                  Abrir integraciones
                </button>
              </>
            ) : (
              <>
                <h6 className="fw-semibold mb-2">Configuración de agenda interna</h6>
                <p className="small mb-2">
                  Marca a los usuarios como desarrolladores y gestiona supervisores desde <strong>Parámetros &gt; Agenda interna</strong>. Ahí mismo podrás ver quién tiene acceso a la agenda y ajustar sus permisos.
                </p>
                <p className="small mb-2">
                  Los enlaces personales de Zoom o Microsoft Teams se guardan en el módulo <strong>Integraciones</strong>. Pídeles a los desarrolladores que registren sus salas ahí para que se autocompleten al agendar.
                </p>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => window.location.assign('/parametros#agenda-interna')}>
                  Abrir parámetros
                </button>
              </>
            )}
          </div>
        </div>

        <div className="col-xl-8">
          <div className="card shadow-sm mb-4">
            <div className="card-header">
              <span className="fw-semibold">Nueva cita</span>
            </div>
            <div className="card-body">
              <form className="row g-3" onSubmit={handleCreateCita}>
                <div className="col-md-6">
                  <label className="form-label small">Agente *</label>
                  <select
                    className="form-select form-select-sm"
                    value={form.agenteId}
                    onChange={(e) => setForm((prev) => ({ ...prev, agenteId: e.target.value }))}
                    disabled={isAgente}
                  >
                    <option value="">Seleccione agente</option>
                    {agenteOptions
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
                    <option value="zoom">Zoom personal</option>
                    <option value="teams">Microsoft Teams (manual)</option>
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
                      disabled={form.meetingProvider !== 'google_meet' || selectedAgente?.googleMeetAutoEnabled === false}
                      onChange={(e) => setForm((prev) => ({ ...prev, generarEnlace: e.target.checked }))}
                    />
                    <label className="form-check-label small text-muted" htmlFor="generarEnlaceSwitch">
                      Disponible solo para Google Meet con integración activa
                    </label>
                  </div>
                </div>

                {selectedAgente && selectedAgente.googleMeetAutoEnabled === false && (
                  <div className="col-12">
                    <div className="alert alert-warning small mb-0">
                      Este agente tiene deshabilitada la generación automática de Google Meet. Captura el enlace manualmente o pide que enlace su calendario en Integraciones.
                    </div>
                  </div>
                )}

                {form.meetingProvider === 'zoom' && (
                  <div className="col-12">
                    {selectedAgente?.zoomManual?.meetingUrl ? (
                      <div className="alert alert-secondary small mb-0">
                        Se usará el enlace personal guardado para {selectedAgente.nombre || selectedAgente.email}. Puedes ajustarlo si necesitas una sala distinta.
                        {selectedAgente.zoomManual?.meetingId && (
                          <div className="mt-1">ID: {selectedAgente.zoomManual.meetingId}</div>
                        )}
                        {selectedAgente.zoomManual?.meetingPassword && (
                          <div className="mt-1">Contraseña: {selectedAgente.zoomManual.meetingPassword}</div>
                        )}
                      </div>
                    ) : selectedAgente?.zoomLegacy ? (
                      <div className="alert alert-warning small mb-0">
                        Este usuario tiene una conexión antigua de Zoom. Pídeles que guarden su enlace personal en Integraciones.
                      </div>
                    ) : (
                      <div className="alert alert-warning small mb-0">
                        No hay enlace personal de Zoom guardado para este usuario. Copia y pega el enlace manualmente.
                      </div>
                    )}
                  </div>
                )}

                {form.meetingProvider === 'teams' && (
                  <div className="col-12">
                    {selectedAgente?.teamsManual?.meetingUrl ? (
                      <div className="alert alert-secondary small mb-0">
                        Se usará el enlace de Teams guardado para {selectedAgente.nombre || selectedAgente.email}. Puedes ajustarlo si necesitas una sala distinta.
                        {selectedAgente.teamsManual?.meetingId && (
                          <div className="mt-1">ID: {selectedAgente.teamsManual.meetingId}</div>
                        )}
                        {selectedAgente.teamsManual?.meetingPassword && (
                          <div className="mt-1">Contraseña: {selectedAgente.teamsManual.meetingPassword}</div>
                        )}
                      </div>
                    ) : (
                      <div className="alert alert-warning small mb-0">
                        Inicia sesión en Microsoft Teams y copia el enlace de la reunión que quieras compartir. Pégalo en el campo de enlace manual.
                      </div>
                    )}
                  </div>
                )}

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

                <div className="col-12">
                  <div className="d-flex justify-content-between align-items-center">
                    <label className="form-label small mb-0">Buscar prospecto existente (opcional)</label>
                    {selectedProspect && (
                      <button type="button" className="btn btn-link btn-sm p-0" onClick={handleClearProspect}>
                        Quitar selección
                      </button>
                    )}
                  </div>
                  <div className="input-group input-group-sm">
                    <input
                      className="form-control"
                      placeholder="Nombre, email o teléfono"
                      value={prospectSearchQuery}
                      onChange={(e) => setProspectSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSearchProspects().catch(() => {})
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => handleSearchProspects().catch(() => {})}
                      disabled={prospectSearchLoading}
                    >
                      {prospectSearchLoading ? 'Buscando…' : 'Buscar'}
                    </button>
                  </div>
                  <div className="form-text">Los resultados se filtran por el agente seleccionado.</div>
                  {prospectSearchError && <div className="text-danger small mt-1">{prospectSearchError}</div>}
                  {selectedProspect && (
                    <div className="alert alert-success small mt-2 mb-0">
                      <div className="d-flex flex-column">
                        <span className="fw-semibold">{selectedProspect.nombre || 'Sin nombre registrado'}</span>
                        <span>{selectedProspect.email || 'Sin correo'}</span>
                        <span className="text-muted">Estado: {formatProspectEstado(selectedProspect.estado)}</span>
                      </div>
                    </div>
                  )}
                  {!prospectSearchLoading && prospectSearchResults.length > 0 && (
                    <div className="table-responsive mt-2">
                      <table className="table table-sm table-hover align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Prospecto</th>
                            <th>Correo</th>
                            <th>Estado</th>
                            <th>Última cita</th>
                            <th className="text-end">&nbsp;</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prospectSearchResults.map((option) => (
                            <tr key={option.id}>
                              <td>
                                <div className="fw-semibold small">{option.nombre || 'Sin nombre'}</div>
                                <div className="text-muted small">ID #{option.id}</div>
                              </td>
                              <td className="small">{option.email || 'Sin correo'}</td>
                              <td>
                                <span className="badge text-bg-light border small">{formatProspectEstado(option.estado)}</span>
                              </td>
                              <td className="small">{option.fecha_cita ? formatDateTime(option.fecha_cita) : 'Sin cita'}</td>
                              <td className="text-end">
                                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => handleSelectProspect(option)}>
                                  Usar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <input type="hidden" value={form.prospectoId} readOnly />

                <div className="col-md-6">
                  <label className="form-label small">Nombre del prospecto</label>
                  <input
                    className="form-control form-control-sm"
                    value={form.prospectoNombre}
                    onChange={(e) => setForm((prev) => ({ ...prev, prospectoNombre: e.target.value }))}
                    placeholder="Opcional"
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Correo del prospecto</label>
                  <input
                    className="form-control form-control-sm"
                    value={form.prospectoEmail}
                    onChange={(e) => setForm((prev) => ({ ...prev, prospectoEmail: e.target.value }))}
                    placeholder="Opcional"
                    type="email"
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
                            <div className="d-flex justify-content-between align-items-start gap-3">
                              <div>
                                <div className="fw-semibold">{owner?.nombre || owner?.email || `Usuario #${slot.usuarioId}`}</div>
                                <div className="small text-muted mt-1 d-flex flex-wrap align-items-center gap-2">
                                  <span className="badge text-bg-light border">
                                    {slotSourceLabels[slot.source as keyof typeof slotSourceLabels] || slot.source}
                                  </span>
                                  {slot.title && <span>{slot.title}</span>}
                                  {slot.prospectoId != null && <span>Prospecto #{slot.prospectoId}</span>}
                                  {slot.citaId != null && slot.source === 'agenda' && <span>Cita #{slot.citaId}</span>}
                                  {slot.descripcion && <span className="text-break">{slot.descripcion}</span>}
                                </div>
                              </div>
                              <div className="text-muted small text-end">
                                {formatTimeRange(slot.inicio, slot.fin)}
                                {slot.source === 'planificacion' && slot.planId != null && (
                                  <div className="mt-1">Plan #{slot.planId}</div>
                                )}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {planRows.length > 0 && (
                    <div className="mt-3">
                      <h6 className="small text-uppercase text-muted mb-2">Planificación semanal (CITAS)</h6>
                      <div className="table-responsive">
                        <table className="table table-sm align-middle mb-0">
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Horario</th>
                              <th>Prospecto</th>
                              <th>Estado</th>
                              <th>Notas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {planRows.map(({ plan, block }, idx) => (
                              <tr key={`${plan.agenteId}-${plan.semanaIso}-${idx}-${block.fecha || block.hour}`}> 
                                <td className="small">
                                  {block.fecha ? formatDateTime(block.fecha) : ISO_WEEK_DAYS[block.day] || `Día ${block.day}`}
                                </td>
                                <td className="small">
                                  {block.fecha && block.fin ? formatTimeRange(block.fecha, block.fin) : `${block.hour}:00`}
                                </td>
                                <td className="small">
                                  {block.prospecto_nombre || 'Sin prospecto'}
                                  {block.prospecto_id != null && <div className="text-muted">ID #{block.prospecto_id}</div>}
                                </td>
                                <td className="small">
                                  <span className="badge text-bg-light border">{formatProspectEstado(block.prospecto_estado)}</span>
                                </td>
                                <td className="small">
                                  <div>{block.notas || '—'}</div>
                                  <div className="text-muted">Origen: {block.source === 'manual' ? 'Manual' : 'Automático'}</div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
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
                          {cita.prospectoEmail && <div className="small text-muted">Correo prospecto: {cita.prospectoEmail}</div>}
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
