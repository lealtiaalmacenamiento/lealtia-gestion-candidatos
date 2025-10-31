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
import type { AgendaBusySlot, AgendaCita, AgendaDeveloper, AgendaSlotsResponse, AgendaProspectoOption, AgendaPlanificacionSummary } from '@/types'
import { obtenerSemanaIso } from '@/lib/semanaIso'

const providerLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom personal',
  teams: 'Microsoft Teams'
}

const slotSourceLabels: Record<'calendar' | 'agenda' | 'planificacion', string> = {
  calendar: 'Calendario conectado',
  agenda: 'Agenda interna',
  planificacion: 'Planificación CITAS'
}

const meetingProviderLabels: Record<string, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  google: 'Google Calendar'
}

function formatMeetingProviderLabel(provider?: string | null) {
  if (!provider) return null
  return meetingProviderLabels[provider] || provider
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

const CDMX_TIME_ZONE = 'America/Mexico_City' as const

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: CDMX_TIME_ZONE
  }).format(date)
}

function formatTimeRange(inicioIso: string, finIso: string): string {
  const inicio = new Date(inicioIso)
  const fin = new Date(finIso)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return `${inicioIso} - ${finIso}`
  return `${timeFormatter.format(inicio)} — ${timeFormatter.format(fin)}`
}

const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: CDMX_TIME_ZONE })
const timeFormatter = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: CDMX_TIME_ZONE })

function formatDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return iso
  return dateFormatter.format(value)
}

function formatAvailabilityRange(desde?: string | null, hasta?: string | null): string | null {
  const startLabel = formatDateOnly(desde)
  const endLabel = formatDateOnly(hasta)
  if (startLabel && endLabel) {
    if (startLabel === endLabel) return startLabel
    return `${startLabel} — ${endLabel}`
  }
  return startLabel ?? endLabel
}

function formatDateTimeRangeDetailed(inicioIso: string, finIso: string): string {
  const inicio = new Date(inicioIso)
  const fin = new Date(finIso)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    return `${inicioIso} — ${finIso}`
  }
  const sameDay =
    inicio.getFullYear() === fin.getFullYear() &&
    inicio.getMonth() === fin.getMonth() &&
    inicio.getDate() === fin.getDate()
  if (sameDay) {
    return `${dateFormatter.format(inicio)} · ${timeFormatter.format(inicio)} — ${timeFormatter.format(fin)}`
  }
  return `${dateFormatter.format(inicio)} ${timeFormatter.format(inicio)} — ${dateFormatter.format(fin)} ${timeFormatter.format(fin)}`
}

function safeTimestamp(iso?: string | null): number | null {
  if (!iso) return null
  const value = new Date(iso)
  const ms = value.getTime()
  return Number.isNaN(ms) ? null : ms
}

function slotHasSource(slot: AgendaBusySlot, source: 'calendar' | 'agenda' | 'planificacion'): boolean {
  if (slot.source === source) return true
  return Boolean(slot.sourceDetails?.some((detail) => detail.source === source))
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
  const [prospectOptions, setProspectOptions] = useState<AgendaProspectoOption[]>([])
  const [prospectOptionsLoading, setProspectOptionsLoading] = useState(false)
  const [prospectOptionsError, setProspectOptionsError] = useState<string | null>(null)
  const [prospectQuery, setProspectQuery] = useState('')
  const [debouncedProspectQuery, setDebouncedProspectQuery] = useState('')
  const [showProspectSuggestions, setShowProspectSuggestions] = useState(false)
  const [highlightedProspectIndex, setHighlightedProspectIndex] = useState(-1)
  const [selectedProspect, setSelectedProspect] = useState<AgendaProspectoOption | null>(null)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [hasCheckedAvailability, setHasCheckedAvailability] = useState(false)
  const [prospectEmailLocked, setProspectEmailLocked] = useState(false)
  const selectedAgente = useMemo(() => {
    if (!form.agenteId) return null
    return developers.find((dev) => String(dev.id) === form.agenteId) ?? null
  }, [developers, form.agenteId])
  const currentWeekInfo = useMemo(() => obtenerSemanaIso(), [])
  const availableProviders = useMemo(() => {
    if (!selectedAgente) return [] as Array<{ value: AgendaFormState['meetingProvider']; label: string }>
    const providers: Array<{ value: AgendaFormState['meetingProvider']; label: string }> = []
    if (selectedAgente.tokens.includes('google')) {
      providers.push({ value: 'google_meet', label: 'Google Meet' })
    }
    if (selectedAgente.tokens.includes('zoom')) {
      providers.push({ value: 'zoom', label: 'Zoom personal' })
    }
    if (selectedAgente.tokens.includes('teams')) {
      providers.push({ value: 'teams', label: 'Microsoft Teams' })
    }
    return providers
  }, [selectedAgente])
  // `prospectOptions` is rendered as a flat list in the UI; grouping by week
  // was computed previously but is unused. Removed to avoid lint warnings.

  useEffect(() => {
    if (!selectedAgente) return
    if (availableProviders.length === 0) {
      setForm((prev) => {
        if (prev.meetingProvider === 'google_meet') {
          return prev
        }
        return { ...prev, meetingProvider: 'google_meet' }
      })
      return
    }
    if (!availableProviders.some((provider) => provider.value === form.meetingProvider)) {
      const nextProvider = availableProviders[0]
      setForm((prev) => ({
        ...prev,
        meetingProvider: nextProvider.value
      }))
    }
  }, [availableProviders, form.meetingProvider, selectedAgente])

  useEffect(() => {
    if (!authorized) return
    const bootstrap = async () => {
      await loadDevelopers()
      await loadCitas()
    }
    bootstrap().catch(() => {})
  }, [authorized])

  useEffect(() => {
    if (form.meetingProvider !== 'zoom') return
    const manualUrl = selectedAgente?.zoomManual?.meetingUrl || ''
    if (!manualUrl) return
    setForm((prev) => {
      if (prev.meetingProvider !== 'zoom') return prev
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
    if (form.meetingProvider !== 'google_meet') return
    if (form.meetingUrl.trim().length === 0) return
    setForm((prev) => {
      if (prev.meetingProvider !== 'google_meet') return prev
      if (prev.meetingUrl.trim().length === 0) return prev
      return { ...prev, meetingUrl: '' }
    })
  }, [form.meetingProvider, form.meetingUrl])

  const developerMap = useMemo(() => {
    const map = new Map<number, AgendaDeveloper>()
    developers.forEach((dev) => map.set(dev.id, dev))
    return map
  }, [developers])

  const availabilityRangeBounds = useMemo(() => {
    if (!slots?.range) return null
    const start = safeTimestamp(slots.range.desde ?? null)
    const end = safeTimestamp(slots.range.hasta ?? null)
    if (start == null && end == null) return null
    return { start: start ?? null, end: end ?? null }
  }, [slots])

  const agenteOptions = useMemo(() => {
    if (isAgente && actorId != null) {
      return developers.filter((dev) => dev.id === actorId && dev.activo)
    }
    return developers.filter((dev) => dev.activo)
  }, [developers, isAgente, actorId])

  const planRows = useMemo<PlanRow[]>(() => {
    if (!slots?.planificaciones?.length) return []
    const startBound = availabilityRangeBounds?.start ?? null
    const endBound = availabilityRangeBounds?.end ?? null
    const rows: PlanRow[] = slots.planificaciones.flatMap((plan) =>
      (plan.bloques || [])
        .filter((block) => block.activity === 'CITAS')
        .filter((block) => {
          const blockTs = safeTimestamp(block.fecha ?? null)
          if (blockTs == null) return startBound == null && endBound == null
          if (startBound != null && blockTs < startBound) return false
          if (endBound != null && blockTs > endBound) return false
          return true
        })
        .map((block) => ({ plan, block }))
    )
    return rows.sort((a, b) => {
      const aTs = safeTimestamp(a.block.fecha ?? null)
      const bTs = safeTimestamp(b.block.fecha ?? null)
      if (aTs != null && bTs != null) return aTs - bTs
      if (aTs != null) return -1
      if (bTs != null) return 1
      return (a.block.day ?? 0) - (b.block.day ?? 0)
    })
  }, [availabilityRangeBounds, slots])

  const availabilityRangeLabel = useMemo(() => {
    if (!slots) return null
    return formatAvailabilityRange(slots.range?.desde ?? null, slots.range?.hasta ?? null)
  }, [slots])

  const busySlotsInRange = useMemo(() => {
    if (!slots?.busy?.length) return []
    const startBound = availabilityRangeBounds?.start ?? null
    const endBound = availabilityRangeBounds?.end ?? null
    return slots.busy.filter((slot) => {
      const slotStart = safeTimestamp(slot.inicio)
      const slotEnd = safeTimestamp(slot.fin)
      if (startBound != null) {
        const effectiveStart = slotEnd ?? slotStart
        if (effectiveStart != null && effectiveStart < startBound) return false
      }
      if (endBound != null) {
        const effectiveEnd = slotStart ?? slotEnd
        if (effectiveEnd != null && effectiveEnd > endBound) return false
      }
      return true
    })
  }, [availabilityRangeBounds, slots])

  useEffect(() => {
    setHasCheckedAvailability(false)
  }, [form.agenteId, form.supervisorId, form.inicio, form.fin])

  useEffect(() => {
    if (!selectedProspect) {
      setProspectEmailLocked(false)
      return
    }
    const hasEmail = Boolean(selectedProspect.email && selectedProspect.email.trim().length > 0)
    setProspectEmailLocked(hasEmail)
  }, [selectedProspect])

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
    if (actorId == null) {
      setShowConnectModal(false)
      return
    }
    if (!selectedAgente) {
      setShowConnectModal(false)
      return
    }
    const isOwnAgenda = Number(form.agenteId) === actorId
    if (!isOwnAgenda) {
      setShowConnectModal(false)
      return
    }
    setShowConnectModal(!selectedAgente.tokens.includes('google'))
  }, [actorId, form.agenteId, selectedAgente])

  useEffect(() => {
    if (!showConnectModal) return
    if (typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showConnectModal])

  useEffect(() => {
    let cancelled = false
    setSelectedProspect(null)
    setForm((prev) => ({ ...prev, prospectoId: '', prospectoNombre: '', prospectoEmail: '' }))
    setProspectOptions([])
    setProspectOptionsError(null)
    if (!form.agenteId) {
      setProspectOptionsLoading(false)
      return
    }
    setProspectOptionsLoading(true)
    const agenteNumeric = Number(form.agenteId)
    searchAgendaProspectos({ agenteId: agenteNumeric, query: debouncedProspectQuery || undefined, limit: 50, includeConCita: true, includeSinCorreo: true })
      .then((results) => {
        if (cancelled) return
        setProspectOptions(results)
        if (!results.length) {
          setProspectOptionsError('No se encontraron prospectos recientes para este agente. Completa el correo desde Prospectos o crea un nuevo registro.')
        }
      })
      .catch((err) => {
        if (cancelled) return
        setProspectOptionsError(err instanceof Error ? err.message : 'No se pudieron cargar los prospectos')
      })
      .finally(() => {
        if (cancelled) return
        setProspectOptionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [form.agenteId, debouncedProspectQuery])

  // Debounce the prospectQuery to avoid firing on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedProspectQuery(prospectQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [prospectQuery])

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
    const agenteIdNumeric = form.agenteId ? Number(form.agenteId) : null
    const supervisorIdNumeric = form.supervisorId ? Number(form.supervisorId) : null
    if (agenteIdNumeric) ids.push(agenteIdNumeric)
    if (supervisorIdNumeric) ids.push(supervisorIdNumeric)
    if (ids.length === 0) {
      setToast({ type: 'error', message: 'Seleccione al menos un usuario para consultar disponibilidad' })
      return
    }
    const inicioIso = isoFromLocalInput(form.inicio)
    if (!inicioIso) {
      setToast({ type: 'error', message: 'Fecha de inicio inválida' })
      return
    }
    const finIso = isoFromLocalInput(form.fin)
    let rangeEndSource = inicioIso
    if (finIso) {
      const inicioDate = new Date(inicioIso)
      const finDate = new Date(finIso)
      if (finDate < inicioDate) {
        setToast({ type: 'error', message: 'La fecha de fin no puede ser anterior a la de inicio.' })
        return
      }
      rangeEndSource = finIso
    }

    const rangeStart = new Date(inicioIso)
    rangeStart.setHours(0, 0, 0, 0)
    const rangeEnd = new Date(rangeEndSource)
    rangeEnd.setHours(23, 59, 59, 999)
    const rangeStartIso = rangeStart.toISOString()
    const rangeEndIso = rangeEnd.toISOString()
    const rangeLabel = formatAvailabilityRange(rangeStartIso, rangeEndIso)

    setSlotsLoading(true)
    setSlotsError(null)
    try {
      const data = await getAgendaSlots(ids, { desde: rangeStartIso, hasta: rangeEndIso })
      setSlots(data)
      const eventStartBound = safeTimestamp(inicioIso)
      const eventEndBound = safeTimestamp(finIso ?? inicioIso)
      const conflicts = data.busy.filter((slot) => {
        const slotStart = safeTimestamp(slot.inicio)
        const slotEnd = safeTimestamp(slot.fin)
        const slotRangeStart = slotStart ?? slotEnd
        const slotRangeEnd = slotEnd ?? slotStart

        if (slotRangeStart == null && slotRangeEnd == null) {
          return false
        }

        const effectiveEventStart = eventStartBound ?? eventEndBound
        const effectiveEventEnd = eventEndBound ?? eventStartBound

        if (effectiveEventStart != null && slotRangeEnd != null && slotRangeEnd <= effectiveEventStart) {
          return false
        }
        if (effectiveEventEnd != null && slotRangeStart != null && slotRangeStart >= effectiveEventEnd) {
          return false
        }

        return true
      })
      const supervisorConflicts = supervisorIdNumeric == null
        ? []
        : conflicts.filter((slot) => {
            if (slot.usuarioId === supervisorIdNumeric) return true
            const numericId = Number(slot.usuarioId)
            if (Number.isFinite(numericId) && numericId === supervisorIdNumeric) return true
            return false
          })

      const hasSupervisorConflicts = supervisorConflicts.length > 0
      const hasConflicts = conflicts.length > 0

      if (hasSupervisorConflicts) {
        const supervisorConflictSources = {
          calendar: supervisorConflicts.some((slot) => slotHasSource(slot, 'calendar')),
          planificacion: supervisorConflicts.some((slot) => slotHasSource(slot, 'planificacion'))
        }
        const parts: string[] = []
        if (supervisorConflictSources.calendar) {
          parts.push('calendario de Google')
        }
        if (supervisorConflictSources.planificacion) {
          const planTitles = new Set(
            supervisorConflicts
              .flatMap((slot) => slot.sourceDetails ?? [])
              .filter((detail) => detail.source === 'planificacion')
              .map((detail) => (detail.title || '').toLowerCase())
          )
          if ([...planTitles].some((title) => title.includes('prospección'))) {
            parts.push('planificación (Prospección)')
          }
          if ([...planTitles].some((title) => title.includes('citas'))) {
            parts.push('planificación (Citas)')
          }
          if (planTitles.size === 0) {
            parts.push('planificación')
          }
        }
        const sourceLabel = parts.length ? parts.join(' y ') : 'los horarios del supervisor'
        setToast({ type: 'error', message: `El supervisor seleccionado tiene eventos en ${sourceLabel} para el rango elegido. Ajusta fecha y hora antes de continuar.` })
      } else if (hasConflicts) {
        setToast({ type: 'error', message: 'Se detectaron conflictos en el rango seleccionado. Revisa los horarios ocupados antes de agendar.' })
      } else {
        const successMessage = rangeLabel ? `Sin conflictos en ${rangeLabel}.` : 'Sin conflictos en el rango seleccionado.'
        setToast({ type: 'success', message: successMessage })
      }

      setHasCheckedAvailability(!hasConflicts && !hasSupervisorConflicts)
    } catch (err) {
      setSlots(null)
      setSlotsError(err instanceof Error ? err.message : 'No se pudo consultar disponibilidad')
      setHasCheckedAvailability(false)
    } finally {
      setSlotsLoading(false)
    }
  }

  function handleSelectProspect(option: AgendaProspectoOption) {
    setSelectedProspect(option)
    setForm((prev) => ({
      ...prev,
      prospectoId: String(option.id),
      prospectoNombre: option.nombre || '',
      prospectoEmail: option.email || ''
    }))
  }

  // handleProspectSelectChange removed (was unused). Selection is handled
  // directly via `handleSelectProspect` from the suggestions list.

  function handleClearProspect() {
    setSelectedProspect(null)
    setForm((prev) => ({ ...prev, prospectoId: '', prospectoNombre: '', prospectoEmail: '' }))
  }

  function handleConnectModalAction() {
    window.location.assign('/integraciones')
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
    if (!availableProviders.find((provider) => provider.value === form.meetingProvider)) {
      setToast({ type: 'error', message: 'El agente seleccionado no tiene configurado el proveedor elegido. Revisa las integraciones.' })
      return
    }

    if (!hasCheckedAvailability) {
      setToast({ type: 'error', message: 'Consulta disponibilidad antes de crear la cita.' })
      return
    }

    const isGoogleMeet = form.meetingProvider === 'google_meet'
    const trimmedMeetingUrl = form.meetingUrl.trim()

    if (isGoogleMeet) {
      if (!selectedAgente?.tokens.includes('google')) {
        setToast({ type: 'error', message: 'Conecta Google Calendar en Integraciones antes de agendar.' })
        setShowConnectModal(true)
        return
      }
      if (selectedAgente?.googleMeetAutoEnabled === false) {
        setToast({ type: 'error', message: 'Habilita la generación automática de enlaces en Integraciones antes de usar Google Meet.' })
        return
      }
    } else if (!trimmedMeetingUrl) {
      setToast({ type: 'error', message: 'Este proveedor necesita un enlace personal guardado en Integraciones.' })
      return
    }

    if (!form.prospectoId.trim()) {
      setToast({ type: 'error', message: 'Selecciona un prospecto existente antes de agendar.' })
      return
    }
    if (!form.prospectoNombre.trim()) {
      setToast({ type: 'error', message: 'El prospecto seleccionado no tiene nombre registrado. Actualiza el prospecto antes de agendar.' })
      return
    }
    if (!form.prospectoEmail.trim()) {
      setToast({ type: 'error', message: 'Captura el correo electrónico del prospecto antes de agendar.' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.prospectoEmail.trim())) {
      setToast({ type: 'error', message: 'El correo del prospecto es inválido.' })
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
  meetingUrl: isGoogleMeet ? null : trimmedMeetingUrl || null,
  generarEnlace: isGoogleMeet,
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
      const next = initialFormState()
      next.agenteId = form.agenteId
      next.supervisorId = form.supervisorId
      next.meetingProvider = form.meetingProvider
      next.prospectoEmail = ''
      setForm(next)
      setSlots(null)
      if (form.agenteId) {
        try {
          const refreshed = await searchAgendaProspectos({ agenteId: Number(form.agenteId), limit: 50, includeConCita: true, includeSinCorreo: true })
          setProspectOptions(refreshed)
        } catch {}
      }
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
                  Ahí mismo puedes guardar tus enlaces personales de Zoom o Microsoft Teams para reutilizarlos al agendar.
                </p>
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => window.location.assign('/integraciones')}>
                  Abrir integraciones
                </button>
              </>
            ) : (
              <>
                <h6 className="fw-semibold mb-2">Configuración de agenda interna</h6>
                <p className="small mb-2">
                  Marca a los usuarios como desarrolladores y gestiona desde <strong>Parámetros &gt; Agenda interna</strong>. Ahí mismo podrás ver quién tiene acceso a la agenda y ajustar sus permisos.
                </p>
                <p className="small mb-2">
                  Los enlaces personales de Zoom o Microsoft Teams se guardan en el módulo <strong>Integraciones</strong>. 
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
                    disabled={availableProviders.length === 0}
                  >
                    {availableProviders.length === 0 && <option value="google_meet">Sin proveedores configurados</option>}
                    {availableProviders.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedAgente && availableProviders.length === 0 && (
                  <div className="col-12">
                    <div className="alert alert-warning small mb-0">
                      Este usuario no tiene integraciones activas para agendar. Ve a <strong>Integraciones</strong> para conectar Google Calendar o guardar enlaces personales.
                    </div>
                  </div>
                )}
                {selectedAgente && selectedAgente.googleMeetAutoEnabled === false && (
                  <div className="col-12">
                    <div className="alert alert-warning small mb-0">
                      Este agente tiene deshabilitada la generación automática de Google Meet. Activa la integración en <strong>Integraciones</strong> antes de agendar.
                    </div>
                  </div>
                )}

                {form.meetingProvider === 'zoom' && (
                  <div className="col-12">
                    {selectedAgente?.zoomManual?.meetingUrl ? (
                      <div className="alert alert-secondary small mb-0">
                        Se usará el enlace personal guardado para {selectedAgente.nombre || selectedAgente.email}.
                        <div className="mt-1 text-break">{selectedAgente.zoomManual.meetingUrl}</div>
                        {selectedAgente.zoomManual?.meetingId && (
                          <div className="mt-1">ID: {selectedAgente.zoomManual.meetingId}</div>
                        )}
                        {selectedAgente.zoomManual?.meetingPassword && (
                          <div className="mt-1">Contraseña: {selectedAgente.zoomManual.meetingPassword}</div>
                        )}
                      </div>
                    ) : selectedAgente?.zoomLegacy ? (
                      <div className="alert alert-warning small mb-0">
                        Este usuario tiene una conexión antigua de Zoom. Guarda un enlace personal actualizado en <strong>Integraciones</strong> antes de agendar.
                      </div>
                    ) : (
                      <div className="alert alert-warning small mb-0">
                        No hay enlace personal de Zoom guardado para este usuario. Regístralo en <strong>Integraciones</strong> para agendar con Zoom.
                      </div>
                    )}
                  </div>
                )}

                {form.meetingProvider === 'teams' && (
                  <div className="col-12">
                    {selectedAgente?.teamsManual?.meetingUrl ? (
                      <div className="alert alert-secondary small mb-0">
                        Se usará el enlace de Teams guardado para {selectedAgente.nombre || selectedAgente.email}.
                        <div className="mt-1 text-break">{selectedAgente.teamsManual.meetingUrl}</div>
                        {selectedAgente.teamsManual?.meetingId && (
                          <div className="mt-1">ID: {selectedAgente.teamsManual.meetingId}</div>
                        )}
                        {selectedAgente.teamsManual?.meetingPassword && (
                          <div className="mt-1">Contraseña: {selectedAgente.teamsManual.meetingPassword}</div>
                        )}
                      </div>
                    ) : (
                      <div className="alert alert-warning small mb-0">
                        No hay un enlace de Teams guardado para este usuario. Regístralo en <strong>Integraciones</strong> antes de agendar con este proveedor.
                      </div>
                    )}
                  </div>
                )}

                <div className="col-12">
                  <div className="d-flex justify-content-between align-items-center">
                    <label className="form-label small mb-0">Prospecto *</label>
                    {selectedProspect && (
                      <button type="button" className="btn btn-link btn-sm p-0" onClick={handleClearProspect}>
                        Quitar selección
                      </button>
                    )}
                  </div>
                  <div className="mb-2">
                    <div className="input-group input-group-sm">
                      <input
                        type="search"
                        className="form-control form-control-sm"
                        placeholder="Buscar por nombre, email o teléfono"
                        value={prospectQuery}
                        onChange={(e) => setProspectQuery(e.target.value)}
                        aria-label="Buscar prospecto"
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        title="Limpiar búsqueda"
                        onClick={() => { setProspectQuery(''); setDebouncedProspectQuery('') }}
                      >
                        ✕
                      </button>
                      <span className="input-group-text">
                        {prospectOptionsLoading ? (
                          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        ) : (
                          <span className="text-muted small">&nbsp;</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div
                      role="combobox"
                      aria-expanded={showProspectSuggestions}
                      aria-haspopup="listbox"
                      aria-busy={prospectOptionsLoading}
                      aria-controls="prospect-suggestions-list"
                    >
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder={prospectOptionsLoading ? 'Cargando prospectos…' : 'Selecciona o busca un prospecto'}
                        value={selectedProspect ? selectedProspect.nombre ?? '' : prospectQuery}
                        onChange={(e) => {
                          setProspectQuery(e.target.value)
                          setShowProspectSuggestions(true)
                          setHighlightedProspectIndex(-1)
                        }}
                        onFocus={() => setShowProspectSuggestions(true)}
                        onKeyDown={(e) => {
                          const flat = prospectOptions || []
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            setHighlightedProspectIndex((i) => Math.min(i + 1, flat.length - 1))
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            setHighlightedProspectIndex((i) => Math.max(i - 1, 0))
                          } else if (e.key === 'Enter') {
                            if (highlightedProspectIndex >= 0 && highlightedProspectIndex < flat.length) {
                              e.preventDefault()
                              const opt = flat[highlightedProspectIndex]
                              handleSelectProspect(opt)
                              setShowProspectSuggestions(false)
                            }
                          } else if (e.key === 'Escape') {
                            setShowProspectSuggestions(false)
                          }
                        }}
                        aria-autocomplete="list"
                        aria-controls="prospect-suggestions-list"
                        aria-busy={prospectOptionsLoading}
                        disabled={prospectOptionsLoading}
                      />

                      {/* Show inline small spinner when loading so user understands to wait */}
                      {prospectOptionsLoading && (
                        <div className="small text-muted mt-1 d-flex align-items-center" aria-hidden>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Cargando prospectos…
                        </div>
                      )}
                    </div>

                    {/* If loading and no options yet, show a small skeleton list to improve perceived performance */}
                    {prospectOptionsLoading && (!prospectOptions || prospectOptions.length === 0) && (
                      <ul className="list-group mt-1" style={{ maxHeight: 200, overflowY: 'auto' }} aria-hidden>
                        {[1, 2, 3].map((i) => (
                          <li key={i} className="list-group-item">
                            <div style={{ background: '#e9ecef', height: 12, width: '60%', borderRadius: 4 }} />
                            <div style={{ height: 8 }} />
                            <div style={{ background: '#f8f9fa', height: 10, width: '40%', borderRadius: 4 }} />
                          </li>
                        ))}
                      </ul>
                    )}

                    {showProspectSuggestions && (prospectOptions && prospectOptions.length > 0) && (
                      <ul id="prospect-suggestions-list" role="listbox" className="list-group mt-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {prospectOptions.map((option, idx) => (
                          <li
                            key={option.id}
                            role="option"
                            aria-selected={highlightedProspectIndex === idx}
                            className={`list-group-item list-group-item-action ${highlightedProspectIndex === idx ? 'active' : ''}`}
                            onMouseDown={() => { handleSelectProspect(option); setShowProspectSuggestions(false) }}
                            onMouseEnter={() => setHighlightedProspectIndex(idx)}
                          >
                            <div className="fw-semibold">{option.nombre || 'Sin nombre'}</div>
                            <div className="small text-muted">{option.email || 'Sin correo'} · {option.telefono || ''}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="form-text">La lista incluye prospectos recientes y de semanas anteriores. Completa o corrige la información si hace falta.</div>
                  {prospectOptionsLoading && <div className="text-muted small mt-1">Cargando prospectos…</div>}
                  {prospectOptionsError && <div className="text-danger small mt-1">{prospectOptionsError}</div>}
                  {selectedProspect && (
                    <div className="alert alert-success small mt-2 mb-0">
                      <div className="d-flex flex-column">
                        <span className="fw-semibold">{selectedProspect.nombre || 'Sin nombre registrado'}</span>
                        <span>{selectedProspect.email || 'Sin correo'}</span>
                        <span className="text-muted">Estado: {formatProspectEstado(selectedProspect.estado)}</span>
                        {selectedProspect.fecha_cita && (
                          <span className="text-muted">Última cita: {formatDateTime(selectedProspect.fecha_cita)}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <input type="hidden" value={form.prospectoId} readOnly />

                <div className="col-md-6">
                  <label className="form-label small">Nombre del prospecto *</label>
                  <input
                    className="form-control form-control-sm"
                    value={form.prospectoNombre}
                    readOnly
                    placeholder="Selecciona un prospecto"
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label small">Correo del prospecto *</label>
                  <input
                    className="form-control form-control-sm"
                    value={form.prospectoEmail}
                    onChange={(e) => setForm((prev) => ({ ...prev, prospectoEmail: e.target.value }))}
                    placeholder="correo@ejemplo.com"
                    type="email"
                    required
                    readOnly={prospectEmailLocked}
                  />
                  {prospectEmailLocked && (
                    <button
                      type="button"
                      className="btn btn-link btn-sm px-0"
                      onClick={() => setProspectEmailLocked(false)}
                    >
                      Editar correo
                    </button>
                  )}
                </div>

                <div className="col-12">
                  <label className="form-label small">Notas internas</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={form.notas}
                    onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))}
                    placeholder="Contexto, etc."
                  />
                </div>

                <div className="col-12 d-flex flex-wrap gap-2 align-items-center">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !hasCheckedAvailability}>
                    {creating ? 'Creando cita…' : 'Crear cita'}
                  </button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleCheckAvailability} disabled={slotsLoading}>
                    {slotsLoading ? 'Consultando…' : 'Ver disponibilidad'}
                  </button>
                  {!hasCheckedAvailability && (
                    <span className="text-danger small">Verifica disponibilidad antes de crear la cita.</span>
                  )}
                </div>
              </form>

              {slotsError && <div className="alert alert-danger mt-3 py-2 small">{slotsError}</div>}
              {slots && (
                <div className="mt-3">
                  <h6 className="small text-uppercase text-muted mb-1">Horarios ocupados en el rango seleccionado</h6>
                  {availabilityRangeLabel && <div className="text-muted small mb-2">{availabilityRangeLabel}</div>}
                  {busySlotsInRange.length === 0 && <div className="text-muted small">No se encontraron conflictos en el rango seleccionado.</div>}
                  {busySlotsInRange.length > 0 && (
                    <ul className="list-group list-group-flush small">
                      {busySlotsInRange.map((slot) => {
                        const owner = developerMap.get(slot.usuarioId)
                        const sourceDetails = slot.sourceDetails && slot.sourceDetails.length > 0
                          ? slot.sourceDetails
                          : [
                              {
                                source: slot.source,
                                title: slot.title ?? null,
                                descripcion: slot.descripcion ?? null,
                                provider: slot.provider ?? null,
                                prospectoId: slot.prospectoId ?? null,
                                citaId: slot.citaId ?? null,
                                planId: slot.planId ?? null
                              }
                            ]

                        const seenBadges = new Set<string>()
                        const badgeElements = sourceDetails.flatMap((detail, index) => {
                          const base = slotSourceLabels[detail.source as keyof typeof slotSourceLabels] || detail.source
                          const extras: string[] = []
                          if (detail.source === 'agenda' && detail.citaId != null) {
                            extras.push(`Cita #${detail.citaId}`)
                          }
                          if (detail.source === 'calendar' && detail.citaId != null) {
                            extras.push(`Sincronizada con cita #${detail.citaId}`)
                          }
                          if (detail.source === 'planificacion' && detail.planId != null) {
                            extras.push(`Plan #${detail.planId}`)
                          }
                          const label = extras.length ? `${base} · ${extras.join(' · ')}` : base
                          if (seenBadges.has(label)) return []
                          seenBadges.add(label)
                          return [
                            <span key={`${slot.usuarioId}-${slot.inicio}-${slot.fin}-badge-${detail.source}-${index}`} className="badge text-bg-light border">
                              {label}
                            </span>
                          ]
                        })

                        const providerLabel = formatMeetingProviderLabel(
                          slot.provider ?? sourceDetails.find((detail) => detail.provider)?.provider
                        )

                        const prospectoIds = new Set<number>()
                        for (const detail of sourceDetails) {
                          if (detail.prospectoId != null) {
                            prospectoIds.add(detail.prospectoId)
                          }
                        }
                        if (slot.prospectoId != null) {
                          prospectoIds.add(slot.prospectoId)
                        }
                        const prospectoLabel = prospectoIds.size
                          ? `Prospecto ${Array.from(prospectoIds).map((id) => `#${id}`).join(', ')}`
                          : null

                        const titleParts = Array.from(
                          new Set(
                            sourceDetails
                              .map((detail) => (detail.title || '').trim())
                              .filter((value): value is string => value.length > 0)
                          )
                        )

                        const descriptionParts = Array.from(
                          new Set(
                            sourceDetails
                              .map((detail) => (detail.descripcion || '').trim())
                              .filter((value): value is string => value.length > 0)
                          )
                        )

                        const metaFragments: string[] = []
                        if (providerLabel) {
                          metaFragments.push(`Plataforma: ${providerLabel}`)
                        }
                        if (prospectoLabel) {
                          metaFragments.push(prospectoLabel)
                        }
                        metaFragments.push(...titleParts)
                        if (descriptionParts.length > 0) {
                          for (const fragment of descriptionParts) {
                            if (!metaFragments.includes(fragment)) {
                              metaFragments.push(fragment)
                            }
                          }
                        }

                        const metaElements = metaFragments.map((fragment, index) => (
                          <span key={`${slot.usuarioId}-${slot.inicio}-${slot.fin}-meta-${index}`} className="text-break">
                            {fragment}
                          </span>
                        ))

                        const key = `${slot.usuarioId}-${slot.inicio}-${slot.fin}`
                        return (
                          <li key={key} className="list-group-item px-0">
                            <div className="d-flex justify-content-between align-items-start gap-3">
                              <div>
                                <div className="fw-semibold">{owner?.nombre || owner?.email || `Usuario #${slot.usuarioId}`}</div>
                                {badgeElements.length > 0 && (
                                  <div className="small text-muted mt-1 d-flex flex-wrap align-items-center gap-2">
                                    {badgeElements}
                                  </div>
                                )}
                                {metaElements.length > 0 && (
                                  <div className="small text-muted mt-1 d-flex flex-wrap align-items-center gap-2">
                                    {metaElements}
                                  </div>
                                )}
                              </div>
                              <div className="text-muted small text-end">
                                {formatDateTimeRangeDetailed(slot.inicio, slot.fin)}
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
      {showConnectModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center" style={{ zIndex: 1050 }}>
          <div className="bg-white rounded shadow p-4" role="dialog" aria-modal="true" style={{ maxWidth: 420, width: '90%' }}>
            <h5 className="fw-semibold">Conecta Google Calendar</h5>
            <p className="small mb-3">
              Para usar la agenda interna necesitas conectar tu calendario de Google desde el módulo <strong>Integraciones</strong>. Una vez vinculado podrás generar enlaces automáticos.
            </p>
            <div className="d-flex justify-content-end">
              <button type="button" className="btn btn-primary btn-sm" onClick={handleConnectModalAction}>
                Ir a Integraciones
              </button>
            </div>
          </div>
        </div>
      )}
    </BasePage>
  )
}
