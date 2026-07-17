'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import type { QuestionnaireQuestion, QuestionnaireSection } from '@/types'
import type { PprPlanKey, PprResult } from '@/lib/pprCalculator'

interface PublicFlow {
  questionnaire: {
    id: string
    titulo: string
    descripcion?: string | null
    secciones: QuestionnaireSection[]
    requiere_ppr: boolean
    version: number
  }
  agent: { code: string; name?: string | null }
  event: { id?: number | null; title?: string | null; booking_url?: string | null }
}

interface Contact {
  nombre: string
  email: string
  telefono: string
  edad: number
}

interface CalcomSlotOption {
  start: string
  end?: string | null
}

const money = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const udi = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

const CDMX_TIME_ZONE = 'America/Mexico_City'
const SLOT_LOOKAHEAD_DAYS = 14
const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: CDMX_TIME_ZONE })
const timeFormatter = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: CDMX_TIME_ZONE })
const slotDateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: CDMX_TIME_ZONE
})

function flattenCalcomSlots(raw: unknown): CalcomSlotOption[] {
  if (!raw || typeof raw !== 'object') return []
  return Object.values(raw as Record<string, unknown>)
    .flatMap(value => Array.isArray(value) ? value : [])
    .map((slot): CalcomSlotOption | null => {
      if (!slot || typeof slot !== 'object') return null
      const record = slot as Record<string, unknown>
      const start = typeof record.start === 'string'
        ? record.start
        : typeof record.time === 'string'
          ? record.time
          : typeof record.startTime === 'string'
            ? record.startTime
            : null
      if (!start) return null
      return {
        start,
        end: typeof record.end === 'string'
          ? record.end
          : typeof record.endTime === 'string'
            ? record.endTime
            : null
      }
    })
    .filter((slot): slot is CalcomSlotOption => Boolean(slot))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

function slotDateKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  return slotDateKeyFormatter.format(date)
}

function formatSlotDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return dateFormatter.format(date)
}

function formatSlotTime(slot: CalcomSlotOption): string {
  const start = new Date(slot.start)
  const end = slot.end ? new Date(slot.end) : null
  if (Number.isNaN(start.getTime())) return slot.start
  if (end && !Number.isNaN(end.getTime())) {
    return `${timeFormatter.format(start)} - ${timeFormatter.format(end)}`
  }
  return timeFormatter.format(start)
}

export default function PublicPprFlowPage() {
  const { token } = useParams<{ token: string }>()
  const [flow, setFlow] = useState<PublicFlow | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [plan, setPlan] = useState<PprPlanKey>('65')
  const [ppr, setPpr] = useState<PprResult | null>(null)
  const [booking, setBooking] = useState<{ start: string; end: string; meetingUrl: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [availableSlots, setAvailableSlots] = useState<CalcomSlotOption[]>([])
  const [selectedSlotDate, setSelectedSlotDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<CalcomSlotOption | null>(null)

  useEffect(() => {
    fetch(`/api/public/cuestionarios/${token}`, { cache: 'no-store' })
      .then(async response => {
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'El enlace no está disponible')
        setFlow(json)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'El enlace no está disponible'))
      .finally(() => setLoading(false))
  }, [token])

  const progress = step === 1 ? 25 : step === 2 ? 50 : step === 3 ? 75 : 100
  const slotGroups = useMemo(() => {
    const groups = new Map<string, CalcomSlotOption[]>()
    for (const slot of availableSlots) {
      const key = slotDateKey(slot.start)
      const current = groups.get(key) || []
      current.push(slot)
      groups.set(key, current)
    }
    return Array.from(groups.entries()).map(([date, slots]) => ({
      date,
      label: formatSlotDate(slots[0]?.start || date),
      slots
    }))
  }, [availableSlots])
  const visibleSlots = useMemo(() => {
    if (!selectedSlotDate) return slotGroups[0]?.slots || []
    return slotGroups.find(group => group.date === selectedSlotDate)?.slots || []
  }, [selectedSlotDate, slotGroups])

  useEffect(() => {
    if (step !== 3 || !flow?.event.id) return
    let cancelled = false
    const start = new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + SLOT_LOOKAHEAD_DAYS)
    end.setHours(23, 59, 59, 999)
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: CDMX_TIME_ZONE
    })

    setSlotsLoading(true)
    setSlotsError(null)
    setAvailableSlots([])
    setSelectedSlot(null)
    fetch(`/api/public/cuestionarios/${token}/slots?${params}`, { cache: 'no-store' })
      .then(async response => {
        const json = await response.json()
        if (!response.ok) throw new Error(json.error || 'No se pudo cargar la disponibilidad')
        const nextSlots = flattenCalcomSlots(json.slots || {})
        if (cancelled) return
        setAvailableSlots(nextSlots)
        setSelectedSlotDate(nextSlots[0] ? slotDateKey(nextSlots[0].start) : null)
        if (!nextSlots.length) {
          setSlotsError('No hay horarios disponibles por el momento. Intenta nuevamente más tarde.')
        }
      })
      .catch(err => {
        if (!cancelled) setSlotsError(err instanceof Error ? err.message : 'No se pudo cargar la disponibilidad')
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })

    return () => { cancelled = true }
  }, [flow?.event.id, step, token])

  async function submitQuestionnaire(event: React.FormEvent) {
    event.preventDefault()
    if (!acceptedPrivacy) {
      setError('Acepta el aviso de privacidad para continuar')
      return
    }
    setWorking(true)
    setError(null)
    try {
      const response = await fetch(`/api/public/cuestionarios/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', answers })
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudieron guardar tus respuestas')
      setSubmissionId(json.submission_id)
      setContact(json.contact)
      setStep(json.requiere_ppr ? 2 : 3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar tus respuestas')
    } finally {
      setWorking(false)
    }
  }

  async function simulate() {
    if (!contact || !submissionId) return
    setWorking(true)
    setError(null)
    try {
      const response = await fetch(`/api/public/cuestionarios/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ppr', submission_id: submissionId, ppr_plan: plan })
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudo guardar la simulación')
      setPpr(json.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular la simulación')
    } finally {
      setWorking(false)
    }
  }

  async function continueToSchedule() {
    if (!submissionId) return
    setWorking(true)
    setError(null)
    try {
      const response = await fetch(`/api/public/cuestionarios/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare_booking', submission_id: submissionId })
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudo preparar el prospecto para agendar')
      if (json.contact) setContact(json.contact)
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar el prospecto para agendar')
    } finally {
      setWorking(false)
    }
  }

  async function bookSelectedSlot() {
    if (!submissionId || !selectedSlot) {
      setError('Selecciona un horario disponible para agendar')
      return
    }
    setWorking(true)
    setError(null)
    try {
      const response = await fetch(`/api/public/cuestionarios/${token}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: submissionId,
          start: selectedSlot.start,
          end: selectedSlot.end || null,
          timeZone: CDMX_TIME_ZONE
        })
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudo crear la cita en Cal.com')
      setBooking({
        start: json.booking?.start || selectedSlot.start,
        end: json.booking?.end || selectedSlot.end || selectedSlot.start,
        meetingUrl: json.booking?.meetingUrl || ''
      })
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cita en Cal.com')
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <main className="container py-5 text-center"><span className="spinner-border" /></main>
  if (!flow) return <main className="container py-5"><div className="alert alert-danger">{error || 'El enlace no está disponible'}</div></main>

  return (
    <main className="container py-4 py-md-5" style={{ maxWidth: 850 }}>
      <div className="text-center mb-4">
        <h1 className="h3 fw-bold">{flow.questionnaire.titulo}</h1>
        {flow.questionnaire.descripcion && <p className="text-muted">{flow.questionnaire.descripcion}</p>}
        <p className="small mb-2">Asesor: <strong>{flow.agent.name || flow.agent.code}</strong></p>
        <div className="progress" style={{ height: 8 }}>
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {step === 1 && (
        <form onSubmit={submitQuestionnaire} className="d-flex flex-column gap-3">
          {flow.questionnaire.secciones.map(section => (
            <section className="card border-0 shadow-sm" key={section.id}>
              <div className="card-body">
                <h2 className="h5">{section.titulo}</h2>
                {section.descripcion && <p className="text-muted small">{section.descripcion}</p>}
                <div className="row g-3">
                  {section.preguntas.map(question => (
                    <div className="col-12" key={question.id}>
                      <QuestionField question={question} value={answers[question.id]} onChange={value => setAnswers(current => ({ ...current, [question.id]: value }))} />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
          <div className="form-check">
            <input id="privacy" type="checkbox" className="form-check-input" checked={acceptedPrivacy} onChange={event => setAcceptedPrivacy(event.target.checked)} />
            <label htmlFor="privacy" className="form-check-label small">Acepto el aviso de privacidad y el uso de mis datos para recibir asesoría.</label>
          </div>
          <button className="btn btn-primary btn-lg" disabled={working}>{working ? 'Guardando…' : 'Continuar a mi simulación'}</button>
        </form>
      )}

      {step === 2 && contact && (
        <section className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h2 className="h4">Simulación de tu PPR</h2>
            <p className="text-muted">Calcularemos una referencia para {contact.nombre}, con edad de {contact.edad} años.</p>
            <label className="form-label">Selecciona un plazo</label>
            <select className="form-select mb-3" value={plan} onChange={event => { setPlan(event.target.value as PprPlanKey); setPpr(null) }}>
              <option value="65">Aportaciones hasta los 65 años</option>
              <option value="15">Plan de 15 años</option>
              <option value="10">Plan de 10 años</option>
            </select>
            <button className="btn btn-primary" type="button" onClick={() => void simulate()} disabled={working}>{working ? 'Calculando…' : 'Calcular'}</button>
            {ppr && (
              <div className="mt-4">
                <div className="alert alert-info">
                  <div className="fw-semibold">Plan: {ppr.planNombre}</div>
                  <div>Pagarás durante <strong>{ppr.aniosPago} años</strong> y recibirás tu ahorro a los 65 años.</div>
                  <div className="small text-muted mt-1">
                    Montos estimados en MXN; pueden variar según el valor observado de la UDI.
                  </div>
                </div>
                <div className="border rounded bg-white">
                  <PprRow
                    label="Aportación anual"
                    detail={`${udi.format(ppr.primaAnualUDI)} UDIs`}
                    value={money.format(ppr.primaAnualMXN)}
                  />
                  <PprRow
                    label="Aportación mensual"
                    detail={`${udi.format(ppr.primaAnualUDI / 12)} UDIs`}
                    value={money.format(ppr.primaMensualMXN)}
                  />
                  <PprRow label={`Total aportado (${ppr.aniosPago} años)`} value={money.format(ppr.totalAportadoMXN)} />
                  <PprRow label="Total recibido a los 65 (meta)" value={money.format(ppr.meta65MXN)} emphasis="success" />
                  <PprRow label="Deducción de impuestos (30% ISR)" value={money.format(ppr.deduccionISR_MXN)} />
                  <PprRow label="Total que podrás conseguir al finalizar" detail="Meta + deducción estimada" value={money.format(ppr.totalAhorroMXN)} emphasis="primary" last />
                </div>
                <p className="small text-muted mt-3 mb-0">Esta simulación es informativa y deberá validarse con tu asesor.</p>
                <button className="btn btn-success btn-lg mt-3" type="button" onClick={() => void continueToSchedule()} disabled={working}>
                  {working ? 'Preparando agenda…' : 'Agendar una sesión'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h2 className="h4">Agenda tu sesión</h2>
            <p className="text-muted">{flow.event.title || 'Sesión con tu asesor'}</p>
            {flow.event.id && contact && submissionId ? (
              <div className="d-flex flex-column gap-3">
                {slotsLoading && (
                  <div className="text-center py-4">
                    <span className="spinner-border text-primary" />
                    <div className="small text-muted mt-2">Cargando disponibilidad de Cal.com…</div>
                  </div>
                )}
                {slotsError && <div className="alert alert-warning">{slotsError}</div>}
                {!slotsLoading && slotGroups.length > 0 && (
                  <>
                    <div>
                      <div className="fw-semibold mb-2">Elige un día</div>
                      <div className="d-flex flex-wrap gap-2">
                        {slotGroups.map(group => (
                          <button
                            key={group.date}
                            type="button"
                            className={`btn btn-sm ${selectedSlotDate === group.date ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => {
                              setSelectedSlotDate(group.date)
                              setSelectedSlot(null)
                            }}
                          >
                            {group.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="fw-semibold mb-2">Elige una hora</div>
                      <div className="d-flex flex-wrap gap-2">
                        {visibleSlots.map(slot => {
                          const selected = selectedSlot?.start === slot.start
                          return (
                            <button
                              key={`${slot.start}-${slot.end || ''}`}
                              type="button"
                              className={`btn btn-sm ${selected ? 'btn-success' : 'btn-outline-primary'}`}
                              onClick={() => setSelectedSlot(slot)}
                            >
                              {formatSlotTime(slot)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    {selectedSlot && (
                      <div className="alert alert-info mb-0">
                        Horario seleccionado: <strong>{formatSlotDate(selectedSlot.start)} · {formatSlotTime(selectedSlot)}</strong>
                      </div>
                    )}
                    <button className="btn btn-success btn-lg" type="button" onClick={() => void bookSelectedSlot()} disabled={working || !selectedSlot}>
                      {working ? 'Agendando…' : 'Confirmar cita'}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="alert alert-warning">
                El evento seleccionado no tiene un enlace de reserva disponible en Cal.com.
              </div>
            )}
          </div>
        </section>
      )}

      {step === 4 && booking && (
        <section className="card border-0 shadow-sm text-center">
          <div className="card-body p-5">
            <i className="bi bi-check-circle-fill text-success display-4" />
            <h2 className="h3 mt-3">Tu sesión quedó agendada</h2>
            <p className="lead">{new Date(booking.start).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}</p>
            <p className="text-muted">Recibirás la confirmación en tu correo. La plataforma de videollamada depende del evento configurado por tu asesor.</p>
            {booking.meetingUrl && <a className="btn btn-outline-primary" href={booking.meetingUrl} target="_blank" rel="noreferrer">Ver información de la reunión</a>}
          </div>
        </section>
      )}
    </main>
  )
}


function PprRow({
  label,
  detail,
  value,
  emphasis,
  last = false
}: {
  label: string
  detail?: string
  value: string
  emphasis?: 'success' | 'primary'
  last?: boolean
}) {
  return (
    <div className={`d-flex justify-content-between align-items-center gap-3 p-3 ${last ? '' : 'border-bottom'}`}>
      <div>
        <div className="fw-semibold">{label}</div>
        {detail && <div className="small text-muted">{detail}</div>}
      </div>
      <div className={`fw-bold text-end ${emphasis ? `text-${emphasis}` : ''}`}>{value}</div>
    </div>
  )
}

function QuestionField({ question, value, onChange }: {
  question: QuestionnaireQuestion
  value: unknown
  onChange: (value: unknown) => void
}) {
  const required = question.requerida
  const common = { required, className: 'form-control', id: question.id }
  return (
    <>
      <label htmlFor={question.id} className="form-label fw-semibold">{question.etiqueta}{required && <span className="text-danger"> *</span>}</label>
      {question.tipo === 'texto_largo' ? (
        <textarea {...common} rows={3} value={String(value || '')} onChange={event => onChange(event.target.value)} />
      ) : question.tipo === 'seleccion' ? (
        <select {...common} value={String(value || '')} onChange={event => onChange(event.target.value)}>
          <option value="">Seleccionar…</option>
          {(question.opciones || []).map(option => <option value={option} key={option}>{option}</option>)}
        </select>
      ) : question.tipo === 'multiple' ? (
        <div className="d-flex flex-column gap-1">
          {(question.opciones || []).map(option => {
            const selected = Array.isArray(value) ? value.map(String) : []
            return <label className="form-check" key={option}><input className="form-check-input" type="checkbox" checked={selected.includes(option)} onChange={event => onChange(event.target.checked ? [...selected, option] : selected.filter(item => item !== option))} /><span className="form-check-label">{option}</span></label>
          })}
        </div>
      ) : question.tipo === 'booleano' ? (
        <select {...common} value={String(value ?? '')} onChange={event => onChange(event.target.value === '' ? '' : event.target.value === 'true')}>
          <option value="">Seleccionar…</option><option value="true">Sí</option><option value="false">No</option>
        </select>
      ) : (
        <input
          {...common}
          type={question.tipo === 'email' ? 'email' : question.tipo === 'telefono' ? 'tel' : question.tipo === 'numero' ? 'number' : question.tipo === 'fecha' ? 'date' : 'text'}
          placeholder={question.placeholder}
          value={String(value || '')}
          onChange={event => onChange(question.tipo === 'numero' ? Number(event.target.value) : event.target.value)}
        />
      )}
    </>
  )
}
