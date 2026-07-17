'use client'

import { useEffect, useMemo, useState } from 'react'
import BasePage from '@/components/BasePage'
import { useAuth } from '@/context/AuthProvider'
import { getAgendaDevelopers } from '@/lib/api'
import type { AgendaDeveloper, Questionnaire, QuestionnaireLink } from '@/types'

interface EventType {
  id: number
  title: string
  slug: string
  lengthInMinutes: number
  bookingUrl?: string
}

export default function QuestionnaireLinksPage() {
  const { user } = useAuth()
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([])
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [links, setLinks] = useState<QuestionnaireLink[]>([])
  const [agents, setAgents] = useState<AgendaDeveloper[]>([])
  const [targetAgentId, setTargetAgentId] = useState('')
  const [questionnaireId, setQuestionnaireId] = useState('')
  const [eventTypeId, setEventTypeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'danger' | 'warning'; message: string } | null>(null)
  const [lastUrl, setLastUrl] = useState<string | null>(null)

  const canChooseAgent = user?.rol === 'admin' || user?.rol === 'supervisor'

  async function load(agentId: string) {
    setLoading(true)
    try {
      const targetQuery = agentId ? `?usuario_id=${encodeURIComponent(agentId)}` : ''
      const linkQuery = agentId ? `?agente_id=${encodeURIComponent(agentId)}` : ''
      const [questionnaireResponse, eventResponse, linksResponse, calStatusResponse] = await Promise.all([
        fetch('/api/cuestionarios?active=1', { cache: 'no-store' }),
        fetch(`/api/integraciones/calcom/event-types${targetQuery}`, { cache: 'no-store' }),
        fetch(`/api/cuestionarios/links${linkQuery}`, { cache: 'no-store' }),
        agentId === String(user?.id)
          ? fetch('/api/integraciones/calcom', { cache: 'no-store' })
          : Promise.resolve(null)
      ])
      const questionnaireJson = await questionnaireResponse.json()
      const eventJson = await eventResponse.json()
      const linksJson = await linksResponse.json()
      if (!questionnaireResponse.ok) throw new Error(questionnaireJson.error || 'No se pudieron cargar los cuestionarios')
      if (!linksResponse.ok) throw new Error(linksJson.error || 'No se pudieron cargar tus enlaces')
      setQuestionnaires(questionnaireJson.questionnaires || [])
      setLinks(linksJson.links || [])
      if (eventResponse.ok) {
        setEventTypes(eventJson.eventTypes || [])
        if (eventJson.default_event_type_id) {
          setEventTypeId(String(eventJson.default_event_type_id))
        } else if (calStatusResponse?.ok) {
          const statusJson = await calStatusResponse.json() as { default_event_type_id?: number | null }
          setEventTypeId(statusJson.default_event_type_id ? String(statusJson.default_event_type_id) : '')
        } else {
          setEventTypeId('')
        }
      } else {
        setNotice({ type: 'warning', message: eventJson.error || 'Conecta tu cuenta de Cal.com para generar enlaces' })
      }
    } catch (error) {
      setNotice({ type: 'danger', message: error instanceof Error ? error.message : 'No se pudo cargar el módulo' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.id) return
    const initialAgentId = String(user.id)
    setTargetAgentId(initialAgentId)
    void load(initialAgentId)
    if (user.rol === 'admin' || user.rol === 'supervisor') {
      void getAgendaDevelopers({ soloActivos: true })
        .then(rows => {
          const availableAgents = rows.filter(row => row.rol === 'agente' || row.rol === 'supervisor')
          setAgents(availableAgents)
          if (!availableAgents.some(row => String(row.id) === initialAgentId) && availableAgents[0]) {
            const fallbackAgentId = String(availableAgents[0].id)
            setTargetAgentId(fallbackAgentId)
            void load(fallbackAgentId)
          }
        })
        .catch(() => setAgents([]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.rol])

  const selectedEvent = useMemo(
    () => eventTypes.find(event => event.id === Number(eventTypeId)),
    [eventTypeId, eventTypes]
  )

  async function generate() {
    if (!questionnaireId || !eventTypeId) {
      setNotice({ type: 'warning', message: 'Selecciona un cuestionario y configura el evento predeterminado de Cal.com en Integraciones' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const response = await fetch('/api/cuestionarios/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionnaire_id: questionnaireId,
          agente_id: Number(targetAgentId)
        })
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudo generar el enlace')
      setLastUrl(json.public_url)
      setNotice({ type: 'success', message: 'Enlace generado correctamente' })
      await load(targetAgentId)
    } catch (error) {
      setNotice({ type: 'danger', message: error instanceof Error ? error.message : 'No se pudo generar el enlace' })
    } finally {
      setSaving(false)
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url)
    setNotice({ type: 'success', message: 'Enlace copiado' })
  }

  async function deactivateLink(link: QuestionnaireLink) {
    const shouldDeactivate = window.confirm('¿Quitar este enlace activo? El enlace dejará de funcionar, pero se conservará el historial.')
    if (!shouldDeactivate) return

    setDeactivatingId(link.id)
    setNotice(null)
    try {
      const response = await fetch('/api/cuestionarios/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: link.id, activo: false })
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || 'No se pudo quitar el enlace')
      setLinks(current => current.filter(item => item.id !== link.id))
      setNotice({ type: 'success', message: 'Enlace desactivado correctamente' })
    } catch (error) {
      setNotice({ type: 'danger', message: error instanceof Error ? error.message : 'No se pudo quitar el enlace' })
    } finally {
      setDeactivatingId(null)
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <BasePage
      title="Cuestionarios para prospectos"
      alert={notice ? { type: notice.type, message: notice.message, show: true } : undefined}
    >
      {loading ? (
        <div className="text-center py-5"><span className="spinner-border" /></div>
      ) : (
        <div className="row g-4">
          <div className="col-12 col-lg-5">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <h5 className="card-title">Generar enlace</h5>
                <p className="text-muted small">El prospecto quedará asociado con el agente y con el evento predeterminado de Cal.com configurado en Integraciones.</p>
                {canChooseAgent && (
                  <div className="mb-3">
                    <label className="form-label">Agente responsable</label>
                    <select
                      className="form-select"
                      value={targetAgentId}
                      onChange={event => {
                        const nextAgentId = event.target.value
                        setTargetAgentId(nextAgentId)
                        setEventTypeId('')
                        setLastUrl(null)
                        void load(nextAgentId)
                      }}
                    >
                      {agents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.nombre || agent.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mb-3">
                  <label className="form-label">Cuestionario</label>
                  <select className="form-select" value={questionnaireId} onChange={event => setQuestionnaireId(event.target.value)}>
                    <option value="">Seleccionar…</option>
                    {questionnaires.map(questionnaire => (
                      <option key={questionnaire.id} value={questionnaire.id}>{questionnaire.titulo}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Evento de Cal.com</label>
                  {selectedEvent ? (
                    <div className="border rounded px-3 py-2 bg-light">
                      <div className="fw-semibold">
                        {selectedEvent.title}{selectedEvent.lengthInMinutes ? ` · ${selectedEvent.lengthInMinutes} min` : ''}
                      </div>
                      {selectedEvent.bookingUrl && <div className="small text-muted text-break">{selectedEvent.bookingUrl}</div>}
                      <div className="small text-muted">Se toma del evento predeterminado configurado en Integraciones.</div>
                    </div>
                  ) : (
                    <div className="alert alert-warning small mb-0">
                      Configura el evento predeterminado de Cal.com del agente en Integraciones.
                    </div>
                  )}
                </div>
                <button className="btn btn-primary" type="button" onClick={() => void generate()} disabled={saving || !eventTypeId}>
                  {saving ? 'Generando…' : 'Generar enlace personalizado'}
                </button>
                {lastUrl && (
                  <div className="input-group mt-3">
                    <input className="form-control" value={lastUrl} readOnly />
                    <button className="btn btn-outline-primary" type="button" onClick={() => void copy(lastUrl)}>Copiar</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-7">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <h5 className="card-title">Enlaces activos</h5>
                <div className="alert alert-info small py-2 mb-3">
                  <div className="fw-semibold mb-1">Qué significa “Avance”:</div>
                  <div className="d-flex flex-wrap gap-2">
                    <span><span className="badge text-bg-light border">A</span> aperturas del enlace</span>
                    <span><span className="badge text-bg-light border">R</span> respuestas enviadas</span>
                    <span><span className="badge text-bg-light border">S</span> simulaciones PPR completadas</span>
                    <span><span className="badge text-bg-light border">C</span> citas agendadas</span>
                  </div>
                  <div className="text-muted mt-1">Puedes quitar un enlace para que deje de funcionar sin perder su historial.</div>
                </div>
                {links.length === 0 ? (
                  <p className="text-muted">No tienes enlaces activos.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle">
                      <thead>
                        <tr>
                          <th>Cuestionario</th>
                          <th>Agente</th>
                          <th>Evento</th>
                          <th title="Aperturas / respuestas / simulaciones / citas">Avance</th>
                          <th>Fecha</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {links.map(link => {
                          const questionnaire = Array.isArray(link.questionnaire)
                            ? link.questionnaire[0]
                            : link.questionnaire
                          const agent = Array.isArray(link.agente)
                            ? link.agente[0]
                            : link.agente
                          const url = `${origin}/ppr/${link.token}`
                          return (
                            <tr key={link.id}>
                              <td>{questionnaire?.titulo || 'Cuestionario'}</td>
                              <td>
                                <div className="fw-semibold">{agent?.nombre || 'Sin nombre'}</div>
                                {agent?.email && <div className="small text-muted">{agent.email}</div>}
                                <div className="small text-muted">Código: {link.agent_code}</div>
                              </td>
                              <td>{link.cal_event_title || 'Evento Cal.com'}</td>
                              <td>
                                <span className="badge text-bg-light border me-1" title="Aperturas">
                                  A {link.views_count || 0}
                                </span>
                                <span className="badge text-bg-light border me-1" title="Respuestas">
                                  R {link.stats?.responses || 0}
                                </span>
                                <span className="badge text-bg-light border me-1" title="Simulaciones">
                                  S {link.stats?.simulations || 0}
                                </span>
                                <span className="badge text-bg-light border" title="Citas">
                                  C {link.stats?.bookings || 0}
                                </span>
                              </td>
                              <td>{new Date(link.created_at).toLocaleDateString('es-MX')}</td>
                              <td className="text-end text-nowrap">
                                <button className="btn btn-outline-primary btn-sm me-2" type="button" onClick={() => void copy(url)}>Copiar</button>
                                <button
                                  className="btn btn-outline-danger btn-sm"
                                  type="button"
                                  onClick={() => void deactivateLink(link)}
                                  disabled={deactivatingId === link.id}
                                >
                                  {deactivatingId === link.id ? 'Quitando…' : 'Quitar'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </BasePage>
  )
}
